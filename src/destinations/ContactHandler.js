const waClient = require('../services/whatsapp');
const { logActivity } = require('../models/database');
const { emitLog } = require('../services/socket');

class ContactHandler {
    formatContactJid(id) {
        if (!id) return id;
        if (id.includes('@')) return id;
        const clean = id.replace(/[^\d]/g, '');
        return `${clean}@s.whatsapp.net`;
    }

    async sendToContact(contactId, mediaEntry, caption, from = null, userId = null) {
        const jid = this.formatContactJid(contactId);
        try {
            if (mediaEntry && mediaEntry.path) {
                await waClient.sendMedia(jid, mediaEntry.path, caption, mediaEntry.type || 'image', from);
            } else {
                await waClient.sendTextMessage(jid, caption, from);
            }
            console.log(`[ContactHandler] Sent to contact ${jid} via ${from || 'default'} ✓`);
            return true;
        } catch (err) {
            const msg = `Failed to send to contact ${jid} via ${from || 'default'}: ${err.message}`;
            console.error('[ContactHandler]', msg);
            if (userId) {
                emitLog(userId, { type: 'error', message: msg, timestamp: new Date().toISOString() });
            }
            throw err;
        }
    }

    async sendWithRetry(contactId, mediaEntry, caption, maxRetries = 2, from = null, userId = null) {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                await this.sendToContact(contactId, mediaEntry, caption, from, userId);
                return true;
            } catch (err) {
                attempt++;
                if (attempt < maxRetries) {
                    console.warn(`[ContactHandler] Error sending to contact ${contactId}. Attempt ${attempt}/${maxRetries}. Retrying in 2s... Error: ${err.message}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    throw err;
                }
            }
        }
    }
}

module.exports = ContactHandler;
