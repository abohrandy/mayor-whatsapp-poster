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
                    u.manual_expires_at,
                    u.paystack_subscription_code,
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
    // Manually activate/set a user's plan tier. `days` (optional) grants access for exactly
    // that many days, after which requireSubscription blocks the account automatically —
    // this is how we manually onboard customers who couldn't complete Paystack checkout.
    // Omitting `days` (or passing 0) grants indefinite access, same as a Paystack subscription.
    async updateUserTier(req, res) {
        try {
            const { id } = req.params;
            const { tier, days } = req.body;

            const db = await getDb();

            const validSlugs = (await db.all(
                "SELECT slug FROM subscription_plans WHERE is_active = 1"
            )).map(p => p.slug);
            if (!validSlugs.includes(tier)) {
                return res.status(400).json({ error: 'Invalid tier selection' });
            }

            const user = await db.get('SELECT email FROM users WHERE id = ?', [id]);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            let trialEndsAt = null;
            let manualExpiresAt = null;

            if (tier === 'trial') {
                const ends = new Date();
                ends.setDate(ends.getDate() + 14);
                trialEndsAt = ends.toISOString();
            } else if (days) {
                const parsedDays = parseInt(days, 10);
                if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
                    return res.status(400).json({ error: 'Days must be a positive number, or omitted for indefinite access.' });
                }
                const expires = new Date();
                expires.setDate(expires.getDate() + parsedDays);
                manualExpiresAt = expires.toISOString();
            }

            await db.run(
                "UPDATE users SET tier = ?, subscription_status = 'active', trial_ends_at = ?, manual_expires_at = ? WHERE id = ?",
                [tier, trialEndsAt, manualExpiresAt, id]
            );

            const logMsg = manualExpiresAt
                ? `Admin manually activated ${tier.toUpperCase()} for user ${user.email}, expiring ${new Date(manualExpiresAt).toLocaleDateString()}`
                : `Admin manually set tier for user ${user.email} to: ${tier.toUpperCase()} (no expiry)`;
            console.log(`[Admin] ${logMsg}`);
            await logActivity('admin_override', logMsg, req.user.id);

            res.json({
                message: 'User tier updated successfully',
                userId: id,
                tier,
                trial_ends_at: trialEndsAt,
                manual_expires_at: manualExpiresAt
            });
        } catch (err) {
            console.error('[Admin updateUserTier] Error:', err);
            res.status(500).json({ error: 'Failed to update user tier' });
        }
    },

    // Nudge a user's access expiry by N days (positive extends, negative pulls it in) without
    // resetting their tier/status like updateUserTier does. Trial users adjust trial_ends_at;
    // everyone else adjusts manual_expires_at (created from "now" if the user had no expiry yet,
    // e.g. an indefinite manual grant or a Paystack-recurring account).
    async adjustUserDays(req, res) {
        try {
            const { id } = req.params;
            const { days } = req.body;
            const parsedDays = parseInt(days, 10);
            if (!Number.isFinite(parsedDays) || parsedDays === 0) {
                return res.status(400).json({ error: 'Days must be a non-zero number.' });
            }

            const db = await getDb();
            const user = await db.get('SELECT email, tier, trial_ends_at, manual_expires_at FROM users WHERE id = ?', [id]);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (user.email === req.user.email) {
                return res.status(400).json({ error: 'Cannot modify your own administrator account access.' });
            }

            const field = user.tier === 'trial' ? 'trial_ends_at' : 'manual_expires_at';
            const currentValue = user[field];
            const now = new Date();
            // Extending a lapsed expiry should count from today, not compound onto a stale past date.
            const base = (currentValue && !(new Date(currentValue) < now && parsedDays > 0))
                ? new Date(currentValue)
                : now;
            base.setDate(base.getDate() + parsedDays);

            const newStatus = base > now ? 'active' : 'inactive';

            await db.run(
                `UPDATE users SET ${field} = ?, subscription_status = ? WHERE id = ?`,
                [base.toISOString(), newStatus, id]
            );

            const logMsg = `Admin ${parsedDays > 0 ? 'added' : 'removed'} ${Math.abs(parsedDays)} day(s) ${parsedDays > 0 ? 'to' : 'from'} ${user.email}'s access (new expiry: ${base.toLocaleDateString()})`;
            console.log(`[Admin] ${logMsg}`);
            await logActivity('admin_override', logMsg, req.user.id);

            res.json({
                message: 'User access days updated successfully',
                userId: id,
                [field]: base.toISOString(),
                subscription_status: newStatus
            });
        } catch (err) {
            console.error('[Admin adjustUserDays] Error:', err);
            res.status(500).json({ error: 'Failed to adjust user access days' });
        }
    },

    async stats(req, res) {
        try {
            const db = await getDb();
            const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
            const activeSubs = await db.get("SELECT COUNT(*) as count FROM users WHERE subscription_status = 'active'");
            const trialUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE tier = 'trial'");
            const plusUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE tier = 'plus'");
            const totalSessions = await db.get('SELECT COUNT(*) as count FROM whatsapp_sessions');
            const totalAnnouncements = await db.get('SELECT COUNT(*) as count FROM announcements');
            const totalAudienceLists = await db.get('SELECT COUNT(*) as count FROM audience_lists');
            
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
                    plusUsers: plusUsers.count,
                    totalSessions: totalSessions.count,
                    totalAnnouncements: totalAnnouncements.count,
                    totalAudienceLists: totalAudienceLists.count,
                    totalProfiles: totalAudienceLists.count
                },
                recentUsers,
                recentAnnouncements,
                sessions: sessionsList
            });
        } catch (err) {
            console.error('[Admin stats] Error:', err);
            res.status(500).json({ error: 'Failed to fetch admin stats' });
        }
    },

    async getAIDashboardStats(req, res) {
        try {
            const db = await getDb();
            const aiSettings = (await db.get('SELECT * FROM ai_settings WHERE id = 1')) || {};
            
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

            const dailyRow = await db.get(
                "SELECT SUM(estimated_cost) as total FROM ai_request_logs WHERE created_at LIKE ?",
                [`${todayStr}%`]
            );
            const weeklyRow = await db.get(
                "SELECT SUM(estimated_cost) as total FROM ai_request_logs WHERE created_at >= ?",
                [sevenDaysAgo]
            );
            const monthlyRow = await db.get(
                "SELECT SUM(estimated_cost) as total FROM ai_request_logs WHERE created_at >= ?",
                [thirtyDaysAgo]
            );

            const actualCostRow = await db.get("SELECT SUM(estimated_cost) as total FROM ai_request_logs");
            const tokensRow = await db.get("SELECT SUM(total_tokens) as total FROM ai_request_logs");
            const countRow = await db.get("SELECT COUNT(*) as count, SUM(credits_deducted) as total_credits FROM ai_request_logs");
            const issuedRow = await db.get("SELECT SUM(ai_credits_monthly_limit) as total FROM users");

            const dailySpend = parseFloat((dailyRow?.total || 0).toFixed(4));
            const weeklySpend = parseFloat((weeklyRow?.total || 0).toFixed(4));
            const monthlySpend = parseFloat((monthlyRow?.total || 0).toFixed(4));
            const actualCost = parseFloat((actualCostRow?.total || 0).toFixed(4));
            const tokensConsumed = tokensRow?.total || 0;
            const totalRequests = countRow?.count || 0;
            const creditsUsed = countRow?.total_credits || 0;
            const creditsIssued = issuedRow?.total || 0;
            const avgCostPerRequest = totalRequests > 0 ? parseFloat((actualCost / totalRequests).toFixed(6)) : 0;

            const topUsers = await db.all(`
                SELECT user_id, user_email, COUNT(*) as request_count, SUM(credits_deducted) as credits_used, SUM(total_tokens) as total_tokens, SUM(estimated_cost) as total_cost
                FROM ai_request_logs
                GROUP BY user_id
                ORDER BY credits_used DESC
                LIMIT 10
            `);

            const mostUsedFeatures = await db.all(`
                SELECT operation, COUNT(*) as count, SUM(credits_deducted) as credits_used, SUM(total_tokens) as total_tokens, SUM(estimated_cost) as total_cost
                FROM ai_request_logs
                GROUP BY operation
                ORDER BY count DESC
            `);

            const modelUsage = await db.all(`
                SELECT model_used, COUNT(*) as count, SUM(total_tokens) as total_tokens, SUM(estimated_cost) as total_cost
                FROM ai_request_logs
                GROUP BY model_used
                ORDER BY count DESC
            `);

            const fallbackRow = await db.get(`
                SELECT 
                    SUM(CASE WHEN fallback_occurred = 1 THEN 1 ELSE 0 END) as fallback_count,
                    COUNT(*) as total_count
                FROM ai_request_logs
            `);

            const healthRow = await db.get(`
                SELECT 
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                    SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as failure_count,
                    AVG(response_time_ms) as avg_latency
                FROM ai_request_logs
            `);

            const fallbackCount = fallbackRow?.fallback_count || 0;
            const fallbackRate = totalRequests > 0 ? parseFloat(((fallbackCount / totalRequests) * 100).toFixed(1)) : 0;

            const successCount = healthRow?.success_count || 0;
            const failureCount = healthRow?.failure_count || 0;
            const avgLatencyMs = Math.round(healthRow?.avg_latency || 0);
            const successRate = totalRequests > 0 ? parseFloat(((successCount / totalRequests) * 100).toFixed(1)) : 100;

            res.json({
                dailySpend,
                weeklySpend,
                monthlySpend,
                creditsIssued,
                creditsUsed,
                actualCost,
                tokensConsumed,
                avgCostPerRequest,
                topUsers,
                mostUsedFeatures,
                modelUsage,
                costPerModel: modelUsage.map(m => ({ model: m.model_used, cost: parseFloat((m.total_cost || 0).toFixed(4)) })),
                costPerUser: topUsers.map(u => ({ user: u.user_email, cost: parseFloat((u.total_cost || 0).toFixed(4)) })),
                fallbackStats: {
                    fallbackCount,
                    totalRequests,
                    fallbackRate
                },
                aiHealth: {
                    successCount,
                    failureCount,
                    successRate,
                    avgLatencyMs,
                    status: failureCount === 0 ? 'Operational' : (successRate > 90 ? 'Degraded' : 'Critical')
                },
                aiSettings
            });
        } catch (err) {
            console.error('[Admin getAIDashboardStats] Error:', err);
            res.status(500).json({ error: 'Failed to fetch AI dashboard stats.' });
        }
    },

    async updateAISettings(req, res) {
        try {
            const {
                openrouter_api_key,
                active_model,
                fallback_model,
                fallback_model_1,
                fallback_model_2,
                fallback_model_3,
                disabled_models,
                ai_enabled,
                credits_trial,
                credits_plus,
                credits_unlimited,
                cost_per_feature
            } = req.body;

            const db = await getDb();
            const costJson = typeof cost_per_feature === 'object' ? JSON.stringify(cost_per_feature) : (cost_per_feature || '{}');
            const disabledJson = Array.isArray(disabled_models) ? JSON.stringify(disabled_models) : (disabled_models || '[]');

            await db.run(`
                UPDATE ai_settings
                SET openrouter_api_key = ?, active_model = ?, fallback_model = ?, 
                    fallback_model_1 = ?, fallback_model_2 = ?, fallback_model_3 = ?, disabled_models = ?,
                    ai_enabled = ?, credits_trial = ?, credits_plus = ?, credits_unlimited = ?, cost_per_feature = ?
                WHERE id = 1
            `, [
                openrouter_api_key !== undefined ? openrouter_api_key : null,
                active_model || 'deepseek/deepseek-chat',
                fallback_model_1 || fallback_model || 'qwen/qwen-2.5-72b-instruct',
                fallback_model_1 || 'qwen/qwen-2.5-72b-instruct',
                fallback_model_2 || 'thudm/glm-4-9b-chat',
                fallback_model_3 || 'minimax/minimax-01',
                disabledJson,
                ai_enabled !== undefined ? (ai_enabled ? 1 : 0) : 1,
                parseInt(credits_trial) || 50,
                parseInt(credits_plus) || 200,
                parseInt(credits_unlimited) || 1000,
                costJson
            ]);

            const logMsg = `Admin updated AI Settings (Active Model: ${active_model}, Enabled: ${ai_enabled ? 'Yes' : 'No'})`;
            console.log(`[Admin] ${logMsg}`);
            await logActivity('admin_ai_settings_updated', logMsg, req.user.id);

            res.json({ message: 'AI settings updated successfully.' });
        } catch (err) {
            console.error('[Admin updateAISettings] Error:', err);
            res.status(500).json({ error: 'Failed to update AI settings.' });
        }
    },

    async getAIRequestLogs(req, res) {
        try {
            const db = await getDb();
            const logs = await db.all('SELECT * FROM ai_request_logs ORDER BY id DESC LIMIT 100');
            res.json(logs);
        } catch (err) {
            console.error('[Admin getAIRequestLogs] Error:', err);
            res.status(500).json({ error: 'Failed to fetch AI request logs.' });
        }
    }
};

module.exports = adminController;

