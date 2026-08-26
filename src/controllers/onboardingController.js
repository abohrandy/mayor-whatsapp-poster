const { getDb } = require('../models/database');
const waClient = require('../services/whatsapp');

// Real-world setup progress, independent of whether the onboarding wizard modal was ever
// opened/skipped/finished. Drives both the wizard's auto-show/re-prompt logic and the
// Dashboard "finish setup" checklist, so both always reflect what the account can actually do.
exports.getProgress = async (req, res) => {
    try {
        const db = await getDb();
        const userId = req.user.id;

        const mappings = await db.all('SELECT session_id FROM whatsapp_sessions WHERE user_id = ?', [userId]);
        const mappedIds = new Set(mappings.map(m => m.session_id));
        const liveStatus = waClient.getStatus() || {};
        const whatsappLinked = (liveStatus.sessions || []).some(s => mappedIds.has(s.id) && s.status === 'CONNECTED');

        const groupListCount = await db.get('SELECT COUNT(*) as count FROM group_lists WHERE user_id = ?', [userId]);
        const groupListCreated = groupListCount.count > 0;

        const announcements = await db.all(
            'SELECT target_groups, target_group_lists, target_audience_lists, target_contacts, target_contact_lists, include_status FROM announcements WHERE user_id = ?',
            [userId]
        );
        const postScheduled = announcements.some(a => {
            if (a.include_status) return true;
            for (const col of ['target_groups', 'target_group_lists', 'target_audience_lists', 'target_contacts', 'target_contact_lists']) {
                try {
                    if (JSON.parse(a[col] || '[]').length > 0) return true;
                } catch { /* malformed JSON counts as empty */ }
            }
            return false;
        });

        res.json({
            whatsapp_linked: whatsappLinked,
            group_list_created: groupListCreated,
            post_scheduled: postScheduled,
            all_complete: whatsappLinked && groupListCreated && postScheduled
        });
    } catch (error) {
        console.error('[Onboarding] Error computing progress:', error);
        res.status(500).json({ error: 'Failed to compute onboarding progress' });
    }
};
