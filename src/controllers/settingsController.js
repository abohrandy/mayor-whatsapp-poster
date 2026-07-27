const { initDb, logActivity } = require('../models/database');

exports.getSettings = async (req, res) => {
    try {
        const db = await initDb();
        const row = await db.get('SELECT * FROM settings WHERE id = 1');
        const defaultSettings = {
            id: 1,
            timezone: 'Africa/Lagos',
            default_post_time: '08:00',
            send_delay_seconds: 5,
            randomize_delay: 1,
            auto_retry: 1,
            max_retries: 3,
            quiet_hours_enabled: 0,
            quiet_hours_start: '22:00',
            quiet_hours_end: '07:00',
            ai_tone: 'Professional',
            ai_language: 'English',
            notify_email_failures: 1,
            notify_email_disconnects: 1,
            notify_email_low_credits: 1,
            webhook_url: ''
        };

        if (!row) {
            return res.json(defaultSettings);
        }

        res.json({
            ...defaultSettings,
            ...row,
            randomize_delay: row.randomize_delay !== undefined ? row.randomize_delay : 1,
            auto_retry: row.auto_retry !== undefined ? row.auto_retry : 1,
            max_retries: row.max_retries !== undefined ? row.max_retries : 3,
            quiet_hours_enabled: row.quiet_hours_enabled !== undefined ? row.quiet_hours_enabled : 0,
            notify_email_failures: row.notify_email_failures !== undefined ? row.notify_email_failures : 1,
            notify_email_disconnects: row.notify_email_disconnects !== undefined ? row.notify_email_disconnects : 1,
            notify_email_low_credits: row.notify_email_low_credits !== undefined ? row.notify_email_low_credits : 1
        });
    } catch (err) {
        console.error('Error getting settings:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateSettings = async (req, res) => {
    const {
        timezone,
        default_post_time,
        send_delay_seconds,
        randomize_delay,
        auto_retry,
        max_retries,
        quiet_hours_enabled,
        quiet_hours_start,
        quiet_hours_end,
        ai_tone,
        ai_language,
        notify_email_failures,
        notify_email_disconnects,
        notify_email_low_credits,
        webhook_url
    } = req.body;

    try {
        const db = await initDb();
        await db.run(
            `UPDATE settings SET 
                timezone = ?, 
                default_post_time = ?, 
                send_delay_seconds = ?,
                randomize_delay = ?,
                auto_retry = ?,
                max_retries = ?,
                quiet_hours_enabled = ?,
                quiet_hours_start = ?,
                quiet_hours_end = ?,
                ai_tone = ?,
                ai_language = ?,
                notify_email_failures = ?,
                notify_email_disconnects = ?,
                notify_email_low_credits = ?,
                webhook_url = ?
            WHERE id = 1`,
            [
                timezone || 'Africa/Lagos',
                default_post_time || '08:00',
                send_delay_seconds !== undefined ? parseInt(send_delay_seconds) : 5,
                randomize_delay ? 1 : 0,
                auto_retry ? 1 : 0,
                max_retries !== undefined ? parseInt(max_retries) : 3,
                quiet_hours_enabled ? 1 : 0,
                quiet_hours_start || '22:00',
                quiet_hours_end || '07:00',
                ai_tone || 'Professional',
                ai_language || 'English',
                notify_email_failures ? 1 : 0,
                notify_email_disconnects ? 1 : 0,
                notify_email_low_credits ? 1 : 0,
                webhook_url ? webhook_url.trim() : ''
            ]
        );
        await logActivity('settings_updated', 'Application settings were modified by user/admin.', req.user ? req.user.id : null);
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: err.message });
    }
};
