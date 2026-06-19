const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { sendWhatsAppConnectedEmail } = require('./email');

console.log('--- WHATSAPP SERVICE PROXY LOADED (GO BRIDGE - MULTI SESSION) at ' + new Date().toLocaleTimeString() + ' ---');

class WhatsAppClient {
    constructor() {
        this.sessions = [];
        this.initialized = false;
        
        let url = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:8080';
        // Clean up trailing colons/slashes
        url = url.trim().replace(/:+$/, '').replace(/\/+$/, '');
        // Ensure protocol is present
        if (!/^https?:\/\//i.test(url)) {
            url = `http://${url}`;
        }
        this.bridgeUrl = url;
    }

    async init() {
        if (this.initialized) {
            console.log('WhatsApp Client Proxy already initialized, skipping...');
            return;
        }
        this.initialized = true;

        console.log(`[Proxy] Syncing connection with Go Whatsmeow Bridge at ${this.bridgeUrl}...`);
        
        // Initial sync
        await this.syncStatus();
        
        // Sync status from Go Whatsmeow Bridge periodically
        setInterval(() => this.syncStatus(), 3000);
    }

    async syncStatus() {
        try {
            const res = await axios.get(`${this.bridgeUrl}/status`);
            const oldSessions = this.sessions;
            this.sessions = res.data || [];

            // Detect any new connections
            const { emitStatus, emitLog } = require('./socket');
            emitStatus(this.getStatus());

            const db = await require('../models/database').getDb();

            // Simple diff check for newly connected accounts
            for (const newSess of this.sessions) {
                const oldSess = oldSessions.find(s => s.id === newSess.id);
                if (newSess.status === 'CONNECTED' && (!oldSess || oldSess.status !== 'CONNECTED')) {
                    const mapping = await db.get('SELECT user_id FROM whatsapp_sessions WHERE session_id = ?', [newSess.id]);
                    const userId = mapping ? mapping.user_id : null;
                    
                    emitLog(userId, { 
                        type: 'success', 
                        message: `WhatsApp session linked: ${newSess.jid?.user || newSess.id}`, 
                        timestamp: new Date().toISOString() 
                    });

                    // Send security notification email to the session owner
                    if (userId) {
                        try {
                            const userRow = await db.get('SELECT email FROM users WHERE id = ?', [userId]);
                            if (userRow) {
                                const phoneNumber = newSess.jid?.user || null;
                                sendWhatsAppConnectedEmail(userRow.email, phoneNumber)
                                    .catch(err => console.error('[WhatsApp] Connected email error:', err));
                            }
                        } catch (err) {
                            console.error('[WhatsApp] Failed to send connected email:', err);
                        }
                    }

                    // Promotion check: if this session is newly CONNECTED with JID,
                    // check if there is an unmapped session matching it, and check if a temp session disappeared.
                    if (newSess.id.includes('@')) {
                        const mapped = await db.get('SELECT id FROM whatsapp_sessions WHERE session_id = ?', [newSess.id]);
                        if (!mapped) {
                            const missingTemp = oldSessions.find(s => s.id.startsWith('temp_') && !this.sessions.some(ns => ns.id === s.id));
                            if (missingTemp) {
                                console.log(`[Proxy] Promoting session in database: ${missingTemp.id} -> ${newSess.id}`);
                                await db.run(
                                    'UPDATE whatsapp_sessions SET session_id = ? WHERE session_id = ?',
                                    [newSess.id, missingTemp.id]
                                );
                            }
                        }
                    }
                }
            }

            // Clean up orphaned temp sessions from database (e.g. abandoned QR requests)
            const dbTempSessions = await db.all("SELECT session_id FROM whatsapp_sessions WHERE session_id LIKE 'temp_%'");
            for (const tempDbSess of dbTempSessions) {
                const stillExists = this.sessions.some(s => s.id === tempDbSess.session_id);
                if (!stillExists) {
                    console.log(`[Proxy] Cleaning up orphaned temp session from database: ${tempDbSess.session_id}`);
                    await db.run('DELETE FROM whatsapp_sessions WHERE session_id = ?', [tempDbSess.session_id]);
                }
            }
        } catch (err) {
            console.error('[Proxy] Failed to contact Go Bridge:', err.message);
            // Don't completely overwrite sessions with empty, but mark bridge as offline
        }
    }

