const { sendWhatsAppConnectedEmail } = require('../services/email');

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

        // Diff check for newly connected accounts
        for (const newSess of this.sessions) {
            const oldSess = oldSessions.find(s => s.id === newSess.id);
            if (newSess.status === 'CONNECTED' && (!oldSess || oldSess.status !== 'CONNECTED')) {
                const mapping = await db.get('SELECT user_id FROM whatsapp_sessions WHERE session_id = ?', [newSess.id]);
                const userId = mapping ? mapping.user_id : null;

                emitLog(userId, {
                    type: 'success',
                    message: `WhatsApp session linked: ${newSess.jid?.user || newSess.id}`,
                    timestamp: new Date().toISOString()
                });

                // Send security notification email to session owner
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
                }

                // Promotion check: if this session is newly CONNECTED with JID,
                // check if there is an unmapped session matching it, and check if a temp session disappeared.
                if (newSess.id.includes('@')) {
                    const mapped = await db.get('SELECT id FROM whatsapp_sessions WHERE session_id = ?', [newSess.id]);
                    if (!mapped) {
                        const missingTemp = oldSessions.find(s => s.id.startsWith('temp_') && !this.sessions.some(ns => ns.id === s.id));
                        if (missingTemp) {
                            console.log(`[SessionManager] Promoting session in database: ${missingTemp.id} -> ${newSess.id}`);
                            await db.run(
                                'UPDATE whatsapp_sessions SET session_id = ? WHERE session_id = ?',
                                [newSess.id, missingTemp.id]
                            );
                        }
                    }
                }
                // Harvest contacts in background after session pairing/connection
                if (userId) {
                    const whatsappService = require('./index');
                    setTimeout(() => {
                        whatsappService.syncContacts(newSess.id, userId)
                            .catch(err => console.error('[SessionManager] Auto contact harvest error:', err));
                    }, 5000);
                }
            }
        }

        // Clean up orphaned temp sessions from database
        const dbTempSessions = await db.all("SELECT session_id FROM whatsapp_sessions WHERE session_id LIKE 'temp_%'");
        for (const tempDbSess of dbTempSessions) {
            const stillExists = this.sessions.some(s => s.id === tempDbSess.session_id);
            if (!stillExists) {
                console.log(`[SessionManager] Cleaning up orphaned temp session from database: ${tempDbSess.session_id}`);
                await db.run('DELETE FROM whatsapp_sessions WHERE session_id = ?', [tempDbSess.session_id]);
            }
        }
    }
}

module.exports = SessionManager;
