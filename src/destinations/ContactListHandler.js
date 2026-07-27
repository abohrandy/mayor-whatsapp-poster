const ContactHandler = require('./ContactHandler');
const { getDb, logActivity } = require('../models/database');

class ContactListHandler {
    constructor() {
        this.contactHandler = new ContactHandler();
    }

    async sendToContactList(listId, mediaEntry, caption, from = null, userId = null, staggerDelayMs = 5000) {
        const db = await getDb();
        const listRow = await db.get('SELECT * FROM contact_lists WHERE id = ? AND user_id = ?', [listId, userId]);

        if (!listRow) {
            console.warn(`[ContactListHandler] Contact list ${listId} not found for user ${userId}. Skipping.`);
            return { total: 0, succeeded: 0, failed: 0 };
        }

        let contactIds = [];
        try { contactIds = JSON.parse(listRow.contact_ids || '[]'); } catch { contactIds = []; }

        if (contactIds.length === 0) {
            console.log(`[ContactListHandler] Contact list "${listRow.name}" is empty.`);
            return { total: 0, succeeded: 0, failed: 0 };
        }

        const placeholders = contactIds.map(() => '?').join(',');
        const contacts = await db.all(
            `SELECT phone_number FROM contacts WHERE id IN (${placeholders}) AND user_id = ?`,
            [...contactIds, userId]
        );

        let succeeded = 0;
        let failed = 0;

        for (const c of contacts) {
            try {
                await this.contactHandler.sendWithRetry(c.phone_number, mediaEntry, caption, 2, from, userId);
                succeeded++;
            } catch (err) {
                failed++;
                await logActivity('announcement_error', `Failed to send to contact ${c.phone_number} in list "${listRow.name}": ${err.message}`, userId);
            }
            await new Promise(resolve => setTimeout(resolve, staggerDelayMs));
        }

        return { total: contacts.length, succeeded, failed };
    }
}

module.exports = ContactListHandler;
