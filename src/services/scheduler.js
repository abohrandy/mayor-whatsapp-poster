const cron = require('node-cron');
const path = require('path');
const { getDb, logActivity } = require('../models/database');
const waClient = require('./whatsapp');
const { emitLog } = require('./socket');
const { sendAnnouncementPostedEmail } = require('./email');

/**
 * Schedule the announcement checker to run every 3 hours.
 * Also runs once on startup to catch any missed posts.
 */
async function scheduleAnnouncementChecker() {
    // Run every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
        console.log('[Scheduler] Running 30-minute announcement check...');
        await checkAndSendDue();
    }, { timezone: await getTimezone() });

    // Also run at startup after a short delay (let WA client connect first)
    setTimeout(async () => {
        console.log('[Scheduler] Running startup announcement check...');
        await checkAndSendDue();
    }, 30000); // 30-second delay on startup

    // Start background Queue Worker engine
    const { queueWorker } = require('../queue');
    queueWorker.start();

    console.log('[Scheduler] Announcement checker and Queue Worker initialized.');
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

    // Resolve sender WhatsApp session owned by this user
    let senderJid = ann.sender_jid;
    if (!senderJid) {
        try {
            const userSession = await db.get(
                "SELECT session_id FROM whatsapp_sessions WHERE user_id = ?",
                [ann.user_id]
            );
            if (userSession) {
                senderJid = userSession.session_id;
                console.log(`[Scheduler] Resolved empty sender_jid for announcement "${ann.title}" (user ${ann.user_id}) to: ${senderJid}`);
            }
        } catch (sessErr) {
            console.error('[Scheduler] Failed to resolve user session JID:', sessErr);
        }
    }

    if (!senderJid) {
        const msg = `[Scheduler] Announcement "${ann.title}" has no linked sender WhatsApp account. Skipping.`;
        console.warn(msg);
        emitLog(ann.user_id, { type: 'error', message: msg, timestamp: new Date().toISOString() });
        await logActivity('announcement_error', msg, ann.user_id);
        
        // Disable announcement so it does not loop infinitely
        await db.run(`UPDATE announcements SET status = 'inactive', next_post_at = NULL WHERE id = ?`, [ann.id]);
        return;
    }

    let mediaFiles = [];
    try { mediaFiles = JSON.parse(ann.media_files || '[]'); } catch { mediaFiles = []; }

    let targetGroups = [];
    try { targetGroups = JSON.parse(ann.target_groups || '[]'); } catch { targetGroups = []; }

    let targetContacts = [];
    try { targetContacts = JSON.parse(ann.target_contacts || '[]'); } catch { targetContacts = []; }

    let contactListIds = [];
    try { contactListIds = JSON.parse(ann.target_contact_lists || '[]'); } catch { contactListIds = []; }

    let audienceListIds = [];
    try { audienceListIds = JSON.parse(ann.target_audience_lists || '[]'); } catch { audienceListIds = []; }

    const includeStatus = Boolean(ann.include_status);

    // Expand Audience Lists into Groups and Contact Lists
    if (audienceListIds.length > 0) {
        for (const audId of audienceListIds) {
            const audRow = await db.get('SELECT groups, contact_list_ids FROM audience_lists WHERE id = ?', [audId]);
            if (audRow) {
                try {
                    const gList = JSON.parse(audRow.groups || '[]');
                    targetGroups.push(...gList);
                } catch {}
                try {
                    const cList = JSON.parse(audRow.contact_list_ids || '[]');
                    contactListIds.push(...cList);
                } catch {}
            }
        }
    }

    // Deduplicate
    targetGroups = [...new Set(targetGroups)];
    contactListIds = [...new Set(contactListIds)];
    targetContacts = [...new Set(targetContacts)];

    const hasTargets = targetGroups.length > 0 || targetContacts.length > 0 || contactListIds.length > 0 || includeStatus;
    if (!hasTargets) {
        const msg = `[Scheduler] Announcement "${ann.title}" has no target destinations configured. Skipping.`;
        console.warn(msg);
        emitLog(ann.user_id, { type: 'warning', message: msg, timestamp: new Date().toISOString() });
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

    // Check anti-spam limits
    const { checkSpamLimits } = require('./antiSpam');
    const spamCheck = await checkSpamLimits(ann.user_id, caption);
    if (!spamCheck.allowed) {
        const errMsg = `[Anti-Spam] Blocked announcement "${ann.title}": ${spamCheck.message}`;
        console.warn(errMsg);
        emitLog(ann.user_id, { type: 'error', message: errMsg, timestamp: new Date().toISOString() });
        await logActivity('announcement_error', errMsg, ann.user_id);
        
        // If it's a scheduled recurring post, advance it to avoid getting stuck, or mark inactive if one-time
        if (advanceRibbon) {
            if (ann.is_recurring) {
                const nextRibbonIdx = mediaFiles.length > 1 ? (ribbonIdx + 1) % mediaFiles.length : 0;
                let nextCaptionIdx = 0;
                if (captionVariations.length > 1) {
                    const captionIdx = ann.caption_index || 0;
                    nextCaptionIdx = (captionIdx + 1) % captionVariations.length;
                }
                
                let daysOfWeek = [];
                try { daysOfWeek = JSON.parse(ann.recurrence_days_of_week || '[]'); } catch { daysOfWeek = []; }
                const nextPostAt = new Date();
                if (ann.post_time) {
                    const [h, m] = ann.post_time.split(':').map(Number);
                    nextPostAt.setHours(h, m, 0, 0);
                }
                if (daysOfWeek.length > 0) {
                    let found = false;
                    for (let i = 1; i <= 7; i++) {
                        const tempDate = new Date(nextPostAt);
                        tempDate.setDate(tempDate.getDate() + i);
                        if (daysOfWeek.includes(tempDate.getDay())) {
                            nextPostAt.setDate(nextPostAt.getDate() + i);
                            found = true;
                            break;
                        }
                    }
                    if (!found) nextPostAt.setDate(nextPostAt.getDate() + 1);
                } else {
                    const recurrenceDays = ann.recurrence_days || 1;
                    nextPostAt.setDate(nextPostAt.getDate() + recurrenceDays);
                }
                await db.run(
                    'UPDATE announcements SET ribbon_index = ?, caption_index = ?, next_post_at = ? WHERE id = ?',
                    [nextRibbonIdx, nextCaptionIdx, nextPostAt.toISOString(), ann.id]
                );
            } else {
                await db.run(
                    `UPDATE announcements SET status = 'inactive', next_post_at = NULL WHERE id = ?`,
                    [ann.id]
                );
            }
        }
        return;
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

    // Enqueue announcement dispatch job into JobQueue for asynchronous QueueWorker execution
    const { jobQueue } = require('../queue');
    const jobId = await jobQueue.enqueue(
        'announcement_dispatch',
        {
            announcementId: ann.id,
            announcementTitle: ann.title,
            mediaEntry,
            caption,
            captionVariations,
            captionIndex: ann.caption_index || 0,
            targetGroups,
            contactListIds,
            audienceListIds,
            includeStatus,
            senderJid,
            userId: ann.user_id,
            sendDelayMs
        },
        ann.user_id,
        3
    );

    console.log(`[Scheduler] Announcement "${ann.title}" enqueued into Job #${jobId}.`);

    // Send email notification to user
    if (ann.user_id) {
        try {
            const userRow = await db.get('SELECT email FROM users WHERE id = ?', [ann.user_id]);
            if (userRow && userRow.email) {
                sendAnnouncementPostedEmail(userRow.email, ann.title, targetGroups.length, failed)
                    .catch(err => console.error('[Scheduler] Announcement email error:', err));
            }
        } catch (err) {
            console.error('[Scheduler] Failed to send announcement email:', err);
        }
    }

    if (succeeded > 0) {
        const { logPostContent } = require('./antiSpam');
        await logPostContent(ann.user_id, caption);
    }

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

            // Recalculate next_post_at: specific days of week OR now + recurrence_days
            let daysOfWeek = [];
            try { daysOfWeek = JSON.parse(ann.recurrence_days_of_week || '[]'); } catch { daysOfWeek = []; }

            const nextPostAt = new Date();
            // Keep the same time-of-day
            if (ann.post_time) {
                const [h, m] = ann.post_time.split(':').map(Number);
                nextPostAt.setHours(h, m, 0, 0);
            }

            if (daysOfWeek.length > 0) {
                // Find next day of week matching selected days (starting tomorrow)
                let found = false;
                for (let i = 1; i <= 7; i++) {
                    const tempDate = new Date(nextPostAt);
                    tempDate.setDate(tempDate.getDate() + i);
                    if (daysOfWeek.includes(tempDate.getDay())) {
                        nextPostAt.setDate(nextPostAt.getDate() + i);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    nextPostAt.setDate(nextPostAt.getDate() + 1);
                }
            } else {
                const recurrenceDays = ann.recurrence_days || 1;
                nextPostAt.setDate(nextPostAt.getDate() + recurrenceDays);
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
async function sendToGroupWithRetry(groupId, mediaEntry, caption, groupMap = {}, maxRetries = 2, from = null, userId = null) {
    let attempt = 0;
    let delay = 3000; // start with 3 seconds retry delay on error
    const groupName = groupMap[groupId] || groupId;
    while (attempt < maxRetries) {
        try {
            await sendToGroup(groupId, mediaEntry, caption, from, userId);
            return; // success!
        } catch (err) {
            attempt++;
            const isRateLimit = err.message && (err.message.includes('420') || err.message.toLowerCase().includes('rate limit'));
            
            if (isRateLimit && attempt < maxRetries) {
                const waitSec = Math.round(delay / 1000);
                console.warn(`[Scheduler] Rate limited (420) sending to group "${groupName}" (${groupId}). Attempt ${attempt}/${maxRetries}. Retrying in ${waitSec}s...`);
                await logActivity('announcement_error', `Rate limited (420) sending to group "${groupName}" (${groupId}). Retrying in ${waitSec}s... (Attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2.5; // increase retry delay exponentially
            } else {
                if (attempt < maxRetries) {
                    console.warn(`[Scheduler] Error sending to group "${groupName}" (${groupId}). Attempt ${attempt}/${maxRetries}. Retrying in 2s... Error: ${err.message}`);
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
async function sendToGroup(groupId, mediaEntry, caption, from = null, userId = null) {
    try {
        if (mediaEntry && mediaEntry.path) {
            await waClient.sendMedia(groupId, mediaEntry.path, caption, mediaEntry.type || 'image', from);
        } else {
            await waClient.sendTextMessage(groupId, caption, from);
        }
        console.log(`[Scheduler] Sent to ${groupId} via ${from || 'default'} ✓`);
    } catch (err) {
        const msg = `Failed to send to ${groupId} via ${from || 'default'}: ${err.message}`;
        console.error('[Scheduler]', msg);
        emitLog(userId, { type: 'error', message: msg, timestamp: new Date().toISOString() });
        throw err;
    }
}

module.exports = { scheduleAnnouncementChecker, checkAndSendDue, sendAnnouncement };
