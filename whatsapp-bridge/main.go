package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

type ClientSession struct {
	ID        string           `json:"id"`        // JID string or temp ID
	JID       *types.JID       `json:"jid"`       // actual WhatsApp JID if authenticated
	Client    *whatsmeow.Client `json:"-"`         // Whatsmeow client instance
	Status    string           `json:"status"`    // CONNECTED, AUTH_REQUIRED, DISCONNECTED
	QRText    string           `json:"qrText"`    // current QR code string
	LastError string           `json:"lastError"` // last connection or session error
	mu        sync.Mutex
}

var (
	sessions    map[string]*ClientSession = make(map[string]*ClientSession)
	sessionsMu  sync.RWMutex
	dbContainer *sqlstore.Container
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "."
	}
	dbPath := filepath.Join(dataDir, "whatsmeow_auth.db")

	log.Printf("[Bridge] Starting Multi-Session Whatsmeow HTTP Bridge on port %s...", port)
	log.Printf("[Bridge] Using session database: %s", dbPath)

	// Optimize SQLite database before Whatsmeow starts
	log.Printf("[Bridge] Optimizing and vacuuming session database...")
	if sqldb, err := sql.Open("sqlite3", dbPath); err == nil {
		if _, err := sqldb.Exec("PRAGMA journal_mode=WAL;"); err != nil {
			log.Printf("[Bridge] DB warning: Failed to set journal_mode: %v", err)
		}
		_, _ = sqldb.Exec("PRAGMA synchronous=NORMAL;")
		_, _ = sqldb.Exec("PRAGMA auto_vacuum=FULL;")
		if _, err := sqldb.Exec("VACUUM;"); err != nil {
			log.Printf("[Bridge] DB warning: Failed to vacuum database: %v", err)
		}
		sqldb.Close()
		log.Printf("[Bridge] Session database optimized.")
	} else {
		log.Printf("[Bridge] Warning: Failed to open DB directly for optimization: %v", err)
	}

	// Initialize database Container
	container, err := sqlstore.New(context.Background(), "sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on", dbPath), waLog.Stdout("Database", "WARN", true))
	if err != nil {
		log.Fatalf("[Bridge] Failed to init session DB: %v", err)
	}
	dbContainer = container

	// Load existing sessions from database
	devices, err := dbContainer.GetAllDevices(context.Background())
	if err != nil {
		log.Printf("[Bridge] Warning: Failed to retrieve stored sessions: %v", err)
	} else {
		log.Printf("[Bridge] Found %d saved WhatsApp session(s). Connecting...", len(devices))
		for _, dev := range devices {
			go startClient(dev)
		}
	}

	// HTTP Routing
	mux := http.NewServeMux()
	mux.HandleFunc("/status", handleStatus)
	mux.HandleFunc("/session/new", handleNewSession)
	mux.HandleFunc("/session/delete", handleDeleteSession)
	mux.HandleFunc("/send", handleSend)
	mux.HandleFunc("/groups", handleGroups)
	mux.HandleFunc("/contacts", handleContacts)
	mux.HandleFunc("/join", handleJoinGroup)

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	// Handle Graceful Shutdown
	go func() {
		c := make(chan os.Signal, 1)
		signal.Notify(c, os.Interrupt, syscall.SIGTERM)
		<-c
		log.Println("[Bridge] Shutting down bridge...")
		
		sessionsMu.Lock()
		for id, sess := range sessions {
			if sess.Client != nil {
				log.Printf("[Bridge] Disconnecting session: %s", id)
				sess.Client.Disconnect()
			}
		}
		sessionsMu.Unlock()
		
		_ = dbContainer.Close()
		_ = server.Shutdown(context.Background())
	}()

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("[Bridge] HTTP server failed: %v", err)
	}
}

// ── Session Connection Handler ───────────────────────────────────────────────

