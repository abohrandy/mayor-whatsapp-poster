const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const settingsController = require('../controllers/settingsController');
const profileController = require('../controllers/profileController');
const audienceListController = require('../controllers/audienceListController');
const contactController = require('../controllers/contactController');
const contactListController = require('../controllers/contactListController');
const groupListController = require('../controllers/groupListController');
const authController = require('../controllers/authController');
const paymentController = require('../controllers/paymentController');
const adminController = require('../controllers/adminController');
const planController = require('../controllers/planController');
const { requireAuth, requireSubscription, requireAdmin } = require('../middleware/auth');
const waClient = require('../services/whatsapp');

// ── Authentication ───────────────────────────────────────────────────────────
router.post('/auth/signup', authController.signup);
router.post('/auth/login', authController.login);
router.get('/auth/me', requireAuth, authController.me);
router.post('/auth/change-password', requireAuth, authController.changePassword);
router.patch('/auth/onboarding', requireAuth, authController.updateOnboarding);

// ── Paystack Payments ────────────────────────────────────────────────────────
router.post('/payments/initialize', requireAuth, paymentController.initialize);
router.post('/payments/start-trial', requireAuth, paymentController.startTrial);
router.post('/payments/webhook', paymentController.webhook); // Webhook verification inside controller

// ── Subscription Plans (Public) ──────────────────────────────────────────────
router.get('/plans', planController.listActivePlans);

// ── Announcements (Protected by Auth & Active Subscription) ──────────────────
router.get('/announcements', requireAuth, requireSubscription, announcementController.list);
router.post('/announcements', requireAuth, requireSubscription, announcementController.create);
router.put('/announcements/:id', requireAuth, requireSubscription, announcementController.update);
router.delete('/announcements/:id', requireAuth, requireSubscription, announcementController.delete);
router.patch('/announcements/:id/status', requireAuth, requireSubscription, announcementController.toggleStatus);
router.post('/announcements/:id/post-now', requireAuth, requireSubscription, announcementController.postNow);
router.post('/announcements/:id/delete-media', requireAuth, requireSubscription, announcementController.deleteMedia);

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', requireAuth, settingsController.getSettings);
router.post('/settings', requireAuth, settingsController.updateSettings);

