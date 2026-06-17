const { getDb, logActivity } = require('../models/database');

exports.list = async (req, res) => {
    try {
        const db = await getDb();
        const profiles = await db.all('SELECT * FROM posting_profiles WHERE user_id = ? ORDER BY name ASC', [req.user.id]);
        res.json(profiles.map(p => ({
            ...p,
            groups: JSON.parse(p.groups || '[]')
        })));
    } catch (error) {
        console.error('Error fetching posting profiles:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const db = await getDb();
        const { name, groups } = req.body;

        if (!name || !groups || !Array.isArray(groups)) {
            return res.status(400).json({ error: 'Name and groups array are required.' });
        }

        // Check user-scoped uniqueness
        const existing = await db.get('SELECT id FROM posting_profiles WHERE user_id = ? AND name = ?', [req.user.id, name.trim()]);
        if (existing) {
            return res.status(400).json({ error: 'A profile with this name already exists.' });
        }

        const groupsJSON = JSON.stringify(groups);

        const result = await db.run(
            'INSERT INTO posting_profiles (name, groups, user_id) VALUES (?, ?, ?)',
            [name.trim(), groupsJSON, req.user.id]
        );

        const newId = result.lastID;
        await logActivity('profile_created', `Posting Profile "${name}" created with ${groups.length} groups.`, req.user.id);

        res.status(201).json({
            id: newId,
            name: name.trim(),
            groups
        });
    } catch (error) {
        console.error('Error creating posting profile:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;

        // Fetch name for logging and security check
        const profile = await db.get('SELECT name FROM posting_profiles WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' });
        }

        await db.run('DELETE FROM posting_profiles WHERE id = ? AND user_id = ?', [id, req.user.id]);
        await logActivity('profile_deleted', `Posting Profile "${profile.name}" deleted.`, req.user.id);

        res.json({ message: 'Profile deleted successfully.' });
    } catch (error) {
        console.error('Error deleting posting profile:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;
        const { name, groups } = req.body;

        if (!name || !groups || !Array.isArray(groups)) {
            return res.status(400).json({ error: 'Name and groups array are required.' });
        }

        // Fetch existing and security check
        const existing = await db.get('SELECT name FROM posting_profiles WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Profile not found.' });
        }

        // Check uniqueness if name changed
        if (existing.name !== name.trim()) {
            const dup = await db.get('SELECT id FROM posting_profiles WHERE user_id = ? AND name = ? AND id != ?', [req.user.id, name.trim(), id]);
            if (dup) {
                return res.status(400).json({ error: 'A profile with this name already exists.' });
            }
        }

        const groupsJSON = JSON.stringify(groups);

        await db.run(
            'UPDATE posting_profiles SET name = ?, groups = ? WHERE id = ? AND user_id = ?',
            [name.trim(), groupsJSON, id, req.user.id]
        );

        await logActivity('profile_updated', `Posting Profile "${name}" updated with ${groups.length} groups.`, req.user.id);

        res.json({
            id: parseInt(id),
            name: name.trim(),
            groups
        });
    } catch (error) {
        console.error('Error updating posting profile:', error);
        res.status(500).json({ error: error.message });
    }
};