func startClient(deviceStore *store.Device) {
	clientLog := waLog.Stdout("Client", "WARN", true)
	c := whatsmeow.NewClient(deviceStore, clientLog)

	sess := &ClientSession{
		Status: "DISCONNECTED",
	}

	// Determine session ID
	var id string
	if deviceStore.ID != nil {
		id = deviceStore.ID.String()
		sess.ID = id
		sess.JID = deviceStore.ID
	} else {
		id = fmt.Sprintf("temp_%d", time.Now().UnixNano())
		sess.ID = id
	}

	sessionsMu.Lock()
	sessions[id] = sess
	sessionsMu.Unlock()

	sess.Client = c

	// Handle events
	c.AddEventHandler(func(rawEvt interface{}) {
		switch rawEvt.(type) {
		case *events.Connected:
			sess.mu.Lock()
			sess.Status = "CONNECTED"
			sess.LastError = ""
			sess.QRText = ""
			// If session was temporary, migrate key in map to JID JID.String()
			if !strings.Contains(sess.ID, "@") && c.Store.ID != nil {
				oldID := sess.ID
				sess.ID = c.Store.ID.String()
				sess.JID = c.Store.ID
				
				sessionsMu.Lock()
				delete(sessions, oldID)
				sessions[sess.ID] = sess
				sessionsMu.Unlock()
				log.Printf("[Bridge] Session promoted: %s -> %s", oldID, sess.ID)
			}
			sess.mu.Unlock()
		case *events.Disconnected:
			sess.mu.Lock()
			sess.Status = "DISCONNECTED"
			sess.LastError = "Disconnected from WhatsApp server"
			sess.mu.Unlock()
		case *events.LoggedOut:
			sess.mu.Lock()
			sess.Status = "DISCONNECTED"
			sess.LastError = "Logged out from session"
			sess.QRText = ""
			sess.mu.Unlock()
			log.Printf("[Bridge] Device logged out: %s", sess.ID)
		}
	})

	if c.Store.ID == nil {
		// New device require QR code
		qrChan, err := c.GetQRChannel(context.Background())
		if err != nil {
			sess.mu.Lock()
			sess.LastError = fmt.Sprintf("Failed to get QR channel: %v", err)
			sess.mu.Unlock()
			return
		}
		err = c.Connect()
		if err != nil {
			sess.mu.Lock()
			sess.Status = "DISCONNECTED"
			sess.LastError = fmt.Sprintf("Failed to connect: %v", err)
			sess.mu.Unlock()
			return
		}
		
		sess.mu.Lock()
		sess.Status = "AUTH_REQUIRED"
		sess.mu.Unlock()

		for evt := range qrChan {
			if evt.Event == "code" {
				sess.mu.Lock()
				sess.QRText = evt.Code
				sess.mu.Unlock()
				log.Printf("[Bridge] New QR code generated for session %s", id)
			} else if evt.Event == "success" {
				sess.mu.Lock()
				sess.QRText = ""
				sess.Status = "CONNECTED"
				sess.mu.Unlock()
				log.Printf("[Bridge] Login successful for session %s", id)
			} else if evt.Event == "timeout" {
				sess.mu.Lock()
				sess.QRText = ""
				sess.Status = "DISCONNECTED"
				sess.LastError = "QR code scan timeout"
				sess.mu.Unlock()
				log.Printf("[Bridge] QR code timeout for session %s", id)
			}
		}
	} else {
		// Stored session connection
		err := c.Connect()
		if err != nil {
			sess.mu.Lock()
			sess.Status = "DISCONNECTED"
			sess.LastError = fmt.Sprintf("Failed to connect: %v", err)
			sess.mu.Unlock()
			return
		}
		
		sess.mu.Lock()
		sess.Status = "CONNECTED"
		sess.mu.Unlock()
		log.Printf("[Bridge] Session successfully reconnected: %s", id)
	}
}

// ── HTTP Routing Handlers ───────────────────────────────────────────────────

func handleStatus(w http.ResponseWriter, r *http.Request) {
	sessionsMu.RLock()
	defer sessionsMu.RUnlock()

	var list []*ClientSession = make([]*ClientSession, 0)
	for _, sess := range sessions {
		sess.mu.Lock()
		list = append(list, &ClientSession{
			ID:        sess.ID,
			JID:       sess.JID,
			Status:    sess.Status,
			QRText:    sess.QRText,
			LastError: sess.LastError,
		})
		sess.mu.Unlock()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(list)
}

func handleNewSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("[Bridge] Initializing a new WhatsApp session...")

	deviceStore := dbContainer.NewDevice()
	go startClient(deviceStore)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "Session creation initiated. Scan QR code to authenticate.",
	})
}

func handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
		http.Error(w, "Invalid body. Session 'id' required", http.StatusBadRequest)
		return
	}

	sessionsMu.Lock()
	sess, exists := sessions[req.ID]
	if exists {
		delete(sessions, req.ID)
	}
	sessionsMu.Unlock()

	if !exists {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	sess.mu.Lock()
	if sess.Client != nil {
		sess.Client.Disconnect()
	}
	
	// Delete device from Whatsmeow sqlstore database container
	if sess.JID != nil {
		log.Printf("[Bridge] Deleting device: %s from database container...", req.ID)
		devices, err := dbContainer.GetAllDevices(context.Background())
		if err == nil {
			for _, dev := range devices {
				if dev.ID != nil && dev.ID.String() == sess.JID.String() {
					err = dbContainer.DeleteDevice(context.Background(), dev)
					if err != nil {
						log.Printf("[Bridge] Warning: failed to delete device store row: %v", err)
					}
					break
				}
			}
		}
	}
	sess.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "Session successfully deleted and disconnected.",
	})
}