// ── WhatsApp (Protected by Auth & Active Subscription) ──────────────────────
router.get('/whatsapp/status', requireAuth, requireSubscription, async (req, res) => {
    try {
        const db = await require('../models/database').getDb();
        const mappings = await db.all('SELECT session_id FROM whatsapp_sessions WHERE user_id = ?', [req.user.id]);
        const allowedSessionIds = mappings.map(m => m.session_id);
        
        const status = waClient.getStatus();
        const filteredSessions = (status.sessions || []).filter(s => allowedSessionIds.includes(s.id));
        
        res.json({ sessions: filteredSessions });
    } catch (error) {
        console.error('Error fetching whatsapp status:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/sync-contacts', requireAuth, requireSubscription, async (req, res) => {
    try {
        const { session_id } = req.body;
        const db = await require('../models/database').getDb();
        let targetSessionJid = null;
        if (session_id) {
            const mapping = await db.get('SELECT session_id FROM whatsapp_sessions WHERE user_id = ? AND session_id = ?', [req.user.id, session_id]);
            if (mapping) targetSessionJid = mapping.session_id;
        }
        if (!targetSessionJid) {
            const first = await db.get('SELECT session_id FROM whatsapp_sessions WHERE user_id = ? LIMIT 1', [req.user.id]);
            if (first) targetSessionJid = first.session_id;
        }

        if (!targetSessionJid) {
            return res.status(400).json({ error: 'No active WhatsApp session found for your account. Please link your WhatsApp first.' });
        }

        const result = await waClient.syncContacts(targetSessionJid, req.user.id);
        res.json({ message: 'WhatsApp contacts sync completed', ...result });
    } catch (error) {
        console.error('Error syncing contacts:', error);
        const errMsg = error.response?.data || error.message || 'WhatsApp bridge error';
        const userMsg = typeof errMsg === 'string' && errMsg.includes('Session not found')
            ? 'WhatsApp session is not connected. Please scan QR code on the WhatsApp Status page to link your account.'
            : (typeof errMsg === 'string' ? errMsg : 'Failed to communicate with WhatsApp bridge. Make sure your WhatsApp session is connected.');
        res.status(400).json({ error: userMsg });
    }
});

router.get('/whatsapp/contact-sync-status', requireAuth, requireSubscription, async (req, res) => {
    try {
        const db = await require('../models/database').getDb();
        const session = await db.get(
            'SELECT last_contacts_synced_at FROM whatsapp_sessions WHERE user_id = ? ORDER BY last_contacts_synced_at DESC LIMIT 1',
            [req.user.id]
        );
        const contactCount = await db.get(
            "SELECT COUNT(*) as count FROM contacts WHERE user_id = ? AND tags LIKE '%whatsapp_synced%'",
            [req.user.id]
        );
        res.json({
            lastSyncedAt: session?.last_contacts_synced_at || null,
            syncedCount: contactCount?.count || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── AI Credit System & Assistant ────────────────────────────────────────────────
const aiService = require('../ai');
const { aiCreditManager } = require('../ai');

router.get('/ai/credits', requireAuth, async (req, res) => {
    try {
        const creditsInfo = await aiCreditManager.getUserCredits(req.user.id);
        res.json(creditsInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/ai/usage-history', requireAuth, async (req, res) => {
    try {
        const history = await aiCreditManager.getUsageHistory(req.user.id);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/ai/process', requireAuth, async (req, res) => {
    try {
        const { operation, text, targetLanguage, count } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text content is required for AI processing.' });
        }

        // Deduct 1 credit (or check sufficiency)
        const creditResult = await aiCreditManager.deductCredits(req.user.id, operation, 1);

        // Process text via AI Service (model parameter ignored/hidden from user)
        const result = await aiService.processText({ operation, text, targetLanguage, count });

        res.json({
            success: true,
            ...result,
            remainingCredits: creditResult.remainingCredits,
            resetDate: creditResult.resetDate
        });
    } catch (error) {
        console.error('Error processing AI text:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
    }
});

// ── Queue Jobs & Telemetry ───────────────────────────────────────────────────
const { jobQueue } = require('../queue');

router.post('/announcements/trigger-due', requireAuth, async (req, res) => {
    try {
        const { checkAndSendDue } = require('../services/scheduler');
        await checkAndSendDue();
        res.json({ message: 'Checked and triggered due announcements successfully.' });
    } catch (error) {
        console.error('Error triggering due announcements:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/jobs', requireAuth, async (req, res) => {
    try {
        const db = await require('../models/database').getDb();
        let jobs = [];
        if (req.user.is_admin) {
            jobs = await db.all('SELECT * FROM jobs ORDER BY id DESC LIMIT 100');
        } else {
            jobs = await db.all('SELECT * FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.id]);
        }
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/jobs/:id/logs', requireAuth, async (req, res) => {
    try {
        const logs = await jobQueue.getJobLogsGrouped(req.params.id);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/jobs/:id/retry', requireAuth, async (req, res) => {
    try {
        const result = await jobQueue.retryJob(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/session/new', requireAuth, requireSubscription, async (req, res) => {
    try {
        const db = await require('../models/database').getDb();
        const currentSessions = await db.get(
            'SELECT COUNT(*) as count FROM whatsapp_sessions WHERE user_id = ?',
            [req.user.id]
        );

        const userPlan = await db.get('SELECT max_sessions, name FROM subscription_plans WHERE slug = ?', [req.user.tier]);
        const maxSessions = userPlan?.max_sessions || 1;
        if (currentSessions.count >= maxSessions) {
            return res.status(400).json({
                error: `Your ${userPlan?.name || 'current'} plan only allows linking ${maxSessions} WhatsApp number(s). Please upgrade to a higher plan to link more.`
            });
        }

        const result = await waClient.createSession();
        // Link the session to this user using the ID the bridge handed back synchronously.
        // (Previously this tried to find the new session by scanning `waClient.sessions`,
        // a property that was never actually populated — so the mapping row was never
        // created and the new session's QR code could never appear for the requesting user.)
        if (result?.id) {
            await db.run(
                'INSERT OR IGNORE INTO whatsapp_sessions (user_id, session_id) VALUES (?, ?)',
                [req.user.id, result.id]
            );
        }
        res.json(result);
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/session/pair-phone', requireAuth, requireSubscription, async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone number is required' });

        const db = await require('../models/database').getDb();
        const currentSessions = await db.get(
            'SELECT COUNT(*) as count FROM whatsapp_sessions WHERE user_id = ?',
            [req.user.id]
        );

        const userPlan = await db.get('SELECT max_sessions, name FROM subscription_plans WHERE slug = ?', [req.user.tier]);
        const maxSessions = userPlan?.max_sessions || 1;
        if (currentSessions.count >= maxSessions) {
            return res.status(400).json({
                error: `Your ${userPlan?.name || 'current'} plan only allows linking ${maxSessions} WhatsApp number(s). Please upgrade to a higher plan to link more.`
            });
        }

        const result = await waClient.pairPhone(phone);
        if (result?.id) {
            await db.run(
                'INSERT OR IGNORE INTO whatsapp_sessions (user_id, session_id) VALUES (?, ?)',
                [req.user.id, result.id]
            );
        }
        res.json(result);
    } catch (error) {
        console.error('Error pairing session via phone number:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/session/delete', requireAuth, requireSubscription, async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Session ID required' });
        
        // Security check: Verify session belongs to the user
        const db = await require('../models/database').getDb();
        const mapping = await db.get('SELECT id FROM whatsapp_sessions WHERE user_id = ? AND session_id = ?', [req.user.id, id]);
        if (!mapping) {
            return res.status(403).json({ error: 'Unauthorized to delete this WhatsApp session' });
        }

        const result = await waClient.deleteSession(id);
        await db.run('DELETE FROM whatsapp_sessions WHERE user_id = ? AND session_id = ?', [req.user.id, id]);
        res.json(result);
    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/join', requireAuth, requireSubscription, async (req, res) => {
    try {
        const { from, inviteLink } = req.body;
        if (!inviteLink) return res.status(400).json({ error: 'Invite link is required' });

        // Security check: Verify session belongs to the user
        if (from) {
            const db = await require('../models/database').getDb();
            const mapping = await db.get('SELECT id FROM whatsapp_sessions WHERE user_id = ? AND session_id = ?', [req.user.id, from]);
            if (!mapping) {
                return res.status(403).json({ error: 'Unauthorized to use this WhatsApp session' });
            }
        }

        const result = await waClient.joinGroup(from, inviteLink);
        res.json(result);
    } catch (error) {
        console.error('Error joining group:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/send-test', requireAuth, requireSubscription, async (req, res) => {
    try {
        const { groupId, from } = req.body;
        const targetId = groupId || process.env.WHATSAPP_TEST_GROUP_ID;

        if (!targetId) {
            return res.status(400).json({ error: 'No group ID provided for test. Pass { groupId } in body.' });
        }

        const db = await require('../models/database').getDb();
        const mappings = await db.all('SELECT session_id FROM whatsapp_sessions WHERE user_id = ?', [req.user.id]);
        const allowedSessionIds = mappings.map(m => m.session_id);

        let senderJid = from;
        if (from) {
            // Security check: Verify session belongs to the user
            if (!allowedSessionIds.includes(from)) {
                return res.status(403).json({ error: 'Unauthorized to use this WhatsApp session' });
            }
        } else {
            // Fallback to the user's first connected session
            if (allowedSessionIds.length === 0) {
                return res.status(400).json({ error: 'No connected WhatsApp sessions found. Please link a WhatsApp account first.' });
            }
            senderJid = allowedSessionIds[0];
        }

        await waClient.sendTextMessage(targetId, '✅ *Mayor WhatsApp Poster*: Test connection successful!', senderJid);
        res.json({ message: 'Test message sent successfully' });
    } catch (error) {
        console.error('Error sending test message:', error);
        res.status(500).json({ error: error.message });
    }
});

// Returns all chats (groups + individual) the WA account is part of
router.get('/whatsapp/chats', requireAuth, requireSubscription, async (req, res) => {
    try {
        const { from } = req.query;
        const db = await require('../models/database').getDb();
        
        // Get this user's mapped sessions
        const mappings = await db.all('SELECT session_id FROM whatsapp_sessions WHERE user_id = ?', [req.user.id]);
        const allowedSessionIds = mappings.map(m => m.session_id);

        if (from) {
            // Security check: Verify session belongs to the user
            if (!allowedSessionIds.includes(from)) {
                return res.status(403).json({ error: 'Unauthorized to view chats for this WhatsApp session' });
            }
            const chats = await waClient.getChats(from);
            res.json(chats);
        } else {
            // If no specific session is requested, fetch and merge chats across ALL sessions owned by this user
            let combinedChats = [];
            const seenChatIds = new Set();

            for (const sessId of allowedSessionIds) {
                try {
                    const chats = await waClient.getChats(sessId);
                    if (Array.isArray(chats)) {
                        for (const chat of chats) {
                            if (chat && chat.id && !seenChatIds.has(chat.id)) {
                                seenChatIds.add(chat.id);
                                combinedChats.push(chat);
                            }
                        }
                    }
                } catch (sessErr) {
                    console.error(`[Chats API] Failed to fetch chats for session ${sessId}:`, sessErr.message);
                }
            }
            res.json(combinedChats);
        }
    } catch (error) {
        console.error('Error getting chats:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── Diagnostics ──────────────────────────────────────────────────────────────
router.get('/diagnostics', requireAuth, async (req, res) => {
    try {
        const { initDb } = require('../models/database');
        const db = await initDb();
        const announcementsCount = await db.get('SELECT COUNT(*) as count FROM announcements WHERE user_id = ?', [req.user.id]);
        const listsCount = await db.get('SELECT COUNT(*) as count FROM audience_lists WHERE user_id = ?', [req.user.id]);
        const logsCount = await db.get('SELECT COUNT(*) as count FROM activity_logs WHERE user_id = ?', [req.user.id]);
        
        res.json({
            whatsappStatus: waClient.getStatus(),
            database: {
                announcements: announcementsCount.count,
                audienceLists: listsCount.count,
                profiles: listsCount.count,
                logs: logsCount.count
            },
            env: {
                nodeVersion: process.version,
                platform: process.platform,
                hasDataDir: !!process.env.DATA_DIR,
                dataDir: process.env.DATA_DIR || 'not set'
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── Activity Logs ─────────────────────────────────────────────────────────────
router.get('/logs', requireAuth, async (req, res) => {
    try {
        const { initDb } = require('../models/database');
        const db = await initDb();
        
        const adminEmail = process.env.ADMIN_EMAIL;
        let logs;
        if (adminEmail && req.user.email === adminEmail) {
            logs = await db.all(`
                SELECT activity_logs.*, users.email as user_email 
                FROM activity_logs 
                LEFT JOIN users ON activity_logs.user_id = users.id 
                ORDER BY activity_logs.created_at DESC LIMIT 200
            `);
        } else {
            logs = await db.all('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
        }
        res.json(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── Contacts ──────────────────────────────────────────────────────────────────
router.get('/contacts', requireAuth, requireSubscription, contactController.list);
router.get('/contacts/:id', requireAuth, requireSubscription, contactController.get);
router.post('/contacts', requireAuth, requireSubscription, contactController.create);
router.post('/contacts/import', requireAuth, requireSubscription, contactController.importBulk);
router.put('/contacts/:id', requireAuth, requireSubscription, contactController.update);
router.delete('/contacts/:id', requireAuth, requireSubscription, contactController.delete);

// ── Group Lists ───────────────────────────────────────────────────────────────
router.get('/group-lists', requireAuth, requireSubscription, groupListController.list);
router.get('/group-lists/:id', requireAuth, requireSubscription, groupListController.get);
router.post('/group-lists', requireAuth, requireSubscription, groupListController.create);
router.put('/group-lists/:id', requireAuth, requireSubscription, groupListController.update);
router.delete('/group-lists/:id', requireAuth, requireSubscription, groupListController.delete);

// ── Contact Lists ─────────────────────────────────────────────────────────────
router.get('/contact-lists', requireAuth, requireSubscription, contactListController.list);
router.get('/contact-lists/:id', requireAuth, requireSubscription, contactListController.get);
router.post('/contact-lists', requireAuth, requireSubscription, contactListController.create);
router.put('/contact-lists/:id', requireAuth, requireSubscription, contactListController.update);
router.delete('/contact-lists/:id', requireAuth, requireSubscription, contactListController.delete);

// ── Audience Lists ────────────────────────────────────────────────────────────
router.get('/audience-lists', requireAuth, requireSubscription, audienceListController.list);
router.get('/audience-lists/:id', requireAuth, requireSubscription, audienceListController.get);
router.post('/audience-lists', requireAuth, requireSubscription, audienceListController.create);
router.put('/audience-lists/:id', requireAuth, requireSubscription, audienceListController.update);
router.delete('/audience-lists/:id', requireAuth, requireSubscription, audienceListController.delete);

// Backward-compatibility aliases
router.get('/profiles', requireAuth, requireSubscription, audienceListController.list);
router.post('/profiles', requireAuth, requireSubscription, audienceListController.create);
router.put('/profiles/:id', requireAuth, requireSubscription, audienceListController.update);
router.delete('/profiles/:id', requireAuth, requireSubscription, audienceListController.delete);

// ── SaaS User Management (Admin Only) ─────────────────────────────────────────
router.get('/admin/users', requireAuth, requireAdmin, adminController.listUsers);
router.post('/admin/users/:id/subscription', requireAuth, requireAdmin, adminController.toggleUserSubscription);
router.post('/admin/users/:id/tier', requireAuth, requireAdmin, adminController.updateUserTier);
router.post('/admin/users/:id/adjust-days', requireAuth, requireAdmin, adminController.adjustUserDays);
router.get('/admin/stats', requireAuth, requireAdmin, adminController.stats);

// ── Subscription Plan Management (Admin Only) ────────────────────────────────
router.get('/admin/plans', requireAuth, requireAdmin, planController.listAllPlans);
router.post('/admin/plans', requireAuth, requireAdmin, planController.createPlan);
router.put('/admin/plans/:id', requireAuth, requireAdmin, planController.updatePlan);
router.delete('/admin/plans/:id', requireAuth, requireAdmin, planController.deletePlan);

// ── Super Admin AI Control Center ─────────────────────────────────────────────
router.get('/admin/ai-dashboard', requireAuth, requireAdmin, adminController.getAIDashboardStats);
router.post('/admin/ai-settings', requireAuth, requireAdmin, adminController.updateAISettings);
router.get('/admin/ai-request-logs', requireAuth, requireAdmin, adminController.getAIRequestLogs);

module.exports = router;
