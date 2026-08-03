const { getDb, logActivity } = require('../models/database');

exports.list = async (req, res) => {
    try {
        const db = await getDb();
        const lists = await db.all('SELECT * FROM audience_lists WHERE user_id = ? ORDER BY name ASC', [req.user.id]);
        res.json(lists.map(l => ({
            ...l,
            groups: JSON.parse(l.groups || '[]'),
            contact_list_ids: JSON.parse(l.contact_list_ids || '[]'),
            group_list_ids: JSON.parse(l.group_list_ids || '[]')
        })));
    } catch (error) {
        console.error('Error fetching audience lists:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.get = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;
        const list = await db.get('SELECT * FROM audience_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!list) {
            return res.status(404).json({ error: 'Audience list not found.' });
        }
        res.json({
            ...list,
            groups: JSON.parse(list.groups || '[]'),
            contact_list_ids: JSON.parse(list.contact_list_ids || '[]'),
            group_list_ids: JSON.parse(list.group_list_ids || '[]')
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const db = await getDb();
        const { name, description, groups, contact_list_ids, group_list_ids } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        const existing = await db.get('SELECT id FROM audience_lists WHERE user_id = ? AND name = ?', [req.user.id, name.trim()]);
        if (existing) {
            return res.status(400).json({ error: 'An audience list with this name already exists.' });
        }

        const groupsJSON = JSON.stringify(Array.isArray(groups) ? groups : []);
        const contactListIdsJSON = JSON.stringify(Array.isArray(contact_list_ids) ? contact_list_ids.map(Number) : []);
        const groupListIdsJSON = JSON.stringify(Array.isArray(group_list_ids) ? group_list_ids.map(Number) : []);

        const result = await db.run(
            'INSERT INTO audience_lists (name, description, groups, contact_list_ids, group_list_ids, user_id) VALUES (?, ?, ?, ?, ?, ?)',
            [name.trim(), description ? description.trim() : '', groupsJSON, contactListIdsJSON, groupListIdsJSON, req.user.id]
        );

        const newId = result.lastID;
        await logActivity('audience_list_created', `Audience List "${name}" created.`, req.user.id);

        res.status(201).json({
            id: newId,
            name: name.trim(),
            description: description ? description.trim() : '',
            groups: Array.isArray(groups) ? groups : [],
            contact_list_ids: Array.isArray(contact_list_ids) ? contact_list_ids.map(Number) : [],
            group_list_ids: Array.isArray(group_list_ids) ? group_list_ids.map(Number) : []
        });
    } catch (error) {
        console.error('Error creating audience list:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;

        const item = await db.get('SELECT name FROM audience_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!item) {
            return res.status(404).json({ error: 'Audience list not found.' });
        }

        await db.run('DELETE FROM audience_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        await logActivity('audience_list_deleted', `Audience List "${item.name}" deleted.`, req.user.id);

        res.json({ message: 'Audience list deleted successfully.' });
    } catch (error) {
        console.error('Error deleting audience list:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;
        const { name, description, groups, contact_list_ids, group_list_ids } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        const existing = await db.get('SELECT name FROM audience_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Audience list not found.' });
        }

        if (existing.name !== name.trim()) {
            const dup = await db.get('SELECT id FROM audience_lists WHERE user_id = ? AND name = ? AND id != ?', [req.user.id, name.trim(), id]);
            if (dup) {
                return res.status(400).json({ error: 'An audience list with this name already exists.' });
            }
        }

        const groupsJSON = JSON.stringify(Array.isArray(groups) ? groups : []);
        const contactListIdsJSON = JSON.stringify(Array.isArray(contact_list_ids) ? contact_list_ids.map(Number) : []);
        const groupListIdsJSON = JSON.stringify(Array.isArray(group_list_ids) ? group_list_ids.map(Number) : []);

        await db.run(
            'UPDATE audience_lists SET name = ?, description = ?, groups = ?, contact_list_ids = ?, group_list_ids = ? WHERE id = ? AND user_id = ?',
            [name.trim(), description ? description.trim() : '', groupsJSON, contactListIdsJSON, groupListIdsJSON, id, req.user.id]
        );

        await logActivity('audience_list_updated', `Audience List "${name}" updated.`, req.user.id);

        res.json({
            id: parseInt(id),
            name: name.trim(),
            description: description ? description.trim() : '',
            groups: Array.isArray(groups) ? groups : [],
            contact_list_ids: Array.isArray(contact_list_ids) ? contact_list_ids.map(Number) : [],
            group_list_ids: Array.isArray(group_list_ids) ? group_list_ids.map(Number) : []
        });
    } catch (error) {
        console.error('Error updating audience list:', error);
        res.status(500).json({ error: error.message });
    }
};
