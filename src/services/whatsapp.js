const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const qrcode = require('qrcode-terminal');

console.log('--- WHATSAPP SERVICE MODULE LOADED (BAILEYS) at ' + new Date().toLocaleTimeString() + ' ---');
const { emitStatus, emitLog } = require('./socket');

class WhatsAppClient {
    constructor() {
        this.status = 'DISCONNECTED';
        this.qrText = '';
        this.lastError = null;
        this.initialized = false;
        this.sock = null;
        this.store = null;
    }

    async init() {
        if (this.initialized) {
            console.log('WhatsApp Client already initialized, skipping...');
            return;
        }
        this.initialized = true;

        const baseDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
        const authPath = path.join(baseDir, 'wa_auth_persistent');
        
        console.log('WhatsApp Client initializing (Baileys)...');
        emitLog({ type: 'info', message: 'Initializing Baileys connection...', timestamp: new Date().toISOString() });

        try {
            // Setup Store to track chats
            this.store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });

            const { state, saveCreds } = await useMultiFileAuthState(authPath);
            
            // Fetch the latest WA Web version dynamically
            const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1017531287] }));
            console.log(`Using WhatsApp Web version: ${version.join('.')}`);

            const sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: state,
                browser: ["Mayor WhatsApp Poster", "Safari", "3.0"],
            });

            this.sock = sock;
            this.store.bind(sock.ev);

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.status = 'AUTH_REQUIRED';
                    this.qrText = qr;
                    console.log('QR RECEIVED');
                    emitLog({ type: 'info', message: 'QR Code received, waiting for scan...', timestamp: new Date().toISOString() });
                    qrcode.generate(qr, { small: true });
                    emitStatus(this.getStatus());
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    
                    console.log(`Connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);
                    this.status = 'DISCONNECTED';
                    this.initialized = false;
                    emitStatus(this.getStatus());
                    
                    if (shouldReconnect) {
                        emitLog({ type: 'warning', message: 'Connection closed, reconnecting...', timestamp: new Date().toISOString() });
                        // Brief delay before reconnecting to prevent loops
                        setTimeout(() => this.init(), 5000);
                    } else {
                        this.lastError = 'Logged out from WhatsApp session.';
                        emitLog({ type: 'error', message: 'WhatsApp Client logged out. Reconnection required.', timestamp: new Date().toISOString() });
                        
                        // Clear auth folder on logout
                        if (fs.existsSync(authPath)) {
                            try {
                                fs.rmSync(authPath, { recursive: true, force: true });
                            } catch (e) {
                                console.error('Error clearing auth path:', e.message);
                            }
                        }
                    }
                } else if (connection === 'open') {
                    this.status = 'CONNECTED';
                    this.qrText = '';
                    this.lastError = null;
                    console.log('Client is ready (Baileys)!');
                    emitLog({ type: 'success', message: 'WhatsApp Client is ready and connected!', timestamp: new Date().toISOString() });
                    emitStatus(this.getStatus());
                }
            });
        } catch (error) {
            console.error('Failed to initialize Baileys client:', error);
            this.status = 'DISCONNECTED';
            this.initialized = false;
            this.lastError = error.message;
            emitStatus(this.getStatus());
        }
    }

    getStatus() {
        return {
            status: this.status,
            qrText: this.qrText,
            lastError: this.lastError
        };
    }

    async reconnect() {
        try {
            console.log('Reconnection requested...');
            this.status = 'DISCONNECTED';
            this.initialized = false;
            
            if (this.sock) {
                try {
                    this.sock.end();
                } catch (e) {
                    console.error('Error ending socket:', e.message);
                }
            }

            const baseDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
            const authPath = path.join(baseDir, 'wa_auth_persistent');
            if (fs.existsSync(authPath)) {
                try {
                    fs.rmSync(authPath, { recursive: true, force: true });
                } catch (e) {
                    console.error('Error clearing auth directory:', e.message);
                }
            }

            await this.init();
        } catch (error) {
            console.error('Error during reconnection:', error);
            throw error;
        }
    }

    async sendTextMessage(to, text) {
        if (this.status !== 'CONNECTED' || !this.sock) {
            throw new Error('WhatsApp is not connected.');
        }
        
        const formattedJid = this.formatJid(to);
        await this.sock.sendMessage(formattedJid, { text });
        console.log(`Text message sent to ${formattedJid}`);
        return true;
    }

    /**
     * Send an image or video with an optional caption to a group/chat.
     * @param {string} groupId  - WhatsApp chat ID
     * @param {string} filePath - Absolute path to the media file
     * @param {string} caption  - Optional caption text
     * @param {string} mediaType - 'image' | 'video'
     */
    async sendMedia(groupId, filePath, caption = '', mediaType = 'image') {
        if (this.status !== 'CONNECTED' || !this.sock) {
            throw new Error('WhatsApp is not connected.');
        }

        const absPath = path.resolve(filePath);
        if (!fs.existsSync(absPath)) {
            throw new Error(`Media file not found: ${absPath}`);
        }

        const formattedJid = this.formatJid(groupId);
        const mimeType = mime.lookup(absPath);
        
        let message = {};
        if (mediaType === 'video') {
            message = { 
                video: fs.readFileSync(absPath), 
                caption, 
                mimetype: mimeType 
            };
        } else {
            message = { 
                image: fs.readFileSync(absPath), 
                caption, 
                mimetype: mimeType 
            };
        }

        await this.sock.sendMessage(formattedJid, message);
        console.log(`Media (${mediaType}) sent to ${formattedJid}`);
        return true;
    }

    // Legacy alias kept for compatibility
    async sendImageWithCaption(groupId, imagePath, caption) {
        return this.sendMedia(groupId, imagePath, caption, 'image');
    }

    // Helper JID formatter
    formatJid(id) {
        if (id.includes('@')) return id;
        if (id.includes('-')) return `${id}@g.us`;
        return `${id}@s.whatsapp.net`;
    }

    // Retrieve participating chats/groups
    async getChats() {
        if (!this.sock || this.status !== 'CONNECTED') {
            return [];
        }
        
        try {
            // Fetch participating groups directly from WhatsApp Socket API
            const groups = await this.sock.groupFetchAllParticipating();
            return Object.values(groups).map(g => ({
                id: g.id,
                name: g.subject,
                isGroup: true
            }));
        } catch (e) {
            console.error('Error fetching participating groups:', e);
            
            // Fallback to store if store contains active chats
            if (this.store && this.store.chats) {
                return this.store.chats.all().map(c => ({
                    id: c.id,
                    name: c.name || c.id.split('@')[0],
                    isGroup: c.id.endsWith('@g.us')
                }));
            }
            return [];
        }
    }
}

// Singleton instance
const waClient = new WhatsAppClient();
module.exports = waClient;