func handleGroups(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	
	sessionsMu.RLock()
	var selectedSess *ClientSession
	if from != "" {
		selectedSess = sessions[from]
	} else {
		// Default to the first CONNECTED session
		for _, s := range sessions {
			if s.Status == "CONNECTED" {
				selectedSess = s
				break
			}
		}
	}
	sessionsMu.RUnlock()

	if selectedSess == nil || selectedSess.Client == nil {
		http.Error(w, "No connected WhatsApp sessions found", http.StatusServiceUnavailable)
		return
	}

	groups, err := selectedSess.Client.GetJoinedGroups(context.Background())
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch groups: %v", err), http.StatusInternalServerError)
		return
	}

	type GroupItem struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		IsGroup bool   `json:"isGroup"`
	}

	var list []GroupItem = make([]GroupItem, 0)
	for _, g := range groups {
		list = append(list, GroupItem{
			ID:      g.JID.String(),
			Name:    g.Name,
			IsGroup: true,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(list)
}

func handleContacts(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")

	sessionsMu.RLock()
	var selectedSess *ClientSession
	if from != "" {
		selectedSess = sessions[from]
	} else {
		for _, s := range sessions {
			if s.Status == "CONNECTED" {
				selectedSess = s
				break
			}
		}
	}
	sessionsMu.RUnlock()

	if selectedSess == nil || selectedSess.Client == nil || selectedSess.Client.Store == nil {
		http.Error(w, "No connected WhatsApp sessions found", http.StatusServiceUnavailable)
		return
	}

	contacts, err := selectedSess.Client.Store.Contacts.GetAllContacts(r.Context())
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch contacts: %v", err), http.StatusInternalServerError)
		return
	}

	type ContactItem struct {
		JID          string `json:"jid"`
		PhoneNumber  string `json:"phoneNumber"`
		Name         string `json:"name"`
		PushName     string `json:"pushName"`
		BusinessName string `json:"businessName"`
	}

	var list []ContactItem = make([]ContactItem, 0)
	for jid, info := range contacts {
		if jid.Server == types.DefaultUserServer {
			name := info.FullName
			if name == "" {
				name = info.BusinessName
			}
			if name == "" {
				name = info.PushName
			}
			if name == "" {
				name = jid.User
			}

			list = append(list, ContactItem{
				JID:          jid.String(),
				PhoneNumber:  "+" + jid.User,
				Name:         name,
				PushName:     info.PushName,
				BusinessName: info.BusinessName,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(list)
}

func handleSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		From        string `json:"from"` // target sender JID
		To          string `json:"to"`
		Text        string `json:"text"`
		MediaPath   string `json:"mediaPath"`
		MediaBase64 string `json:"mediaBase64"`
		MediaType   string `json:"mediaType"` // "image" | "video"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.To == "" {
		http.Error(w, "Recipient ('to') is required", http.StatusBadRequest)
		return
	}

	sessionsMu.RLock()
	var selectedSess *ClientSession
	if req.From != "" {
		selectedSess = sessions[req.From]
	} else {
		// Use first connected
		for _, s := range sessions {
			if s.Status == "CONNECTED" {
				selectedSess = s
				break
			}
		}
	}
	sessionsMu.RUnlock()

	if selectedSess == nil || selectedSess.Client == nil || selectedSess.Status != "CONNECTED" {
		http.Error(w, "Target WhatsApp session is not connected", http.StatusServiceUnavailable)
		return
	}

	// Format JID
	var jid types.JID
	if strings.Contains(req.To, "@") {
		var err error
		jid, err = types.ParseJID(req.To)
		if err != nil {
			http.Error(w, fmt.Sprintf("Invalid JID: %v", err), http.StatusBadRequest)
			return
		}
	} else if strings.Contains(req.To, "-") {
		jid = types.NewJID(req.To, types.GroupServer)
	} else {
		jid = types.NewJID(req.To, types.DefaultUserServer)
	}

	var err error

	if req.MediaBase64 != "" {
		data, decodeErr := base64.StdEncoding.DecodeString(req.MediaBase64)
		if decodeErr != nil {
			log.Printf("[Bridge] Failed to decode base64: %v", decodeErr)
			http.Error(w, fmt.Sprintf("Failed to decode base64: %v", decodeErr), http.StatusBadRequest)
			return
		}
		err = sendMediaData(selectedSess.Client, jid, data, req.Text, req.MediaType)
	} else if req.MediaPath != "" {
		err = sendMedia(selectedSess.Client, jid, req.MediaPath, req.Text, req.MediaType)
	} else {
		_, err = selectedSess.Client.SendMessage(context.Background(), jid, &waE2E.Message{
			Conversation: proto.String(req.Text),
		})
	}

	if err != nil {
		log.Printf("[Bridge] Failed to send message from %s to %s: %v", selectedSess.ID, jid.String(), err)
		http.Error(w, fmt.Sprintf("Send failed: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("[Bridge] Message successfully sent from %s to %s", selectedSess.ID, jid.String())
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "Message sent successfully",
	})
}

// ── Join Group by Invite Link Handler ───────────────────────────────────────

func handleJoinGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		From       string `json:"from"`       // target sender JID
		InviteLink string `json:"inviteLink"` // WhatsApp invite link or code
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.InviteLink == "" {
		http.Error(w, "Invite link or code is required", http.StatusBadRequest)
		return
	}

	sessionsMu.RLock()
	var selectedSess *ClientSession
	if req.From != "" {
		selectedSess = sessions[req.From]
	} else {
		// Use first connected
		for _, s := range sessions {
			if s.Status == "CONNECTED" {
				selectedSess = s
				break
			}
		}
	}
	sessionsMu.RUnlock()

	if selectedSess == nil || selectedSess.Client == nil || selectedSess.Status != "CONNECTED" {
		http.Error(w, "Target WhatsApp session is not connected", http.StatusServiceUnavailable)
		return
	}

	// Parse code from link if link is passed
	// Pattern: matches chat.whatsapp.com/invite/CODE or chat.whatsapp.com/CODE
	code := req.InviteLink
	re := regexp.MustCompile(`(?:chat\.whatsapp\.com/(?:invite/)?)([a-zA-Z0-9\-]+)`)
	matches := re.FindStringSubmatch(req.InviteLink)
	if len(matches) > 1 {
		code = matches[1]
	}

	log.Printf("[Bridge] Attempting to join group using code: %s for session: %s", code, selectedSess.ID)

	jid, err := selectedSess.Client.JoinGroupWithLink(context.Background(), code)
	if err != nil {
		log.Printf("[Bridge] Join failed for code %s: %v", code, err)
		http.Error(w, fmt.Sprintf("Failed to join group: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("[Bridge] Successfully joined group: %s", jid.String())

	// Fetch details for joined group to return group name if possible
	name := "Joined Group"
	meta, err := selectedSess.Client.GetGroupInfo(context.Background(), jid)
	if err == nil && meta != nil {
		name = meta.Name
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"id":      jid.String(),
		"name":    name,
		"message": "Successfully joined group",
	})
}

// ── Media Helpers ───────────────────────────────────────────────────────────

func sendMedia(c *whatsmeow.Client, jid types.JID, path, caption, mediaType string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("failed to open media file: %w", err)
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return fmt.Errorf("failed to read media file: %w", err)
	}

	return sendMediaData(c, jid, data, caption, mediaType)
}

func sendMediaData(c *whatsmeow.Client, jid types.JID, data []byte, caption, mediaType string) error {
	mimeType := http.DetectContentType(data)

	var uploadResp whatsmeow.UploadResponse
	var err error
	if mediaType == "video" {
		uploadResp, err = c.Upload(context.Background(), data, whatsmeow.MediaVideo)
	} else {
		uploadResp, err = c.Upload(context.Background(), data, whatsmeow.MediaImage)
	}
	if err != nil {
		return fmt.Errorf("failed to upload media to WhatsApp: %w", err)
	}

	var msg waE2E.Message
	if mediaType == "video" {
		msg.VideoMessage = &waE2E.VideoMessage{
			Caption:       proto.String(caption),
			Mimetype:      proto.String(mimeType),
			URL:           proto.String(uploadResp.URL),
			DirectPath:    proto.String(uploadResp.DirectPath),
			MediaKey:      uploadResp.MediaKey,
			FileEncSHA256: uploadResp.FileEncSHA256,
			FileSHA256:    uploadResp.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
		}
	} else {
		msg.ImageMessage = &waE2E.ImageMessage{
			Caption:       proto.String(caption),
			Mimetype:      proto.String(mimeType),
			URL:           proto.String(uploadResp.URL),
			DirectPath:    proto.String(uploadResp.DirectPath),
			MediaKey:      uploadResp.MediaKey,
			FileEncSHA256: uploadResp.FileEncSHA256,
			FileSHA256:    uploadResp.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
		}
	}

	_, err = c.SendMessage(context.Background(), jid, &msg)
	return err
}
