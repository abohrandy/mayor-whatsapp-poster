const { getDb, logActivity } = require('../models/database');

exports.list = async (req, res) => {
    try {
        const db = await getDb();
        const lists = await db.all('SELECT * FROM group_lists WHERE user_id = ? ORDER BY name ASC', [req.user.id]);
        res.json(lists.map(l => ({
            ...l,
            groups: JSON.parse(l.groups || '[]')
        })));
    } catch (error) {
        console.error('Error fetching group lists:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.get = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;
        const list = await db.get('SELECT * FROM group_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!list) {
            return res.status(404).json({ error: 'Group list not found.' });
        }
        res.json({
            ...list,
            groups: JSON.parse(list.groups || '[]')
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const db = await getDb();
        const { name, description, groups } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        const existing = await db.get('SELECT id FROM group_lists WHERE user_id = ? AND name = ?', [req.user.id, name.trim()]);
        if (existing) {
            return res.status(400).json({ error: 'A group list with this name already exists.' });
        }

        const groupsJSON = JSON.stringify(Array.isArray(groups) ? groups : []);

        const result = await db.run(
            'INSERT INTO group_lists (name, description, groups, user_id) VALUES (?, ?, ?, ?)',
            [name.trim(), description ? description.trim() : '', groupsJSON, req.user.id]
        );

        await logActivity('group_list_created', `Group List "${name}" created.`, req.user.id);

        res.status(201).json({
            id: result.lastID,
            name: name.trim(),
            description: description ? description.trim() : '',
            groups: Array.isArray(groups) ? groups : []
        });
    } catch (error) {
        console.error('Error creating group list:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;
        const { name, description, groups } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        const existing = await db.get('SELECT name FROM group_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Group list not found.' });
        }

        if (existing.name !== name.trim()) {
            const dup = await db.get('SELECT id FROM group_lists WHERE user_id = ? AND name = ? AND id != ?', [req.user.id, name.trim(), id]);
            if (dup) {
                return res.status(400).json({ error: 'A group list with this name already exists.' });
            }
        }

        const groupsJSON = JSON.stringify(Array.isArray(groups) ? groups : []);

        await db.run(
            'UPDATE group_lists SET name = ?, description = ?, groups = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [name.trim(), description ? description.trim() : '', groupsJSON, id, req.user.id]
        );

        await logActivity('group_list_updated', `Group List "${name}" updated.`, req.user.id);

        res.json({
            id: parseInt(id),
            name: name.trim(),
            description: description ? description.trim() : '',
            groups: Array.isArray(groups) ? groups : []
        });
    } catch (error) {
        console.error('Error updating group list:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;

        const list = await db.get('SELECT name FROM group_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!list) {
            return res.status(404).json({ error: 'Group list not found.' });
        }

        await db.run('DELETE FROM group_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);

        await logActivity('group_list_deleted', `Group List "${list.name}" deleted.`, req.user.id);

        res.json({ message: 'Group list deleted successfully.' });
    } catch (error) {
        console.error('Error deleting group list:', error);
        res.status(500).json({ error: error.message });
    }
};
