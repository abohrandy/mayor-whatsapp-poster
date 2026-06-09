const { getDb, logActivity } = require('../models/database');

exports.list = async (req, res) => {
    try {
        const db = await getDb();
        const profiles = await db.all('SELECT * FROM posting_profiles ORDER BY name ASC');
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

        const groupsJSON = JSON.stringify(groups);

        const result = await db.run(
            'INSERT INTO posting_profiles (name, groups) VALUES (?, ?)',
            [name.trim(), groupsJSON]
        );

        const newId = result.lastID;
        await logActivity('profile_created', `Posting Profile "${name}" created with ${groups.length} groups.`);

        res.status(201).json({
            id: newId,
            name: name.trim(),
            groups
        });
    } catch (error) {
        console.error('Error creating posting profile:', error);
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'A profile with this name already exists.' });
        }
        res.status(500).json({ error: error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;

        // Fetch name for logging
        const profile = await db.get('SELECT name FROM posting_profiles WHERE id = ?', [id]);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' });
        }

        await db.run('DELETE FROM posting_profiles WHERE id = ?', [id]);
        await logActivity('profile_deleted', `Posting Profile "${profile.name}" deleted.`);

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

        const groupsJSON = JSON.stringify(groups);

        await db.run(
            'UPDATE posting_profiles SET name = ?, groups = ? WHERE id = ?',
            [name.trim(), groupsJSON, id]
        );

        await logActivity('profile_updated', `Posting Profile "${name}" updated with ${groups.length} groups.`);

        res.json({
            id: parseInt(id),
            name: name.trim(),
            groups
        });
    } catch (error) {
        console.error('Error updating posting profile:', error);
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'A profile with this name already exists.' });
        }
        res.status(500).json({ error: error.message });
    }
};
