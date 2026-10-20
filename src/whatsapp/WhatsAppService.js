const path = require('path');
const fs = require('fs');
const BaileysAdapter = require('./BaileysAdapter');
const SessionManager = require('./SessionManager');

class WhatsAppService {
    constructor(adapter = null, sessionManager = null) {
        this.adapter = adapter || new BaileysAdapter();
        this.sessionManager = sessionManager || new SessionManager();
        this.initialized = false;
        this.syncInterval = null;
    }

    async init() {
        if (this.initialized) {
            console.log('WhatsAppService already initialized, skipping...');
            return;
        }
        this.initialized = true;

        console.log(`[WhatsAppService] Syncing connection with Baileys backend at ${this.adapter.bridgeUrl}...`);

        // Initial sync
        await this.syncStatus();

        // Sync status periodically
        this.syncInterval = setInterval(() => this.syncStatus(), 20000);
    }

    async syncStatus() {
        try {
            const fetchedSessions = await this.adapter.fetchStatus();
            await this.sessionManager.handleStatusSync(fetchedSessions);
        } catch (err) {
            console.error('[WhatsAppService] Failed to sync status with backend:', err.message);
        }
    }

    getStatus() {
        return this.sessionManager.getStatus();
    }

    async createSession() {
        try {
            console.log('[WhatsAppService] Requesting session creation...');
            const data = await this.adapter.createSession();
            await this.syncStatus();
            return data;
        } catch (err) {
            console.error('[WhatsAppService] Failed to create new session:', err.message);
            throw err;
        }
    }

    async pairPhone(phone) {
        try {
            console.log('[WhatsAppService] Requesting phone-pairing code...');
            const data = await this.adapter.pairPhone(phone);
            await this.syncStatus();
            return data;
        } catch (err) {
            console.error('[WhatsAppService] Failed to request phone-pairing code:', err.message);
            throw err;
        }
    }

    async deleteSession(id) {
        try {
            console.log(`[WhatsAppService] Requesting session deletion for: ${id}...`);
            const data = await this.adapter.deleteSession(id);
            await this.syncStatus();
            return data;
        } catch (err) {
            console.error(`[WhatsAppService] Failed to delete session ${id}:`, err.message);
            throw err;
        }
    }

    async joinGroup(from, inviteLink) {
        try {
            return await this.adapter.joinGroup(from, inviteLink);
        } catch (err) {
            throw err;
        }
    }

    async sendTextMessage(to, text, from = null) {
        try {
            return await this.adapter.sendTextMessage(to, text, from);
        } catch (err) {
            throw err;
        }
    }

    /**
     * Send an image or video with an optional caption to a group/chat.
     * @param {string} groupId  - WhatsApp chat ID
     * @param {string} filePath - Absolute path or relative path to media file
     * @param {string} caption  - Optional caption text
     * @param {string} mediaType - 'image' | 'video'
     * @param {string} from - optional sender JID
     */
    async sendMedia(groupId, filePath, caption = '', mediaType = 'image', from = null) {
        const baseDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
        const absPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(baseDir, filePath);

        if (!fs.existsSync(absPath)) {
            throw new Error(`Media file not found: ${absPath}`);
        }

        return await this.adapter.sendMediaMessage(groupId, absPath, caption, mediaType, from);
    }

    /**
     * Send a Text Status broadcast update to WhatsApp Status.
     */
    async sendTextStatus(text, from = null) {
        return await this.sendTextMessage('status@broadcast', text, from);
    }

    /**
     * Send an Image Status broadcast update to WhatsApp Status.
     */
    async sendImageStatus(filePath, caption = '', from = null) {
        return await this.sendMedia('status@broadcast', filePath, caption, 'image', from);
    }

    /**
     * Send a Video Status broadcast update to WhatsApp Status.
     */
    async sendVideoStatus(filePath, caption = '', from = null) {
        return await this.sendMedia('status@broadcast', filePath, caption, 'video', from);
    }

    /**
     * Unified status posting handler (Text, Image, Video).
     */
    async sendStatus(statusPayload, from = null) {
        const { mediaEntry, text, caption } = statusPayload || {};
        if (mediaEntry && mediaEntry.path) {
            const isVideo = mediaEntry.type === 'video' || /\.(mp4|avi|mkv|mov|webm)$/i.test(mediaEntry.path);
            if (isVideo) {
                return await this.sendVideoStatus(mediaEntry.path, caption || text || '', from);
            } else {
                return await this.sendImageStatus(mediaEntry.path, caption || text || '', from);
            }
        } else {
            return await this.sendTextStatus(caption || text || '', from);
        }
    }

    // Helper JID formatter
    formatJid(id) {
        if (!id) return id;
        if (id.includes('@')) return id;
        if (id.includes('-')) return `${id}@g.us`;
        return `${id}@s.whatsapp.net`;
    }

    // Retrieve participating chats/groups
    async getChats(from = null) {
        try {
            return await this.adapter.getGroups(from);
        } catch (err) {
            console.error(`[WhatsAppService] Failed to fetch groups for ${from || 'default'}:`, err.message);
            return [];
        }
    }
}

module.exports = WhatsAppService;
