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

    // Determine caption (caption variations index)
    let captionVariations = [];
    try { captionVariations = JSON.parse(ann.caption_variations || '[]'); } catch { captionVariations = []; }

    let caption = ann.caption || ann.title;
    if (captionVariations.length > 0) {
        const captionIdx = ann.caption_index || 0;
        caption = captionVariations[captionIdx % captionVariations.length];
    }

    // Fetch send delay from settings
    let sendDelayMs = 5000;
    try {
        const settings = await db.get('SELECT send_delay_seconds FROM settings WHERE id = 1');
        if (settings && settings.send_delay_seconds !== undefined) {
            sendDelayMs = settings.send_delay_seconds * 1000;
        }
    } catch (err) {
        console.error('[Scheduler] Failed to get send_delay_seconds settings:', err);
    }

    // Send to ALL target groups sequentially with a delay to prevent timeouts/congestion
    const sendResults = [];
    for (const groupId of targetGroups) {
        try {
            await sendToGroupWithRetry(groupId, mediaEntry, caption);
            sendResults.push({ status: 'fulfilled' });
        } catch (err) {
            sendResults.push({ status: 'rejected', reason: err });
            // Log specific error message to DB
            await logActivity('announcement_error', `Failed to send to group ${groupId}: ${err.message}`);
        }
        // Configurable delay between sending to groups to avoid rate-limiting and timeouts
        await new Promise(resolve => setTimeout(resolve, sendDelayMs));
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

            // Advance caption index (cycle through text variations)
            let nextCaptionIdx = 0;
            if (captionVariations.length > 1) {
                const captionIdx = ann.caption_index || 0;
                nextCaptionIdx = (captionIdx + 1) % captionVariations.length;
            }

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
                'UPDATE announcements SET ribbon_index = ?, caption_index = ?, next_post_at = ? WHERE id = ?',
                [nextRibbonIdx, nextCaptionIdx, nextPostAt.toISOString(), ann.id]
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
 * Send to group with retry support and exponential backoff on rate limiting (error 420).
 */
async function sendToGroupWithRetry(groupId, mediaEntry, caption, maxRetries = 3) {
    let attempt = 0;
    let delay = 3000; // start with 3 seconds retry delay on error
    while (attempt < maxRetries) {
        try {
            await sendToGroup(groupId, mediaEntry, caption);
            return; // success!
        } catch (err) {
            attempt++;
            const isRateLimit = err.message && (err.message.includes('420') || err.message.toLowerCase().includes('rate limit'));
            
            if (isRateLimit && attempt < maxRetries) {
                const waitSec = Math.round(delay / 1000);
                console.warn(`[Scheduler] Rate limited (420) sending to group ${groupId}. Attempt ${attempt}/${maxRetries}. Retrying in ${waitSec}s...`);
                await logActivity('announcement_error', `Rate limited (420) sending to group ${groupId}. Retrying in ${waitSec}s... (Attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2.5; // increase retry delay exponentially
            } else {
                if (attempt < maxRetries) {
                    console.warn(`[Scheduler] Error sending to group ${groupId}. Attempt ${attempt}/${maxRetries}. Retrying in 2s... Error: ${err.message}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    throw err; // throw last error if max retries exceeded
                }
            }
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
