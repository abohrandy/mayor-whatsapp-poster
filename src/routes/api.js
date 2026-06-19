const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const settingsController = require('../controllers/settingsController');
const profileController = require('../controllers/profileController');
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
        // Link session to this user in database
        if (waClient.sessions && waClient.sessions.length > 0) {
            // Find the session that was just created (it starts as AUTH_REQUIRED or temp ID)
            const tempSess = waClient.sessions.find(s => s.status === 'AUTH_REQUIRED' && !s.jid);
            if (tempSess) {
                await db.run(
                    'INSERT OR IGNORE INTO whatsapp_sessions (user_id, session_id) VALUES (?, ?)',
                    [req.user.id, tempSess.id]
                );
            }
        }
        res.json(result);
    } catch (error) {
        console.error('Error creating session:', error);
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

        // Security check: Verify session belongs to the user
        if (from) {
            const db = await require('../models/database').getDb();
            const mapping = await db.get('SELECT id FROM whatsapp_sessions WHERE user_id = ? AND session_id = ?', [req.user.id, from]);
            if (!mapping) {
                return res.status(403).json({ error: 'Unauthorized to use this WhatsApp session' });
            }
        }

        await waClient.sendTextMessage(targetId, '✅ *Mayor WhatsApp Poster*: Test connection successful!', from);
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
        
        // Security check: Verify session belongs to the user
        if (from) {
            const db = await require('../models/database').getDb();
            const mapping = await db.get('SELECT id FROM whatsapp_sessions WHERE user_id = ? AND session_id = ?', [req.user.id, from]);
            if (!mapping) {
                return res.status(403).json({ error: 'Unauthorized to view chats for this WhatsApp session' });
            }
        }

        const chats = await waClient.getChats(from);
        res.json(chats);
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
        const profilesCount = await db.get('SELECT COUNT(*) as count FROM posting_profiles WHERE user_id = ?', [req.user.id]);
        const logsCount = await db.get('SELECT COUNT(*) as count FROM activity_logs WHERE user_id = ?', [req.user.id]);
        
        res.json({
            whatsappStatus: waClient.getStatus(),
            database: {
                announcements: announcementsCount.count,
                profiles: profilesCount.count,
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

// ── Posting Profiles ─────────────────────────────────────────────────────────
router.get('/profiles', requireAuth, requireSubscription, profileController.list);
router.post('/profiles', requireAuth, requireSubscription, profileController.create);
router.put('/profiles/:id', requireAuth, requireSubscription, profileController.update);
router.delete('/profiles/:id', requireAuth, requireSubscription, profileController.delete);

// ── SaaS User Management (Admin Only) ─────────────────────────────────────────
router.get('/admin/users', requireAuth, requireAdmin, adminController.listUsers);
router.post('/admin/users/:id/subscription', requireAuth, requireAdmin, adminController.toggleUserSubscription);
router.post('/admin/users/:id/tier', requireAuth, requireAdmin, adminController.updateUserTier);
router.get('/admin/stats', requireAuth, requireAdmin, adminController.stats);

// ── Subscription Plan Management (Admin Only) ────────────────────────────────
router.get('/admin/plans', requireAuth, requireAdmin, planController.listAllPlans);
router.post('/admin/plans', requireAuth, requireAdmin, planController.createPlan);
router.put('/admin/plans/:id', requireAuth, requireAdmin, planController.updatePlan);
router.delete('/admin/plans/:id', requireAuth, requireAdmin, planController.deletePlan);

module.exports = router;
