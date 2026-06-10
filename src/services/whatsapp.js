const axios = require('axios');
const path = require('path');
const fs = require('fs');

console.log('--- WHATSAPP SERVICE PROXY LOADED (GO BRIDGE) at ' + new Date().toLocaleTimeString() + ' ---');

class WhatsAppClient {
    constructor() {
        this.status = 'DISCONNECTED';
        this.qrText = '';
        this.lastError = null;
        this.initialized = false;
        this.bridgeUrl = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:8080';
    }

    async init() {
        if (this.initialized) {
            console.log('WhatsApp Client Proxy already initialized, skipping...');
            return;
        }
        this.initialized = true;

        console.log(`[Proxy] Syncing connection with Go Whatsmeow Bridge at ${this.bridgeUrl}...`);
        
        // Initial sync
        this.syncStatus();
        
        // Sync status from Go Whatsmeow Bridge periodically
        setInterval(() => this.syncStatus(), 3000);
    }

    async syncStatus() {
        try {
            const res = await axios.get(`${this.bridgeUrl}/status`);
            const { status, qrText, lastError } = res.data;

            if (this.status !== status || this.qrText !== qrText || this.lastError !== lastError) {
                const oldStatus = this.status;
                this.status = status || 'DISCONNECTED';
                this.qrText = qrText || '';
                this.lastError = lastError || null;

                const { emitStatus, emitLog } = require('./socket');
                emitStatus(this.getStatus());

                if (this.status === 'CONNECTED' && oldStatus !== 'CONNECTED') {
                    emitLog({ type: 'success', message: 'WhatsApp Client is connected via Go Bridge!', timestamp: new Date().toISOString() });
                }
            }
        } catch (err) {
            if (this.status !== 'DISCONNECTED') {
                this.status = 'DISCONNECTED';
                this.qrText = '';
                this.lastError = `Failed to contact Go Bridge: ${err.message}`;
                
                const { emitStatus } = require('./socket');
                emitStatus(this.getStatus());
            }
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
            console.log('[Proxy] Requesting Go Bridge session reset...');
            await axios.post(`${this.bridgeUrl}/reconnect`);
            this.status = 'DISCONNECTED';
            this.qrText = '';
            this.lastError = null;

            const { emitStatus } = require('./socket');
            emitStatus(this.getStatus());
        } catch (err) {
            console.error('[Proxy] Failed to request reconnect from Go Bridge:', err.message);
            throw err;
        }
    }

    async sendTextMessage(to, text) {
        try {
            await axios.post(`${this.bridgeUrl}/send`, { to, text });
            console.log(`[Proxy] Text message sent to ${to}`);
            return true;
        } catch (err) {
            const errMsg = err.response?.data || err.message;
            console.error(`[Proxy] Failed to send text message to ${to}:`, errMsg);
            throw new Error(errMsg);
        }
    }

    /**
     * Send an image or video with an optional caption to a group/chat.
     * @param {string} groupId  - WhatsApp chat ID
     * @param {string} filePath - Absolute path to the media file
     * @param {string} caption  - Optional caption text
     * @param {string} mediaType - 'image' | 'video'
     */
    async sendMedia(groupId, filePath, caption = '', mediaType = 'image') {
        // Resolve absolute path respecting DATA_DIR persistent storage if configured
        const baseDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
        const absPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(baseDir, filePath);

        if (!fs.existsSync(absPath)) {
            throw new Error(`Media file not found: ${absPath}`);
        }

        try {
            await axios.post(`${this.bridgeUrl}/send`, {
                to: groupId,
                text: caption,
                mediaPath: absPath,
                mediaType: mediaType
            });
            console.log(`[Proxy] Media (${mediaType}) sent to ${groupId}`);
            return true;
        } catch (err) {
            const errMsg = err.response?.data || err.message;
            console.error(`[Proxy] Failed to send media to ${groupId}:`, errMsg);
            throw new Error(errMsg);
        }
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
        try {
            const res = await axios.get(`${this.bridgeUrl}/groups`);
            return res.data;
        } catch (err) {
            console.error('[Proxy] Failed to fetch groups from Go Bridge:', err.message);
            return [];
        }
    }
}

// Singleton instance
const waClient = new WhatsAppClient();
module.exports = waClient;
