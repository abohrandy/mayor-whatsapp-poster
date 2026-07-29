const GroupHandler = require('./GroupHandler');
const ContactHandler = require('./ContactHandler');
const ContactListHandler = require('./ContactListHandler');
const StatusHandler = require('./StatusHandler');
const waClient = require('../services/whatsapp');
const { logActivity } = require('../models/database');
const { emitLog } = require('../services/socket');

class DestinationEngine {
    constructor() {
        this.groupHandler = new GroupHandler();
        this.contactHandler = new ContactHandler();
        this.contactListHandler = new ContactListHandler();
        this.statusHandler = new StatusHandler();
    }

    async dispatch({
        announcementTitle = 'Announcement',
        mediaEntry = null,
        caption = '',
        targetGroups = [],
        contactListIds = [],
        includeStatus = false,
        senderJid = null,
        userId = null,
        sendDelayMs = 5000
    }) {
        let succeeded = 0;
        let failed = 0;
        let totalTargets = 0;

        // 1. Fetch group naming map for clean logs
        let groupMap = {};
        if (targetGroups.length > 0 && senderJid) {
            try {
                const chats = await waClient.getChats(senderJid);
                if (Array.isArray(chats)) {
                    chats.forEach(c => {
                        if (c.id) groupMap[c.id] = c.name;
                    });
                }
            } catch (err) {
                console.error('[DestinationEngine] Failed to fetch group naming map:', err);
            }
        }

        // 2. Dispatch to Target Groups
        totalTargets += targetGroups.length;
        for (const groupId of targetGroups) {
            const groupName = groupMap[groupId] || groupId;
            try {
                await this.groupHandler.sendWithRetry(groupId, mediaEntry, caption, groupMap, 2, senderJid, userId);
                succeeded++;
            } catch (err) {
                failed++;
                if (userId) {
                    await logActivity('announcement_error', `Failed to send to group "${groupName}" (${groupId}): ${err.message}`, userId);
                }
            }
            await new Promise(resolve => setTimeout(resolve, sendDelayMs));
        }

        // 3. Dispatch to Contact Lists
        totalTargets += contactListIds.length;
        for (const listId of contactListIds) {
            try {
                const res = await this.contactListHandler.sendToContactList(listId, mediaEntry, caption, senderJid, userId, sendDelayMs);
                succeeded += res.succeeded;
                failed += res.failed;
            } catch (err) {
                failed++;
            }
        }

        // 4. Dispatch to WhatsApp Status broadcast
        if (includeStatus) {
            totalTargets += 1;
            try {
                await this.statusHandler.sendToStatus(mediaEntry, caption, senderJid, userId);
                succeeded++;
            } catch (err) {
                failed++;
            }
        }

        const logMsg = `Announcement "${announcementTitle}" dispatched to ${succeeded}/${totalTargets} destination(s)${failed > 0 ? ` (${failed} failed)` : ''}.`;
        console.log('[DestinationEngine]', logMsg);

        if (userId) {
            emitLog(userId, { type: failed > 0 ? 'warning' : 'success', message: logMsg, timestamp: new Date().toISOString() });
            await logActivity('announcement_posted', logMsg, userId);
        }

        return { succeeded, failed, totalTargets };
    }
}

const destinationEngine = new DestinationEngine();
module.exports = destinationEngine;
module.exports.DestinationEngine = DestinationEngine;
