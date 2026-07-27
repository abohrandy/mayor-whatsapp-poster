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
        this.syncInterval = setInterval(() => this.syncStatus(), 3000);
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

        const mediaBase64 = fs.readFileSync(absPath, { encoding: 'base64' });
        return await this.adapter.sendMediaMessage(groupId, mediaBase64, caption, mediaType, from);
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

    /**
     * Harvest WhatsApp contacts and save/upsert into database.
     * @param {string} sessionJid - Sender session JID or null
     * @param {number} userId - User ID owning the session
     */
    async syncContacts(sessionJid = null, userId = null) {
        if (!userId) {
            console.warn('[WhatsAppService] syncContacts called without userId');
            return { count: 0, lastSyncedAt: null };
        }

        try {
            console.log(`[WhatsAppService] Harvesting contacts for session ${sessionJid || 'default'} (user ${userId})...`);
            const harvested = await this.adapter.getContacts(sessionJid);
            if (!Array.isArray(harvested) || harvested.length === 0) {
                console.log('[WhatsAppService] No contacts returned from WhatsApp bridge.');
                return { count: 0, lastSyncedAt: new Date().toISOString() };
            }

            const db = await require('../models/database').getDb();
            const { logActivity } = require('../models/database');
            const { emitLog } = require('../services/socket');

            let upsertedCount = 0;
            const now = new Date().toISOString();

            for (const item of harvested) {
                if (!item.phoneNumber || !item.name) continue;
                const cleanPhone = item.phoneNumber.replace(/[^\d+]/g, '');
                if (!cleanPhone) continue;

                const existing = await db.get(
                    'SELECT id, tags FROM contacts WHERE user_id = ? AND phone_number = ?',
                    [userId, cleanPhone]
                );

                if (existing) {
                    let tags = [];
                    try { tags = JSON.parse(existing.tags || '[]'); } catch { tags = []; }
                    if (!tags.includes('whatsapp_synced')) {
                        tags.push('whatsapp_synced');
                    }
                    await db.run(
                        'UPDATE contacts SET name = ?, tags = ?, updated_at = ? WHERE id = ?',
                        [item.name.trim(), JSON.stringify(tags), now, existing.id]
                    );
                } else {
                    const tagsJSON = JSON.stringify(['whatsapp_synced']);
                    await db.run(
                        'INSERT INTO contacts (name, phone_number, tags, user_id) VALUES (?, ?, ?, ?)',
                        [item.name.trim(), cleanPhone, tagsJSON, userId]
                    );
                }
                upsertedCount++;
            }

            const logMsg = `Harvested ${upsertedCount} WhatsApp contacts for session ${sessionJid || 'default'}.`;
            console.log(`[WhatsAppService] ${logMsg}`);
            emitLog(userId, { type: 'success', message: logMsg, timestamp: now });
            await logActivity('whatsapp_contacts_synced', logMsg, userId);

            if (sessionJid) {
                await db.run(
                    'UPDATE whatsapp_sessions SET last_contacts_synced_at = ? WHERE session_id = ? AND user_id = ?',
                    [now, sessionJid, userId]
                ).catch(() => {});
            }

            return { count: upsertedCount, lastSyncedAt: now };
        } catch (err) {
            console.error('[WhatsAppService] Failed to harvest contacts:', err.message);
            throw err;
        }
    }
}

module.exports = WhatsAppService;
