const waClient = require('../services/whatsapp');
const { logActivity } = require('../models/database');
const { emitLog } = require('../services/socket');

class StatusHandler {
    async sendTextStatus(text, from = null, userId = null) {
        return await this.sendToStatus(null, text, from, userId);
    }

    async sendImageStatus(mediaPath, caption = '', from = null, userId = null) {
        return await this.sendToStatus({ path: mediaPath, type: 'image' }, caption, from, userId);
    }

    async sendVideoStatus(mediaPath, caption = '', from = null, userId = null) {
        return await this.sendToStatus({ path: mediaPath, type: 'video' }, caption, from, userId);
    }

    async sendToStatus(mediaEntry, caption, from = null, userId = null) {
        let statusType = 'Text';
        if (mediaEntry && mediaEntry.path) {
            statusType = mediaEntry.type === 'video' || /\.(mp4|avi|mkv|mov|webm)$/i.test(mediaEntry.path) ? 'Video' : 'Image';
        }

        try {
            await waClient.sendStatus({ mediaEntry, caption }, from);
            const successMsg = `Posted ${statusType} Status to WhatsApp via ${from || 'default'} account ✓`;
            console.log(`[StatusHandler] ${successMsg}`);

            if (userId) {
                emitLog(userId, { type: 'success', message: successMsg, timestamp: new Date().toISOString() });
                await logActivity('whatsapp_status_posted', successMsg, userId);
            }
            return true;
        } catch (err) {
            const errorMsg = `Failed to post ${statusType} Status to WhatsApp via ${from || 'default'}: ${err.message}`;
            console.error('[StatusHandler]', errorMsg);

            if (userId) {
                emitLog(userId, { type: 'error', message: errorMsg, timestamp: new Date().toISOString() });
                await logActivity('whatsapp_status_error', errorMsg, userId);
            }
            throw err;
        }
    }
}

module.exports = StatusHandler;
