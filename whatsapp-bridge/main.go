package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

var (
	client      *whatsmeow.Client
	dbContainer *sqlstore.Container
	qrText      string
	qrLock      sync.Mutex
	status      string = "DISCONNECTED"
	lastError   string
	statusLock  sync.Mutex
)

func setStatus(newStatus string, err string) {
	statusLock.Lock()
	defer statusLock.Unlock()
	status = newStatus
	lastError = err
	log.Printf("[Bridge] Status changed to: %s (Error: %s)", newStatus, err)
}

func getStatus() (string, string) {
	statusLock.Lock()
	defer statusLock.Unlock()
	return status, lastError
}

func setQR(qr string) {
	qrLock.Lock()
	defer qrLock.Unlock()
	qrText = qr
}

func getQR() string {
	qrLock.Lock()
	defer qrLock.Unlock()
	return qrText
}

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

	log.Printf("[Bridge] Starting Whatsmeow HTTP Bridge on port %s...", port)
	log.Printf("[Bridge] Using session database: %s", dbPath)

	// Initialize database Container
	container, err := sqlstore.New(context.Background(), "sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on", dbPath), waLog.Stdout("Database", "WARN", true))
	if err != nil {
		log.Fatalf("[Bridge] Failed to init session DB: %v", err)
	}
	dbContainer = container

	// Start WhatsApp Client Connection
	go startClient()

	// HTTP Routing
	mux := http.NewServeMux()
	mux.HandleFunc("/status", handleStatus)
	mux.HandleFunc("/qr", handleQR)
	mux.HandleFunc("/reconnect", handleReconnect)
	mux.HandleFunc("/send", handleSend)
	mux.HandleFunc("/groups", handleGroups)

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
		if client != nil {
			client.Disconnect()
		}
		_ = server.Shutdown(context.Background())
	}()

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("[Bridge] HTTP server failed: %v", err)
	}
}

func startClient() {
	setStatus("DISCONNECTED", "")
	setQR("")

	// Get first device
	deviceStore, err := dbContainer.GetFirstDevice(context.Background())
	if err != nil {
		setStatus("DISCONNECTED", fmt.Sprintf("Failed to get device from store: %v", err))
		return
	}

	clientLog := waLog.Stdout("Client", "WARN", true)
	if deviceStore == nil {
		// Create new device if not exists
		deviceStore = dbContainer.NewDevice()
		log.Println("[Bridge] No existing session found. Awaiting login/QR scan...")
	} else {
		log.Println("[Bridge] Existing session found. Authenticating...")
	}

	c := whatsmeow.NewClient(deviceStore, clientLog)
	client = c

	// Set handlers
	c.AddEventHandler(eventHandler)

	if c.Store.ID == nil {
		// No ID means we need to log in via QR
		qrChan, err := c.GetQRChannel(context.Background())
		if err != nil {
			setStatus("DISCONNECTED", fmt.Sprintf("Failed to get QR channel: %v", err))
			return
		}
		err = c.Connect()
		if err != nil {
			setStatus("DISCONNECTED", fmt.Sprintf("Failed to connect: %v", err))
			return
		}
		setStatus("AUTH_REQUIRED", "")

		for evt := range qrChan {
			if evt.Event == "code" {
				setQR(evt.Code)
				log.Println("[Bridge] New QR code generated. Awaiting scan...")
			} else if evt.Event == "success" {
				setQR("")
				setStatus("CONNECTED", "")
				log.Println("[Bridge] Login successful!")
			} else if evt.Event == "timeout" {
				setQR("")
				setStatus("DISCONNECTED", "QR code scan timeout.")
				log.Println("[Bridge] QR code scan timed out.")
			}
		}
	} else {
		// Existing session, just connect
		err = c.Connect()
		if err != nil {
			setStatus("DISCONNECTED", fmt.Sprintf("Failed to connect: %v", err))
			return
		}
		setStatus("CONNECTED", "")
	}
}

