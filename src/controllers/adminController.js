const { getDb, logActivity } = require('../models/database');

const adminController = {
    async listUsers(req, res) {
        try {
            const db = await getDb();
            const users = await db.all(`
                SELECT 
                    u.id, 
                    u.email, 
                    u.subscription_status, 
                    u.tier, 
                    u.trial_ends_at, 
                    u.created_at,
                    (SELECT COUNT(*) FROM whatsapp_sessions WHERE user_id = u.id) as sessions_count,
                    (SELECT COUNT(*) FROM announcements WHERE user_id = u.id) as announcements_count
                FROM users u
                ORDER BY u.created_at DESC
            `);
            res.json({ users });
        } catch (err) {
            console.error('[Admin listUsers] Error:', err);
            res.status(500).json({ error: 'Failed to fetch registered SaaS users' });
        }
    },

    async toggleUserSubscription(req, res) {
        try {
            const { id } = req.params;
            const db = await getDb();
            
            const user = await db.get('SELECT email, subscription_status FROM users WHERE id = ?', [id]);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Prevent self-deactivation if the admin is managing their own status (optional safety check)
            if (user.email === req.user.email) {
                return res.status(400).json({ error: 'Cannot modify your own administrator account status.' });
            }

            const newStatus = user.subscription_status === 'active' ? 'inactive' : 'active';
            await db.run(
                'UPDATE users SET subscription_status = ? WHERE id = ?',
                [newStatus, id]
            );

            const logMsg = `Admin manually set subscription for user ${user.email} to: ${newStatus.toUpperCase()}`;
            console.log(`[Admin] ${logMsg}`);
            await logActivity('admin_override', logMsg, req.user.id);

            res.json({
                message: 'User subscription updated successfully',
                userId: id,
                subscription_status: newStatus
            });
        } catch (err) {
            console.error('[Admin toggleUserSubscription] Error:', err);
            res.status(500).json({ error: 'Failed to override user subscription' });
        }
    }
};

module.exports = adminController;
