const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const settingsController = require('../controllers/settingsController');
const waClient = require('../services/whatsapp');

// ── Announcements ────────────────────────────────────────────────────────────
router.get('/announcements', announcementController.list);
router.post('/announcements', announcementController.create);
router.put('/announcements/:id', announcementController.update);
router.delete('/announcements/:id', announcementController.delete);
router.patch('/announcements/:id/status', announcementController.toggleStatus);
router.post('/announcements/:id/post-now', announcementController.postNow);
router.post('/announcements/:id/delete-media', announcementController.deleteMedia);

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', settingsController.getSettings);
router.post('/settings', settingsController.updateSettings);

// ── WhatsApp ─────────────────────────────────────────────────────────────────
router.get('/whatsapp/status', (req, res) => {
    res.json(waClient.getStatus());
});

router.post('/whatsapp/reconnect', async (req, res) => {
    try {
        await waClient.reconnect();
        res.json({ message: 'Reconnection initiated' });
    } catch (error) {
        console.error('Error initiating reconnection:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/whatsapp/send-test', async (req, res) => {
    try {
        const { initDb } = require('../models/database');
        const db = await initDb();
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');

        // Send test to all available chats first group found, or a specific one
        const { groupId } = req.body;
        const targetId = groupId || process.env.WHATSAPP_TEST_GROUP_ID;

        if (!targetId) {
            return res.status(400).json({ error: 'No group ID provided for test. Pass { groupId } in body.' });
        }

        await waClient.sendTextMessage(targetId, '✅ *Mayor WhatsApp Poster*: Test connection successful!');
        res.json({ message: 'Test message sent successfully' });
    } catch (error) {
        console.error('Error sending test message:', error);
        res.status(500).json({ error: error.message });
    }
});

// Returns all chats (groups + individual) the WA account is part of
router.get('/whatsapp/chats', async (req, res) => {
    try {
        if (!waClient.client || waClient.status !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp is not connected' });
        }
        const chats = await waClient.client.getChats();
        const simplified = chats.map(c => ({
            id: c.id._serialized,
            name: c.name || c.id.user,
            isGroup: c.isGroup
        }));
        res.json(simplified);
    } catch (error) {
        console.error('Error getting chats:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── Activity Logs ─────────────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
    try {
        const { initDb } = require('../models/database');
        const db = await initDb();
        const logs = await db.all('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100');
        res.json(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