func eventHandler(rawEvt interface{}) {
	// We only care about connection events for status mapping
	switch rawEvt.(type) {
	case *events.Connected:
		setStatus("CONNECTED", "")
		setQR("")
	case *events.Disconnected:
		setStatus("DISCONNECTED", "Disconnected from WhatsApp server.")
	case *events.LoggedOut:
		setStatus("DISCONNECTED", "Logged out from session.")
		setQR("")
	}
}

// ── HTTP Endpoints ──────────────────────────────────────────────────────────

func handleStatus(w http.ResponseWriter, r *http.Request) {
	s, err := getStatus()
	qr := getQR()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    s,
		"qrText":    qr,
		"lastError": err,
	})
}

func handleQR(w http.ResponseWriter, r *http.Request) {
	qr := getQR()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"qrText": qr,
	})
}

func handleReconnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("[Bridge] Reconnection / Session Reset requested.")

	if client != nil {
		client.Disconnect()
	}

	// Wipe database files to clear out credentials
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "."
	}
	dbPath := filepath.Join(dataDir, "whatsmeow_auth.db")

	_ = dbContainer.Close()

	if _, err := os.Stat(dbPath); err == nil {
		_ = os.Remove(dbPath)
		// SQLite wal/shm cleanup if any
		_ = os.Remove(dbPath + "-wal")
		_ = os.Remove(dbPath + "-shm")
		log.Println("[Bridge] Session database cleared.")
	}

	// Reinitialize
	container, err := sqlstore.New(context.Background(), "sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on", dbPath), waLog.Stdout("Database", "WARN", true))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to re-init DB: %v", err), http.StatusInternalServerError)
		return
	}
	dbContainer = container

	go startClient()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "Reconnection initiated. Session cleared.",
	})
}

func handleGroups(w http.ResponseWriter, r *http.Request) {
	s, _ := getStatus()
	if s != "CONNECTED" || client == nil {
		http.Error(w, "WhatsApp is not connected", http.StatusServiceUnavailable)
		return
	}

	groups, err := client.GetJoinedGroups(context.Background())
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

type SendRequest struct {
	To        string `json:"to"`
	Text      string `json:"text"`
	MediaPath string `json:"mediaPath"`
	MediaType string `json:"mediaType"` // "image" | "video"
}

func handleSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.To == "" {
		http.Error(w, "Recipient ('to') is required", http.StatusBadRequest)
		return
	}

	s, _ := getStatus()
	if s != "CONNECTED" || client == nil {
		http.Error(w, "WhatsApp is not connected", http.StatusServiceUnavailable)
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

	if req.MediaPath != "" {
		// Send Media
		err = sendMedia(jid, req.MediaPath, req.Text, req.MediaType)
	} else {
		// Send Text
		_, err = client.SendMessage(context.Background(), jid, &waE2E.Message{
			Conversation: proto.String(req.Text),
		})
	}

	if err != nil {
		log.Printf("[Bridge] Failed to send message to %s: %v", jid.String(), err)
		http.Error(w, fmt.Sprintf("Send failed: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("[Bridge] Message successfully sent to %s", jid.String())
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "Message sent successfully",
	})
}

func sendMedia(jid types.JID, path, caption, mediaType string) error {
	// Read file
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("failed to open media file: %w", err)
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return fmt.Errorf("failed to read media file: %w", err)
	}

	mimeType := http.DetectContentType(data)

	// Upload to WhatsApp server
	var uploadResp whatsmeow.UploadResponse
	if mediaType == "video" {
		uploadResp, err = client.Upload(context.Background(), data, whatsmeow.MediaVideo)
	} else {
		uploadResp, err = client.Upload(context.Background(), data, whatsmeow.MediaImage)
	}
	if err != nil {
		return fmt.Errorf("failed to upload media to WhatsApp: %w", err)
	}

	// Prepare message payload
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

	_, err = client.SendMessage(context.Background(), jid, &msg)
	return err
}
