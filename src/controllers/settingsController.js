const { initDb, logActivity } = require('../models/database');

exports.getSettings = async (req, res) => {
    try {
        const db = await initDb();
        const row = await db.get('SELECT * FROM settings WHERE id = 1');
        res.json(row || { id: 1, timezone: 'Africa/Lagos', default_post_time: '08:00', send_delay_seconds: 5 });
    } catch (err) {
        console.error('Error getting settings:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateSettings = async (req, res) => {
    const { timezone, default_post_time, send_delay_seconds } = req.body;
    try {
        const db = await initDb();
        await db.run(
            `UPDATE settings SET timezone = ?, default_post_time = ?, send_delay_seconds = ? WHERE id = 1`,
            [
                timezone || 'Africa/Lagos',
                default_post_time || '08:00',
                send_delay_seconds !== undefined ? parseInt(send_delay_seconds) : 5
            ]
        );
        await logActivity('settings_updated', 'Application settings were modified by admin.');
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: err.message });
    }
};
