const { sendWhatsAppConnectedEmail, sendWhatsAppDisconnectedEmail } = require('../services/email');

class SessionManager {
    constructor() {
        this.sessions = [];
    }

    getSessions() {
        return this.sessions;
    }

    getStatus() {
        return {
            sessions: this.sessions
        };
    }

    async handleStatusSync(newSessions) {
        const oldSessions = this.sessions;
        this.sessions = newSessions || [];

        const { emitStatus, emitLog } = require('../services/socket');
        emitStatus(this.getStatus());

        const db = await require('../models/database').getDb();

        for (const newSess of this.sessions) {
            if (newSess.status === 'CONNECTED') {
                let mapping = await db.get('SELECT user_id FROM whatsapp_sessions WHERE session_id = ?', [newSess.id]);
                
                // If not mapped directly, check if there is an unmapped temp session to promote
                if (!mapping) {
                    const tempRow = await db.get("SELECT id, user_id, session_id FROM whatsapp_sessions WHERE session_id LIKE 'temp_%' ORDER BY id DESC LIMIT 1");
                    if (tempRow) {
                        console.log(`[SessionManager] Promoting database temp session ${tempRow.session_id} -> ${newSess.id} for user ${tempRow.user_id}`);
                        await db.run('UPDATE whatsapp_sessions SET session_id = ? WHERE id = ?', [newSess.id, tempRow.id]);
                        mapping = { user_id: tempRow.user_id };
                    } else {
                        // Default auto-link to admin/user_id = 1
                        console.log(`[SessionManager] Auto-linking connected session ${newSess.id} to user 1`);
                        await db.run('INSERT OR IGNORE INTO whatsapp_sessions (user_id, session_id) VALUES (1, ?)', [newSess.id]);
                        mapping = { user_id: 1 };
                    }
                }

                const userId = mapping ? mapping.user_id : 1;
                const oldSess = oldSessions.find(s => s.id === newSess.id);
                if (!oldSess || oldSess.status !== 'CONNECTED') {
                    emitLog(userId, {
                        type: 'success',
                        message: `WhatsApp session linked: ${newSess.jid?.user || newSess.id}`,
                        timestamp: new Date().toISOString()
                    });

                    if (userId) {
                        try {
                            const userRow = await db.get('SELECT email FROM users WHERE id = ?', [userId]);
                            if (userRow) {
                                const phoneNumber = newSess.jid?.user || null;
                                sendWhatsAppConnectedEmail(userRow.email, phoneNumber)
                                    .catch(err => console.error('[SessionManager] Connected email error:', err));
                            }
                        } catch (err) {
                            console.error('[SessionManager] Failed to send connected email:', err);
                        }

                        const whatsappService = require('./index');
                        setTimeout(() => {
                            whatsappService.syncContacts(newSess.id, userId)
                                .catch(err => console.error('[SessionManager] Auto contact harvest error:', err));
                        }, 5000);
                    }
                }
            }
        }

        // Detect connected -> disconnected transitions so the owner can relink before
        // their scheduled announcements start silently failing to send.
        for (const oldSess of oldSessions) {
            if (oldSess.status !== 'CONNECTED') continue;
            const stillConnected = this.sessions.find(s => s.id === oldSess.id && s.status === 'CONNECTED');
            if (stillConnected) continue;

            const mapping = await db.get('SELECT user_id FROM whatsapp_sessions WHERE session_id = ?', [oldSess.id]);
            if (!mapping) continue;

            emitLog(mapping.user_id, {
                type: 'error',
                message: `WhatsApp session disconnected: ${oldSess.jid?.user || oldSess.id}`,
                timestamp: new Date().toISOString()
            });

            try {
                const userRow = await db.get('SELECT email FROM users WHERE id = ?', [mapping.user_id]);
                if (userRow) {
                    const phoneNumber = oldSess.jid?.user || null;
                    sendWhatsAppDisconnectedEmail(userRow.email, phoneNumber)
                        .catch(err => console.error('[SessionManager] Disconnected email error:', err));
                }
            } catch (err) {
                console.error('[SessionManager] Failed to send disconnected email:', err);
            }
        }
    }
}

module.exports = SessionManager;
