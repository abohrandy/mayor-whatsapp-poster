const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { getDb, logActivity } = require('../models/database');
const waClient = require('./whatsapp');
const { emitLog } = require('./socket');
const { sendAnnouncementPostedEmail, sendPaymentReminderEmail } = require('./email');

const PAYMENT_REMINDER_WINDOW_DAYS = 3;

const MEDIA_RETENTION_DAYS = parseInt(process.env.ANNOUNCEMENT_MEDIA_RETENTION_DAYS || '7', 10);

function computeNextPostAt(postTimeStr = '08:00', isRecurring = 0, recurrenceDays = 1, daysOfWeek = []) {
    const now = new Date();
    let target = new Date();

    const [h, m] = (postTimeStr || '08:00').split(':').map(Number);
    target.setHours(h || 0, m || 0, 0, 0);

    if (target <= now) {
        if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
            let found = false;
            for (let i = 1; i <= 7; i++) {
                const temp = new Date(target);
                temp.setDate(temp.getDate() + i);
                if (daysOfWeek.includes(temp.getDay())) {
                    target = temp;
                    found = true;
                    break;
                }
            }
            if (!found) target.setDate(target.getDate() + 1);
        } else {
            const days = recurrenceDays ? parseInt(recurrenceDays) : 1;
            target.setDate(target.getDate() + (isRecurring ? days : 0));
        }
    }

    return target.toISOString();
}

/**
 * Schedule the announcement checker to run every 1 minute.
 * Also runs once on startup to catch any missed posts.
 */
async function scheduleAnnouncementChecker() {
    cron.schedule('* * * * *', async () => {
        await checkAndSendDue();
    }, { timezone: await getTimezone() });

    // Daily cleanup of media belonging to one-time announcements that have already been sent
    cron.schedule('30 3 * * *', async () => {
        await cleanupOldAnnouncementMedia();
    }, { timezone: await getTimezone() });

    // Daily sweep to deactivate manually-activated accounts whose admin-granted window has passed
    cron.schedule('15 3 * * *', async () => {
        await deactivateExpiredManualAccounts();
    }, { timezone: await getTimezone() });

    // Daily reminder to users whose trial/manual access is about to expire, so they can pay before losing access
    cron.schedule('0 8 * * *', async () => {
        await sendPaymentReminders();
    }, { timezone: await getTimezone() });

    setTimeout(async () => {
        console.log('[Scheduler] Running startup announcement check...');
        await checkAndSendDue();
        await cleanupOldAnnouncementMedia();
        await deactivateExpiredManualAccounts();
        await sendPaymentReminders();
    }, 3000);

    const { queueWorker } = require('../queue');
    queueWorker.start();

    console.log(`[Scheduler] Announcement checker (1-min interval), daily media cleanup (retention: ${MEDIA_RETENTION_DAYS}d), manual-access expiry sweep, and Queue Worker initialized.`);
}

/**
 * Flip subscription_status to 'inactive' for accounts an admin manually activated with a
 * fixed number of days that have since passed. requireSubscription already blocks these
 * accounts at request-time regardless of this sweep; this just keeps the admin dashboard's
 * active/inactive counts and status badges accurate instead of showing them as active forever.
 */
async function deactivateExpiredManualAccounts() {
    try {
        const db = await getDb();
        const now = new Date().toISOString();

        const expired = await db.all(
            `SELECT id, email FROM users
             WHERE subscription_status = 'active'
               AND manual_expires_at IS NOT NULL
               AND manual_expires_at <= ?`,
            [now]
        );

        if (expired.length === 0) return;

        await db.run(
            `UPDATE users SET subscription_status = 'inactive'
             WHERE subscription_status = 'active'
               AND manual_expires_at IS NOT NULL
               AND manual_expires_at <= ?`,
            [now]
        );

        console.log(`[Scheduler] Deactivated ${expired.length} account(s) whose manually-granted access expired: ${expired.map(u => u.email).join(', ')}`);
        await logActivity('manual_access_expired', `Auto-deactivated ${expired.length} account(s) after their manually-granted access window expired.`);
    } catch (error) {
        console.error('[Scheduler] Error in deactivateExpiredManualAccounts:', error);
    }
}

