const cron = require('node-cron');
const path = require('path');
const { getDb, logActivity } = require('../models/database');
const waClient = require('./whatsapp');
const { emitLog } = require('./socket');
const { sendAnnouncementPostedEmail } = require('./email');

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

    setTimeout(async () => {
        console.log('[Scheduler] Running startup announcement check...');
        await checkAndSendDue();
    }, 3000);

    const { queueWorker } = require('../queue');
    queueWorker.start();

    console.log('[Scheduler] Announcement checker (1-min interval) and Queue Worker initialized.');
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
            let isDue = false;
            if (ann.next_post_at && ann.next_post_at <= nowIso) {
                isDue = true;
            } else if (ann.post_time && ann.post_time <= currentHHMM) {
                const lastPostedDay = ann.last_posted_at ? ann.last_posted_at.slice(0, 10) : null;
                if (lastPostedDay !== todayStr) {
                    isDue = true;
                }
            }

            if (isDue) {
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
            const userSession = await db.get(
                "SELECT session_id FROM whatsapp_sessions WHERE user_id = ? LIMIT 1",
                [ann.user_id]
            );
            if (userSession) {
                senderJid = userSession.session_id;
            } else {
                // Try retrieving active session from waClient directly
                const status = await waClient.getStatus();
                if (status && status.sessions && status.sessions.length > 0) {
                    const connSess = status.sessions.find(s => s.status === 'CONNECTED') || status.sessions[0];
                    if (connSess) {
                        senderJid = connSess.id;
                        await db.run(
                            "INSERT OR IGNORE INTO whatsapp_sessions (user_id, session_id) VALUES (?, ?)",
                            [ann.user_id || 1, senderJid]
                        );
                        console.log(`[Scheduler] Auto-bound active bridge session ${senderJid} to user ${ann.user_id || 1}`);
                    }
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
        const nextTry = computeNextPostAt(ann.post_time, ann.is_recurring, ann.recurrence_days, daysOfWeek);
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

module.exports = { scheduleAnnouncementChecker, checkAndSendDue, sendAnnouncement, computeNextPostAt };
