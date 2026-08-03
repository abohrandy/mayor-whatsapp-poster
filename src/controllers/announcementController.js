const { initDb, logActivity } = require('../models/database');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const { emitStats } = require('../services/socket');

// Supported video MIME types
const VIDEO_MIMES = ['video/mp4', 'video/3gpp', 'video/avi', 'video/quicktime', 'video/x-matroska'];

function isVideo(mimetype) {
    return VIDEO_MIMES.includes(mimetype);
}

async function processAndSaveMedia(file, uploadDir) {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = isVideo(file.mimetype)
        ? path.extname(file.name) || '.mp4'
        : '.jpg';
    const fileName = `${Date.now()}-${path.basename(file.name, path.extname(file.name))}${ext}`;
    const uploadPath = path.join(uploadDir, fileName);
    const relPath = `uploads/announcements/${fileName}`;
    const mediaType = isVideo(file.mimetype) ? 'video' : 'image';

    if (mediaType === 'image') {
        // Compress image
        await sharp(file.data).jpeg({ quality: 90 }).toFile(uploadPath);
    } else {
        // Save video as-is
        await fs.promises.writeFile(uploadPath, file.data);
    }

    return { path: relPath, type: mediaType };
}

const announcementController = {
    async create(req, res) {
        try {
            const {
                title, caption, caption_variations, is_recurring, recurrence_days,
                recurrence_days_of_week, post_time, target_groups, target_contacts,
                target_contact_lists, target_audience_lists, include_status,
                next_post_at, sender_jid
            } = req.body;

            if (!title) return res.status(400).json({ error: 'Title is required.' });

            const uploadBase = process.env.DATA_DIR
                ? path.join(process.env.DATA_DIR, 'uploads', 'announcements')
                : path.join('uploads', 'announcements');

            // Handle multiple media files (ribbon)
            let mediaFiles = [];
            if (req.files) {
                // Normalise to array
                let files = req.files.media_files;
                if (!files) files = [];
                else if (!Array.isArray(files)) files = [files];

                for (const file of files) {
                    const saved = await processAndSaveMedia(file, uploadBase);
                    mediaFiles.push(saved);
                }
            }

            // Parse target destinations
            let groups = [];
            try { groups = JSON.parse(target_groups || '[]'); } catch { groups = []; }

            let contacts = [];
            try { contacts = JSON.parse(target_contacts || '[]'); } catch { contacts = []; }

            let contactLists = [];
            try { contactLists = JSON.parse(target_contact_lists || '[]'); } catch { contactLists = []; }

            let groupLists = [];
            try { groupLists = JSON.parse(target_group_lists || '[]'); } catch { groupLists = []; }

            let audienceLists = [];
            try { audienceLists = JSON.parse(target_audience_lists || '[]'); } catch { audienceLists = []; }

            const incStatus = parseInt(include_status) ? 1 : 0;

            const adminEmail = process.env.ADMIN_EMAIL;
            const isAdmin = adminEmail && req.user.email === adminEmail;
            let maxGroups = 3;
            if (isAdmin) {
                maxGroups = 999999;
            } else {
                const db2 = await initDb();
                const userPlan = await db2.get('SELECT max_groups FROM subscription_plans WHERE slug = ?', [req.user.tier]);
                maxGroups = userPlan?.max_groups || 3;
            }
            if (groups.length > maxGroups) {
                return res.status(400).json({
                    error: `Your subscription tier (${req.user.tier}) only allows sending to up to ${maxGroups} groups at a time. Please upgrade or reduce the number of selected groups.`
                });
            }

            // Parse recurrence_days_of_week
            let daysOfWeek = [];
            try { daysOfWeek = JSON.parse(recurrence_days_of_week || '[]'); } catch { daysOfWeek = []; }

            // Calculate next_post_at automatically if not explicitly provided
            const { computeNextPostAt } = require('../services/scheduler');
            let nextPostAt = next_post_at || computeNextPostAt(post_time || '08:00', parseInt(is_recurring) || 0, recurrence_days, daysOfWeek);

            // Parse caption_variations
            let variations = [];
            try { variations = JSON.parse(caption_variations || '[]'); } catch { variations = []; }

            const db = await initDb();
            const result = await db.run(
                `INSERT INTO announcements
                    (title, caption, caption_variations, caption_index, media_files, is_recurring, recurrence_days, recurrence_days_of_week, sender_jid, post_time, target_groups, target_contacts, target_contact_lists, target_group_lists, target_audience_lists, include_status, ribbon_index, status, next_post_at, user_id)
                 VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
                [
                    title,
                    caption || '',
                    JSON.stringify(variations),
                    JSON.stringify(mediaFiles),
                    parseInt(is_recurring) || 0,
                    recurrence_days ? parseInt(recurrence_days) : null,
                    JSON.stringify(daysOfWeek),
                    sender_jid || null,
                    post_time || '08:00',
                    JSON.stringify(groups),
                    JSON.stringify(contacts),
                    JSON.stringify(contactLists),
                    JSON.stringify(groupLists),
                    JSON.stringify(audienceLists),
                    incStatus,
                    nextPostAt || null,
                    req.user.id
                ]
            );

            emitStats(req.user.id, { action: 'create' });
            await logActivity('announcement_added', `Added announcement: "${title}"`, req.user.id);
            res.status(201).json({ message: 'Announcement created successfully', id: result.lastID });
        } catch (error) {
            console.error('Error creating announcement:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async update(req, res) {
        try {
            const { id } = req.params;
            const {
                title, caption, caption_variations, is_recurring, recurrence_days,
                recurrence_days_of_week, post_time, target_groups, target_contacts,
                target_contact_lists, target_group_lists, target_audience_lists, include_status,
                next_post_at, keep_media, sender_jid
            } = req.body;

            const db = await initDb();
            const existing = await db.get('SELECT * FROM announcements WHERE id = ? AND user_id = ?', [id, req.user.id]);
            if (!existing) return res.status(404).json({ error: 'Announcement not found.' });

            const uploadBase = process.env.DATA_DIR
                ? path.join(process.env.DATA_DIR, 'uploads', 'announcements')
                : path.join('uploads', 'announcements');

            // Start with existing media files or empty
            let mediaFiles = JSON.parse(existing.media_files || '[]');

            // If new files uploaded, append them (or replace if keep_media is false)
            if (req.files && req.files.media_files) {
                let files = req.files.media_files;
                if (!Array.isArray(files)) files = [files];

                if (!parseInt(keep_media)) {
                    // Replace all existing media
                    mediaFiles = [];
                }
                for (const file of files) {
                    const saved = await processAndSaveMedia(file, uploadBase);
                    mediaFiles.push(saved);
                }
            }

            let groups = [];
            try { groups = JSON.parse(target_groups || '[]'); } catch { groups = []; }

            let contacts = [];
            try { contacts = JSON.parse(target_contacts || '[]'); } catch { contacts = []; }

            let contactLists = [];
            try { contactLists = JSON.parse(target_contact_lists || '[]'); } catch { contactLists = []; }

            let groupLists = [];
            try { groupLists = JSON.parse(target_group_lists || '[]'); } catch { groupLists = []; }

            let audienceLists = [];
            try { audienceLists = JSON.parse(target_audience_lists || '[]'); } catch { audienceLists = []; }

            const incStatus = parseInt(include_status) ? 1 : 0;

            const adminEmail = process.env.ADMIN_EMAIL;
            const isAdmin = adminEmail && req.user.email === adminEmail;
            let maxGroups = 3;
            if (isAdmin) {
                maxGroups = 999999;
            } else {
                const db2 = await initDb();
                const userPlan = await db2.get('SELECT max_groups FROM subscription_plans WHERE slug = ?', [req.user.tier]);
                maxGroups = userPlan?.max_groups || 3;
            }
            if (groups.length > maxGroups) {
                return res.status(400).json({
                    error: `Your subscription tier (${req.user.tier}) only allows sending to up to ${maxGroups} groups at a time. Please upgrade or reduce the number of selected groups.`
                });
            }

            let variations = [];
            try { variations = JSON.parse(caption_variations || '[]'); } catch { variations = []; }

            let daysOfWeek = [];
            try { daysOfWeek = JSON.parse(recurrence_days_of_week || '[]'); } catch { daysOfWeek = []; }

            const { computeNextPostAt } = require('../services/scheduler');
            let computedNextPostAt = next_post_at || computeNextPostAt(post_time || '08:00', parseInt(is_recurring) || 0, recurrence_days, daysOfWeek);

            await db.run(
                `UPDATE announcements
                 SET title = ?, caption = ?, caption_variations = ?, media_files = ?, is_recurring = ?,
                     recurrence_days = ?, recurrence_days_of_week = ?, sender_jid = ?, post_time = ?,
                     target_groups = ?, target_contacts = ?, target_contact_lists = ?, target_group_lists = ?, target_audience_lists = ?,
                     include_status = ?, next_post_at = ?
                 WHERE id = ? AND user_id = ?`,
                [
                    title,
                    caption || '',
                    JSON.stringify(variations),
                    JSON.stringify(mediaFiles),
                    parseInt(is_recurring) || 0,
                    recurrence_days ? parseInt(recurrence_days) : null,
                    JSON.stringify(daysOfWeek),
                    sender_jid || null,
                    post_time || '08:00',
                    JSON.stringify(groups),
                    JSON.stringify(contacts),
                    JSON.stringify(contactLists),
                    JSON.stringify(groupLists),
                    JSON.stringify(audienceLists),
                    incStatus,
                    computedNextPostAt,
                    id,
                    req.user.id
                ]
            );

            emitStats(req.user.id, { action: 'update' });
            await logActivity('announcement_updated', `Updated announcement: "${title}"`, req.user.id);
            res.json({ message: 'Announcement updated successfully.' });
        } catch (error) {
            console.error('Error updating announcement:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async list(req, res) {
        try {
            const db = await initDb();
            const rows = await db.all('SELECT * FROM announcements WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async delete(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();

            const ann = await db.get('SELECT title, media_files FROM announcements WHERE id = ? AND user_id = ?', [id, req.user.id]);
            if (!ann) return res.status(404).json({ error: 'Announcement not found.' });

            // Delete uploaded files
            const files = JSON.parse(ann.media_files || '[]');
            const baseDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
            for (const f of files) {
                if (f.path) {
                    const fullPath = path.isAbsolute(f.path) ? f.path : path.resolve(baseDir, f.path);
                    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                }
            }

            await db.run('DELETE FROM announcements WHERE id = ? AND user_id = ?', [id, req.user.id]);
            emitStats(req.user.id, { action: 'delete' });
            await logActivity('announcement_deleted', `Deleted announcement: "${ann.title}"`, req.user.id);
            res.json({ message: 'Announcement deleted.' });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async toggleStatus(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();
            const ann = await db.get('SELECT * FROM announcements WHERE id = ? AND user_id = ?', [id, req.user.id]);
            if (!ann) return res.status(404).json({ error: 'Not found.' });
            const newStatus = ann.status === 'active' ? 'inactive' : 'active';
            
            let nextPostAt = ann.next_post_at;
            if (newStatus === 'active') {
                const { computeNextPostAt } = require('../services/scheduler');
                let daysOfWeek = [];
                try { daysOfWeek = JSON.parse(ann.recurrence_days_of_week || '[]'); } catch {}
                nextPostAt = computeNextPostAt(ann.post_time, ann.is_recurring, ann.recurrence_days, daysOfWeek);
            }

            await db.run('UPDATE announcements SET status = ?, next_post_at = ? WHERE id = ? AND user_id = ?', [newStatus, nextPostAt, id, req.user.id]);
            res.json({ id, status: newStatus, next_post_at: nextPostAt });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async deleteMedia(req, res) {
        try {
            const { id } = req.params;
            const { media_index } = req.body;
            const db = await initDb();
            const ann = await db.get('SELECT * FROM announcements WHERE id = ? AND user_id = ?', [id, req.user.id]);
            if (!ann) return res.status(404).json({ error: 'Not found.' });

            let files = JSON.parse(ann.media_files || '[]');
            const idx = parseInt(media_index);
            if (idx >= 0 && idx < files.length) {
                const f = files[idx];
                if (f.path) {
                    const baseDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
                    const fullPath = path.isAbsolute(f.path) ? f.path : path.resolve(baseDir, f.path);
                    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                }
                files.splice(idx, 1);
            }

            // Reset ribbon_index if out of bounds
            let ribbonIdx = ann.ribbon_index;
            if (ribbonIdx >= files.length) ribbonIdx = 0;

            await db.run(
                'UPDATE announcements SET media_files = ?, ribbon_index = ? WHERE id = ? AND user_id = ?',
                [JSON.stringify(files), ribbonIdx, id, req.user.id]
            );
            res.json({ message: 'Media removed.', media_files: files });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async postNow(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();
            const ann = await db.get('SELECT * FROM announcements WHERE id = ? AND user_id = ?', [id, req.user.id]);
            if (!ann) return res.status(404).json({ error: 'Announcement not found.' });

            // Determine caption (caption variations index)
            let captionVariations = [];
            try { captionVariations = JSON.parse(ann.caption_variations || '[]'); } catch { captionVariations = []; }

            let caption = ann.caption || ann.title;
            if (captionVariations.length > 0) {
                const captionIdx = ann.caption_index || 0;
                caption = captionVariations[captionIdx % captionVariations.length];
            }

            const { checkSpamLimits } = require('../services/antiSpam');
            const spamCheck = await checkSpamLimits(req.user.id, caption);
            if (!spamCheck.allowed) {
                return res.status(400).json({ error: spamCheck.message });
            }

            await logActivity('announcement_posted', `Manual post initiated for "${ann.title}"`, req.user.id);

            const { sendAnnouncement } = require('../services/scheduler');
            setImmediate(() => sendAnnouncement(ann, true));

            res.json({ message: 'Manual post initiated. Check Activity Logs for status.' });
        } catch (error) {
            console.error('Error in postNow:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }
};

module.exports = announcementController;