/**
 * Email active trial/manually-granted users whose access expires within
 * PAYMENT_REMINDER_WINDOW_DAYS so they can pay before losing access. Runs daily,
 * so a user in the window gets one reminder per day until they renew or expire —
 * intentional, not a dedup bug: it mirrors a normal countdown reminder.
 * Paystack-recurring accounts are skipped since Paystack handles their own billing reminders.
 */
async function sendPaymentReminders() {
    try {
        const db = await getDb();
        const now = new Date();
        const windowEnd = new Date(now.getTime() + PAYMENT_REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const nowIso = now.toISOString();

        const dueSoon = await db.all(
            `SELECT id, email, tier, trial_ends_at, manual_expires_at FROM users
             WHERE subscription_status = 'active'
               AND paystack_subscription_code IS NULL
               AND (
                 (tier = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at > ? AND trial_ends_at <= ?)
                 OR (tier != 'trial' AND manual_expires_at IS NOT NULL AND manual_expires_at > ? AND manual_expires_at <= ?)
               )`,
            [nowIso, windowEnd, nowIso, windowEnd]
        );

        for (const user of dueSoon) {
            const expiresAt = user.tier === 'trial' ? user.trial_ends_at : user.manual_expires_at;
            const daysLeft = Math.max(1, Math.ceil((new Date(expiresAt) - now) / (24 * 60 * 60 * 1000)));

            sendPaymentReminderEmail(user.email, expiresAt, daysLeft)
                .catch(err => console.error('[Scheduler] Payment reminder email error:', err));
        }

        if (dueSoon.length > 0) {
            console.log(`[Scheduler] Sent payment reminder emails to ${dueSoon.length} user(s): ${dueSoon.map(u => u.email).join(', ')}`);
        }
    } catch (error) {
        console.error('[Scheduler] Error in sendPaymentReminders:', error);
    }
}

/**
 * Delete media files for one-time (non-recurring) announcements that were sent
 * more than MEDIA_RETENTION_DAYS ago. Recurring announcements are left untouched
 * since their media is reused on every cycle.
 */
async function cleanupOldAnnouncementMedia() {
    try {
        const db = await getDb();
        const cutoff = new Date(Date.now() - MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const stale = await db.all(
            `SELECT id, title, media_files FROM announcements
             WHERE is_recurring = 0 AND status = 'inactive'
               AND last_posted_at IS NOT NULL AND last_posted_at <= ?
               AND media_files IS NOT NULL AND media_files != '[]'`,
            [cutoff]
        );

        if (stale.length === 0) return;

        const baseDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
        let freedBytes = 0;
        let filesDeleted = 0;

        for (const ann of stale) {
            let files = [];
            try { files = JSON.parse(ann.media_files || '[]'); } catch { files = []; }

            for (const f of files) {
                if (!f.path) continue;
                const fullPath = path.isAbsolute(f.path) ? f.path : path.resolve(baseDir, f.path);
                try {
                    if (fs.existsSync(fullPath)) {
                        freedBytes += fs.statSync(fullPath).size;
                        fs.unlinkSync(fullPath);
                        filesDeleted++;
                    }
                } catch (err) {
                    console.error(`[Scheduler] Failed to delete stale media file ${fullPath}:`, err.message);
                }
            }

            await db.run("UPDATE announcements SET media_files = '[]' WHERE id = ?", [ann.id]);
        }

        const freedMb = (freedBytes / 1024 / 1024).toFixed(1);
        console.log(`[Scheduler] Media cleanup: removed ${filesDeleted} file(s) (${freedMb} MB) from ${stale.length} one-time announcement(s) sent more than ${MEDIA_RETENTION_DAYS} day(s) ago.`);
        if (filesDeleted > 0) {
            await logActivity('media_cleanup', `Auto-cleanup removed ${filesDeleted} file(s) (${freedMb} MB) from ${stale.length} old announcement(s).`);
        }
    } catch (error) {
        console.error('[Scheduler] Error in cleanupOldAnnouncementMedia:', error);
    }
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
        const nowIso = now.toISOString();

        // 1. Auto-heal any active announcements with missing/null next_post_at
        const unassigned = await db.all("SELECT * FROM announcements WHERE status = 'active' AND (next_post_at IS NULL OR next_post_at = '')");
        for (const ann of unassigned) {
            let daysOfWeek = [];
            try { daysOfWeek = JSON.parse(ann.recurrence_days_of_week || '[]'); } catch {}
            const computedNext = computeNextPostAt(ann.post_time, ann.is_recurring, ann.recurrence_days, daysOfWeek);
            await db.run("UPDATE announcements SET next_post_at = ? WHERE id = ?", [computedNext, ann.id]);
            console.log(`[Scheduler] Auto-healed announcement #${ann.id} ("${ann.title}") next_post_at -> ${computedNext}`);
        }

        // 2. Fetch active announcements and check if due by next_post_at OR morning post_time catch-up
        const announcements = await db.all("SELECT * FROM announcements WHERE status = 'active'");

        const dueList = [];
        const todayStr = nowIso.slice(0, 10);
        const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        for (const ann of announcements) {
            if (ann.next_post_at && ann.next_post_at <= nowIso) {
                dueList.push(ann);
            }
        }

        if (dueList.length === 0) {
            return;
        }

        console.log(`[Scheduler] Found ${dueList.length} due announcement(s).`);

        for (const ann of dueList) {
            await sendAnnouncement(ann, true);
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
            // A user can accumulate multiple rows here (e.g. an abandoned QR-scan attempt
            // leaves a stale, never-connected "temp_..." session_id behind), so picking the
            // first row by insertion order can hand back a dead session while a genuinely
            // connected one sits right next to it. Prefer whichever of the user's own
            // sessions the bridge currently reports as CONNECTED.
            const userSessions = await db.all(
                "SELECT session_id FROM whatsapp_sessions WHERE user_id = ?",
                [ann.user_id]
            );
            const userSessionIds = new Set(userSessions.map(s => s.session_id));
            const status = await waClient.getStatus();
            const bridgeSessions = (status && status.sessions) || [];
            const connSess = bridgeSessions.find(s => userSessionIds.has(s.id) && s.status === 'CONNECTED');

            if (connSess) {
                senderJid = connSess.id;
            } else if (userSessions.length > 0) {
                senderJid = userSessions[0].session_id;
            } else if (bridgeSessions.length > 0) {
                // Try retrieving active session from waClient directly
                const fallback = bridgeSessions.find(s => s.status === 'CONNECTED') || bridgeSessions[0];
                if (fallback) {
                    senderJid = fallback.id;
                    await db.run(
                        "INSERT OR IGNORE INTO whatsapp_sessions (user_id, session_id) VALUES (?, ?)",
                        [ann.user_id || 1, senderJid]
                    );
                    console.log(`[Scheduler] Auto-bound active bridge session ${senderJid} to user ${ann.user_id || 1}`);
                }
            }
        } catch (sessErr) {
            console.error('[Scheduler] Failed to resolve user session JID:', sessErr);
        }
    }

    if (!senderJid) {
        const msg = `[Scheduler] Announcement "${ann.title}" has no linked sender WhatsApp account. Please link WhatsApp on Status page.`;
        console.warn(msg);
        emitLog(ann.user_id, { type: 'warning', message: msg, timestamp: new Date().toISOString() });
        await logActivity('announcement_warning', msg, ann.user_id);
        
        let daysOfWeek = [];
        try { daysOfWeek = JSON.parse(ann.recurrence_days_of_week || '[]'); } catch {}
        await db.run(`UPDATE announcements SET next_post_at = ? WHERE id = ?`, [nextTry, ann.id]);
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

    let groupListIds = [];
    try { groupListIds = JSON.parse(ann.target_group_lists || '[]'); } catch { groupListIds = []; }

    let audienceListIds = [];
    try { audienceListIds = JSON.parse(ann.target_audience_lists || '[]'); } catch { audienceListIds = []; }

    const includeStatus = Boolean(ann.include_status);

    // Expand Group Lists into Groups
    if (groupListIds.length > 0) {
        for (const gListId of groupListIds) {
            const glRow = await db.get('SELECT groups FROM group_lists WHERE id = ?', [gListId]);
            if (glRow) {
                try {
                    const gList = JSON.parse(glRow.groups || '[]');
                    targetGroups.push(...gList);
                } catch {}
            }
        }
    }

    // Expand Audience Lists into Groups, Group Lists, and Contact Lists
    if (audienceListIds.length > 0) {
        for (const audId of audienceListIds) {
            const audRow = await db.get('SELECT groups, contact_list_ids, group_list_ids FROM audience_lists WHERE id = ?', [audId]);
            if (audRow) {
                try {
                    const gList = JSON.parse(audRow.groups || '[]');
                    targetGroups.push(...gList);
                } catch {}
                try {
                    const cList = JSON.parse(audRow.contact_list_ids || '[]');
                    contactListIds.push(...cList);
                } catch {}
                try {
                    const glList = JSON.parse(audRow.group_list_ids || '[]');
                    for (const gListId of glList) {
                        const glRow = await db.get('SELECT groups FROM group_lists WHERE id = ?', [gListId]);
                        if (glRow) {
                            const gList = JSON.parse(glRow.groups || '[]');
                            targetGroups.push(...gList);
                        }
                    }
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
        
        if (advanceRibbon) {
            let daysOfWeek = [];
            try { daysOfWeek = JSON.parse(ann.recurrence_days_of_week || '[]'); } catch {}
            const nextPostAt = computeNextPostAt(ann.post_time, ann.is_recurring, ann.recurrence_days, daysOfWeek);
            await db.run('UPDATE announcements SET next_post_at = ? WHERE id = ?', [nextPostAt, ann.id]);
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

    // Update last_posted_at
    const nowIso = new Date().toISOString();
    await db.run('UPDATE announcements SET last_posted_at = ? WHERE id = ?', [nowIso, ann.id]);

    // Send email notification to user
    if (ann.user_id) {
        try {
            const userRow = await db.get('SELECT email FROM users WHERE id = ?', [ann.user_id]);
            if (userRow && userRow.email) {
                sendAnnouncementPostedEmail(userRow.email, ann.title, targetGroups.length, 0)
                    .catch(err => console.error('[Scheduler] Announcement email error:', err));
            }
        } catch (err) {
            console.error('[Scheduler] Failed to send announcement email:', err);
        }
    }

    const { logPostContent } = require('./antiSpam');
    await logPostContent(ann.user_id, caption);

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
            const nextPostAt = computeNextPostAt(ann.post_time, ann.is_recurring, ann.recurrence_days, daysOfWeek);

            await db.run(
                'UPDATE announcements SET ribbon_index = ?, caption_index = ?, next_post_at = ? WHERE id = ?',
                [nextRibbonIdx, nextCaptionIdx, nextPostAt, ann.id]
            );
        } else {
            await db.run(
                `UPDATE announcements SET status = 'inactive', next_post_at = NULL WHERE id = ?`,
                [ann.id]
            );
        }
    }
}

module.exports = { scheduleAnnouncementChecker, checkAndSendDue, sendAnnouncement, computeNextPostAt, cleanupOldAnnouncementMedia, deactivateExpiredManualAccounts };