    getStatus() {
        // Return full sessions array so the client UI can display and manage all accounts
        return {
            sessions: this.sessions
        };
    }

    async createSession() {
        try {
            console.log('[Proxy] Requesting Go Bridge to create new session...');
            const res = await axios.post(`${this.bridgeUrl}/session/new`);
            await this.syncStatus();
            return res.data;
        } catch (err) {
            console.error('[Proxy] Failed to create new session on Go Bridge:', err.message);
            throw err;
        }
    }

    async deleteSession(id) {
        try {
            console.log(`[Proxy] Requesting Go Bridge to delete session: ${id}...`);
            const res = await axios.post(`${this.bridgeUrl}/session/delete`, { id });
            await this.syncStatus();
            return res.data;
        } catch (err) {
            console.error(`[Proxy] Failed to delete session ${id} on Go Bridge:`, err.message);
            throw err;
        }
    }

    async joinGroup(from, inviteLink) {
        try {
            console.log(`[Proxy] Requesting session ${from || 'default'} to join group: ${inviteLink}...`);
            const res = await axios.post(`${this.bridgeUrl}/join`, { from, inviteLink });
            return res.data;
        } catch (err) {
            const errMsg = err.response?.data || err.message;
            console.error('[Proxy] Failed to join group:', errMsg);
            throw new Error(errMsg);
        }
    }

    async sendTextMessage(to, text, from = null) {
        try {
            await axios.post(`${this.bridgeUrl}/send`, { from, to, text });
            console.log(`[Proxy] Text message sent from ${from || 'default'} to ${to}`);
            return true;
        } catch (err) {
            const errMsg = err.response?.data || err.message;
            console.error(`[Proxy] Failed to send text message from ${from || 'default'} to ${to}:`, errMsg);
            throw new Error(errMsg);
        }
    }

    /**
     * Send an image or video with an optional caption to a group/chat.
     * @param {string} groupId  - WhatsApp chat ID
     * @param {string} filePath - Absolute path to the media file
     * @param {string} caption  - Optional caption text
     * @param {string} mediaType - 'image' | 'video'
     * @param {string} from - optional sender JID JID.String()
     */
    async sendMedia(groupId, filePath, caption = '', mediaType = 'image', from = null) {
        // Resolve absolute path respecting DATA_DIR persistent storage if configured
        const baseDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
        const absPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(baseDir, filePath);

        if (!fs.existsSync(absPath)) {
            throw new Error(`Media file not found: ${absPath}`);
        }

        try {
            const mediaBase64 = fs.readFileSync(absPath, { encoding: 'base64' });

            await axios.post(`${this.bridgeUrl}/send`, {
                from: from,
                to: groupId,
                text: caption,
                mediaBase64: mediaBase64,
                mediaType: mediaType
            });
            console.log(`[Proxy] Media (${mediaType}) sent from ${from || 'default'} to ${groupId}`);
            return true;
        } catch (err) {
            const errMsg = err.response?.data || err.message;
            console.error(`[Proxy] Failed to send media to ${groupId} from ${from || 'default'}:`, errMsg);
            throw new Error(errMsg);
        }
    }

    // Helper JID formatter
    formatJid(id) {
        if (id.includes('@')) return id;
        if (id.includes('-')) return `${id}@g.us`;
        return `${id}@s.whatsapp.net`;
    }

    // Retrieve participating chats/groups
    async getChats(from = null) {
        try {
            const res = await axios.get(`${this.bridgeUrl}/groups`, {
                params: { from }
            });
            return res.data;
        } catch (err) {
            console.error(`[Proxy] Failed to fetch groups from Go Bridge for ${from || 'default'}:`, err.message);
            return [];
        }
    }
}

// Singleton instance
const waClient = new WhatsAppClient();
module.exports = waClient;
