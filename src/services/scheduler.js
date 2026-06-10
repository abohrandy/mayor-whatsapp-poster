const cron = require('node-cron');
const path = require('path');
const { getDb, logActivity } = require('../models/database');
const waClient = require('./whatsapp');
const { emitLog } = require('./socket');

/**
 * Schedule the announcement checker to run every 3 hours.
 * Also runs once on startup to catch any missed posts.
 */
async function scheduleAnnouncementChecker() {
    // Run every 3 hours
    cron.schedule('0 */3 * * *', async () => {
        console.log('[Scheduler] Running 3-hour announcement check...');
        await checkAndSendDue();
    }, { timezone: await getTimezone() });

    // Also run at startup after a short delay (let WA client connect first)
    setTimeout(async () => {
        console.log('[Scheduler] Running startup announcement check...');
        await checkAndSendDue();
    }, 30000); // 30-second delay on startup

    console.log('[Scheduler] Announcement checker initialized (every 3 hours).');
}

async function getTimezone() {
    try {
        const db = await getDb();
        const settings = await db.get('SELECT timezone FROM settings WHERE id = 1');
        return settings?.timezone || 'Africa/Lagos';
    } catch {
        return 'Africa/Lagos';
    }
}

/**
 * Check for all due announcements and send them.
 */
async function checkAndSendDue() {
    try {
        const db = await getDb();
        const now = new Date();

        // Fetch all active announcements where next_post_at is due or null (one-time with no schedule)
        const announcements = await db.all(
            `SELECT * FROM announcements WHERE status = 'active' AND next_post_at IS NOT NULL AND next_post_at <= ?`,
            [now.toISOString()]
        );

        if (announcements.length === 0) {
            console.log('[Scheduler] No announcements due at this time.');
            return;
        }

        console.log(`[Scheduler] Found ${announcements.length} due announcement(s).`);

        for (const ann of announcements) {
            await sendAnnouncement(ann, true); // true = advance ribbon + recalculate next_post_at
        }
    } catch (error) {
        console.error('[Scheduler] Error in checkAndSendDue:', error);
    }
}

/**
 * Send a single announcement.
 * @param {Object} ann - The announcement DB row
 * @param {boolean} advanceRibbon - Whether to update ribbon_index and next_post_at in DB
 */
async function sendAnnouncement(ann, advanceRibbon = false) {
    const db = await getDb();

    let mediaFiles = [];
    try { mediaFiles = JSON.parse(ann.media_files || '[]'); } catch { mediaFiles = []; }

    let targetGroups = [];
    try { targetGroups = JSON.parse(ann.target_groups || '[]'); } catch { targetGroups = []; }

    if (targetGroups.length === 0) {
        const msg = `[Scheduler] Announcement "${ann.title}" has no target groups configured. Skipping.`;
        console.warn(msg);
        emitLog({ type: 'warning', message: msg, timestamp: new Date().toISOString() });
        return;
    }

    // Determine which media file to post (ribbon index)
    const ribbonIdx = ann.ribbon_index || 0;
    let mediaEntry = mediaFiles.length > 0 ? mediaFiles[ribbonIdx % mediaFiles.length] : null;

    const caption = ann.caption || ann.title;

    // Send to ALL target groups sequentially with a delay to prevent timeouts/congestion
    const sendResults = [];
    for (const groupId of targetGroups) {
        try {
            await sendToGroup(groupId, mediaEntry, caption);
            sendResults.push({ status: 'fulfilled' });
        } catch (err) {
            sendResults.push({ status: 'rejected', reason: err });
            // Log specific error message to DB
            await logActivity('announcement_error', `Failed to send to group ${groupId}: ${err.message}`);
        }
        // 1.5-second delay between sending to groups to avoid rate-limiting and timeouts
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const succeeded = sendResults.filter(r => r.status === 'fulfilled').length;
    const failed = sendResults.filter(r => r.status === 'rejected').length;

    const logMsg = `Announcement "${ann.title}" sent to ${succeeded}/${targetGroups.length} group(s)${failed > 0 ? ` (${failed} failed)` : ''}.`;
    console.log('[Scheduler]', logMsg);
    emitLog({ type: failed > 0 ? 'warning' : 'success', message: logMsg, timestamp: new Date().toISOString() });
    await logActivity('announcement_posted', logMsg);

    if (advanceRibbon) {
        if (ann.is_recurring) {
            // Advance ribbon index (cycle through media files)
            const nextRibbonIdx = mediaFiles.length > 1 ? (ribbonIdx + 1) % mediaFiles.length : 0;

            // Recalculate next_post_at: now + recurrence_days
            const recurrenceDays = ann.recurrence_days || 1;
            const nextPostAt = new Date();
            nextPostAt.setDate(nextPostAt.getDate() + recurrenceDays);
            // Keep the same time-of-day
            if (ann.post_time) {
                const [h, m] = ann.post_time.split(':').map(Number);
                nextPostAt.setHours(h, m, 0, 0);
            }

            await db.run(
                'UPDATE announcements SET ribbon_index = ?, next_post_at = ? WHERE id = ?',
                [nextRibbonIdx, nextPostAt.toISOString(), ann.id]
            );
        } else {
            // One-time: mark inactive
            await db.run(
                `UPDATE announcements SET status = 'inactive', next_post_at = NULL WHERE id = ?`,
                [ann.id]
            );
        }
    }
}

/**
 * Send a media file (or text-only) to a single WhatsApp group.
 */
async function sendToGroup(groupId, mediaEntry, caption) {
    try {
        if (mediaEntry && mediaEntry.path) {
            await waClient.sendMedia(groupId, mediaEntry.path, caption, mediaEntry.type || 'image');
        } else {
            await waClient.sendTextMessage(groupId, caption);
        }
        console.log(`[Scheduler] Sent to ${groupId} ✓`);
    } catch (err) {
        const msg = `Failed to send to ${groupId}: ${err.message}`;
        console.error('[Scheduler]', msg);
        emitLog({ type: 'error', message: msg, timestamp: new Date().toISOString() });
        throw err;
    }
}

module.exports = { scheduleAnnouncementChecker, checkAndSendDue, sendAnnouncement };
