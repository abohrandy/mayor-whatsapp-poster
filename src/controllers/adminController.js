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
    },

    async updateUserTier(req, res) {
        try {
            const { id } = req.params;
            const { tier } = req.body; // 'trial' or 'premium'
            if (!['trial', 'premium'].includes(tier)) {
                return res.status(400).json({ error: 'Invalid tier selection' });
            }

            const db = await getDb();
            const user = await db.get('SELECT email FROM users WHERE id = ?', [id]);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // If switching to premium, reset trial_ends_at to NULL, otherwise if trial, set it to now + 14 days
            let trialEndsAt = null;
            if (tier === 'trial') {
                const ends = new Date();
                ends.setDate(ends.getDate() + 14);
                trialEndsAt = ends.toISOString();
            }

            await db.run(
                'UPDATE users SET tier = ?, trial_ends_at = ? WHERE id = ?',
                [tier, trialEndsAt, id]
            );

            const logMsg = `Admin manually set tier for user ${user.email} to: ${tier.toUpperCase()}`;
            console.log(`[Admin] ${logMsg}`);
            await logActivity('admin_override', logMsg, req.user.id);

            res.json({
                message: 'User tier updated successfully',
                userId: id,
                tier,
                trial_ends_at: trialEndsAt
            });
        } catch (err) {
            console.error('[Admin updateUserTier] Error:', err);
            res.status(500).json({ error: 'Failed to update user tier' });
        }
    },

    async stats(req, res) {
        try {
            const db = await getDb();
            const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
            const activeSubs = await db.get("SELECT COUNT(*) as count FROM users WHERE subscription_status = 'active'");
            const trialUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE tier = 'trial'");
            const premiumUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE tier = 'premium'");
            const totalSessions = await db.get('SELECT COUNT(*) as count FROM whatsapp_sessions');
            const totalAnnouncements = await db.get('SELECT COUNT(*) as count FROM announcements');
            const totalProfiles = await db.get('SELECT COUNT(*) as count FROM posting_profiles');
            
            const recentUsers = await db.all('SELECT id, email, tier, subscription_status, created_at FROM users ORDER BY created_at DESC LIMIT 5');
            const recentAnnouncements = await db.all(`
                SELECT a.id, a.title, a.status, a.created_at, u.email as user_email
                FROM announcements a
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.created_at DESC LIMIT 5
            `);

            // Fetch live WhatsApp sessions and map connection state
            const waClient = require('../services/whatsapp');
            const liveStatus = waClient.getStatus() || {};
            const liveSessions = liveStatus.sessions || [];

            const dbSessions = await db.all(`
                SELECT ws.session_id, u.email as user_email
                FROM whatsapp_sessions ws
                LEFT JOIN users u ON ws.user_id = u.id
            `);

            const sessionsList = dbSessions.map(ds => {
                const live = liveSessions.find(ls => ls.id === ds.session_id);
                return {
                    sessionId: ds.session_id,
                    userEmail: ds.user_email,
                    status: live ? live.status : 'DISCONNECTED',
                    phoneNumber: live ? live.phoneNumber : null
                };
            });

            res.json({
                overview: {
                    totalUsers: totalUsers.count,
                    activeSubscriptions: activeSubs.count,
                    trialUsers: trialUsers.count,
                    premiumUsers: premiumUsers.count,
                    totalSessions: totalSessions.count,
                    totalAnnouncements: totalAnnouncements.count,
                    totalProfiles: totalProfiles.count
                },
                recentUsers,
                recentAnnouncements,
                sessions: sessionsList
            });
        } catch (err) {
            console.error('[Admin stats] Error:', err);
            res.status(500).json({ error: 'Failed to fetch admin stats' });
        }
    }
};

module.exports = adminController;
