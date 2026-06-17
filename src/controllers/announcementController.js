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
                recurrence_days_of_week, post_time, target_groups, next_post_at
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

            // Parse target_groups
            let groups = [];
            try { groups = JSON.parse(target_groups || '[]'); } catch { groups = []; }

            // Calculate next_post_at
            let nextPostAt = null;
            if (next_post_at) {
                nextPostAt = next_post_at;
            } else if (!parseInt(is_recurring) && post_time) {
                // one-time: use today + post_time if no explicit datetime given
                nextPostAt = null;
            }

            // Parse caption_variations
            let variations = [];
            try { variations = JSON.parse(caption_variations || '[]'); } catch { variations = []; }

            // Parse recurrence_days_of_week
            let daysOfWeek = [];
            try { daysOfWeek = JSON.parse(recurrence_days_of_week || '[]'); } catch { daysOfWeek = []; }

            const db = await initDb();
            const result = await db.run(
                `INSERT INTO announcements
                    (title, caption, caption_variations, caption_index, media_files, is_recurring, recurrence_days, recurrence_days_of_week, post_time, target_groups, ribbon_index, status, next_post_at)
                 VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 'active', ?)`,
                [
                    title,
                    caption || '',
                    JSON.stringify(variations),
                    JSON.stringify(mediaFiles),
                    parseInt(is_recurring) || 0,
                    recurrence_days ? parseInt(recurrence_days) : null,
                    JSON.stringify(daysOfWeek),
                    post_time || '08:00',
                    JSON.stringify(groups),
                    nextPostAt || null
                ]
            );

            emitStats({ action: 'create' });
            await logActivity('announcement_added', `Added announcement: "${title}"`);
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
                recurrence_days_of_week, post_time, target_groups, next_post_at, keep_media
            } = req.body;

            const db = await initDb();
            const existing = await db.get('SELECT * FROM announcements WHERE id = ?', [id]);
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

            let variations = [];
            try { variations = JSON.parse(caption_variations || '[]'); } catch { variations = []; }

            let daysOfWeek = [];
            try { daysOfWeek = JSON.parse(recurrence_days_of_week || '[]'); } catch { daysOfWeek = []; }

            await db.run(
                `UPDATE announcements
                 SET title = ?, caption = ?, caption_variations = ?, media_files = ?, is_recurring = ?,
                     recurrence_days = ?, recurrence_days_of_week = ?, post_time = ?, target_groups = ?, next_post_at = ?
                 WHERE id = ?`,
                [
                    title,
                    caption || '',
                    JSON.stringify(variations),
                    JSON.stringify(mediaFiles),
                    parseInt(is_recurring) || 0,
                    recurrence_days ? parseInt(recurrence_days) : null,
                    JSON.stringify(daysOfWeek),
                    post_time || '08:00',
                    JSON.stringify(groups),
                    next_post_at || null,
                    id
                ]
            );

            emitStats({ action: 'update' });
            await logActivity('announcement_updated', `Updated announcement: "${title}"`);
            res.json({ message: 'Announcement updated successfully.' });
        } catch (error) {
            console.error('Error updating announcement:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async list(req, res) {
        try {
            const db = await initDb();
            const rows = await db.all('SELECT * FROM announcements ORDER BY created_at DESC');
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async delete(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();

            const ann = await db.get('SELECT title, media_files FROM announcements WHERE id = ?', [id]);
            if (ann) {
                // Delete uploaded files
                const files = JSON.parse(ann.media_files || '[]');
                const baseDir = process.env.DATA_DIR || path.join(__dirname, '..', '..');
                for (const f of files) {
                    if (f.path) {
                        const fullPath = path.isAbsolute(f.path) ? f.path : path.resolve(baseDir, f.path);
                        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                    }
                }
            }

            await db.run('DELETE FROM announcements WHERE id = ?', [id]);
            emitStats({ action: 'delete' });
            await logActivity('announcement_deleted', `Deleted announcement: "${ann?.title || `ID ${id}`}"`);
            res.json({ message: 'Announcement deleted.' });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async toggleStatus(req, res) {
        try {
            const { id } = req.params;
            const db = await initDb();
            const ann = await db.get('SELECT status FROM announcements WHERE id = ?', [id]);
            if (!ann) return res.status(404).json({ error: 'Not found.' });
            const newStatus = ann.status === 'active' ? 'inactive' : 'active';
            await db.run('UPDATE announcements SET status = ? WHERE id = ?', [newStatus, id]);
            res.json({ id, status: newStatus });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error.' });
        }
    },

    async deleteMedia(req, res) {
        try {
            const { id } = req.params;
            const { media_index } = req.body;
            const db = await initDb();
            const ann = await db.get('SELECT * FROM announcements WHERE id = ?', [id]);
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
                'UPDATE announcements SET media_files = ?, ribbon_index = ? WHERE id = ?',
                [JSON.stringify(files), ribbonIdx, id]
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
            const ann = await db.get('SELECT * FROM announcements WHERE id = ?', [id]);
            if (!ann) return res.status(404).json({ error: 'Announcement not found.' });

            const { sendAnnouncement } = require('../services/scheduler');
            setImmediate(() => sendAnnouncement(ann));

            res.json({ message: 'Post initiated. Check logs for status.' });
        } catch (error) {
            console.error('Error in postNow:', error);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }
};

module.exports = announcementController;
