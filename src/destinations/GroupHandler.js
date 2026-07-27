const waClient = require('../services/whatsapp');
const { logActivity } = require('../models/database');
const { emitLog } = require('../services/socket');

class GroupHandler {
    async sendToGroup(groupId, mediaEntry, caption, from = null, userId = null) {
        try {
            if (mediaEntry && mediaEntry.path) {
                await waClient.sendMedia(groupId, mediaEntry.path, caption, mediaEntry.type || 'image', from);
            } else {
                await waClient.sendTextMessage(groupId, caption, from);
            }
            console.log(`[GroupHandler] Sent to group ${groupId} via ${from || 'default'} ✓`);
            return true;
        } catch (err) {
            const msg = `Failed to send to group ${groupId} via ${from || 'default'}: ${err.message}`;
            console.error('[GroupHandler]', msg);
            if (userId) {
                emitLog(userId, { type: 'error', message: msg, timestamp: new Date().toISOString() });
            }
            throw err;
        }
    }

    async sendWithRetry(groupId, mediaEntry, caption, groupMap = {}, maxRetries = 2, from = null, userId = null) {
        let attempt = 0;
        let delay = 3000;
        const groupName = groupMap[groupId] || groupId;

        while (attempt < maxRetries) {
            try {
                await this.sendToGroup(groupId, mediaEntry, caption, from, userId);
                return true;
            } catch (err) {
                attempt++;
                const isRateLimit = err.message && (err.message.includes('420') || err.message.toLowerCase().includes('rate limit'));

                if (isRateLimit && attempt < maxRetries) {
                    const waitSec = Math.round(delay / 1000);
                    console.warn(`[GroupHandler] Rate limited (420) sending to group "${groupName}" (${groupId}). Attempt ${attempt}/${maxRetries}. Retrying in ${waitSec}s...`);
                    if (userId) {
                        await logActivity('announcement_error', `Rate limited (420) sending to group "${groupName}" (${groupId}). Retrying in ${waitSec}s... (Attempt ${attempt}/${maxRetries})`, userId);
                    }
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2.5;
                } else {
                    if (attempt < maxRetries) {
                        console.warn(`[GroupHandler] Error sending to group "${groupName}" (${groupId}). Attempt ${attempt}/${maxRetries}. Retrying in 2s... Error: ${err.message}`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        throw err;
                    }
                }
            }
        }
    }
}

module.exports = GroupHandler;
