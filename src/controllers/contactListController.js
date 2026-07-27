const { getDb, logActivity } = require('../models/database');

exports.list = async (req, res) => {
    try {
        const db = await getDb();
        const lists = await db.all('SELECT * FROM contact_lists WHERE user_id = ? ORDER BY name ASC', [req.user.id]);
        res.json(lists.map(l => ({
            ...l,
            contact_ids: JSON.parse(l.contact_ids || '[]')
        })));
    } catch (error) {
        console.error('Error fetching contact lists:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.get = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;
        const list = await db.get('SELECT * FROM contact_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!list) {
            return res.status(404).json({ error: 'Contact list not found.' });
        }

        const contactIds = JSON.parse(list.contact_ids || '[]');
        let contacts = [];
        if (contactIds.length > 0) {
            const placeholders = contactIds.map(() => '?').join(',');
            const rows = await db.all(
                `SELECT * FROM contacts WHERE id IN (${placeholders}) AND user_id = ?`,
                [...contactIds, req.user.id]
            );
            contacts = rows.map(c => ({
                ...c,
                tags: JSON.parse(c.tags || '[]'),
                custom_fields: JSON.parse(c.custom_fields || '{}')
            }));
        }

        res.json({
            ...list,
            contact_ids: contactIds,
            contacts
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const db = await getDb();
        const { name, description, contact_ids } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        const existing = await db.get('SELECT id FROM contact_lists WHERE user_id = ? AND name = ?', [req.user.id, name.trim()]);
        if (existing) {
            return res.status(400).json({ error: 'A contact list with this name already exists.' });
        }

        const contactIdsJSON = JSON.stringify(Array.isArray(contact_ids) ? contact_ids.map(Number) : []);

        const result = await db.run(
            'INSERT INTO contact_lists (name, description, contact_ids, user_id) VALUES (?, ?, ?, ?)',
            [name.trim(), description ? description.trim() : '', contactIdsJSON, req.user.id]
        );

        await logActivity('contact_list_created', `Contact List "${name}" created.`, req.user.id);

        res.status(201).json({
            id: result.lastID,
            name: name.trim(),
            description: description ? description.trim() : '',
            contact_ids: Array.isArray(contact_ids) ? contact_ids.map(Number) : []
        });
    } catch (error) {
        console.error('Error creating contact list:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;
        const { name, description, contact_ids } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        const existing = await db.get('SELECT name FROM contact_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Contact list not found.' });
        }

        if (existing.name !== name.trim()) {
            const dup = await db.get('SELECT id FROM contact_lists WHERE user_id = ? AND name = ? AND id != ?', [req.user.id, name.trim(), id]);
            if (dup) {
                return res.status(400).json({ error: 'A contact list with this name already exists.' });
            }
        }

        const contactIdsJSON = JSON.stringify(Array.isArray(contact_ids) ? contact_ids.map(Number) : []);

        await db.run(
            'UPDATE contact_lists SET name = ?, description = ?, contact_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [name.trim(), description ? description.trim() : '', contactIdsJSON, id, req.user.id]
        );

        await logActivity('contact_list_updated', `Contact List "${name}" updated.`, req.user.id);

        res.json({
            id: parseInt(id),
            name: name.trim(),
            description: description ? description.trim() : '',
            contact_ids: Array.isArray(contact_ids) ? contact_ids.map(Number) : []
        });
    } catch (error) {
        console.error('Error updating contact list:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;

        const list = await db.get('SELECT name FROM contact_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!list) {
            return res.status(404).json({ error: 'Contact list not found.' });
        }

        await db.run('DELETE FROM contact_lists WHERE id = ? AND user_id = ?', [id, req.user.id]);

        // Clean up from audience lists referencing this contact list
        const audienceLists = await db.all('SELECT id, contact_list_ids FROM audience_lists WHERE user_id = ?', [req.user.id]);
        for (const al of audienceLists) {
            let clIds = JSON.parse(al.contact_list_ids || '[]');
            const numericId = parseInt(id);
            if (clIds.includes(numericId)) {
                clIds = clIds.filter(i => i !== numericId);
                await db.run('UPDATE audience_lists SET contact_list_ids = ? WHERE id = ?', [JSON.stringify(clIds), al.id]);
            }
        }

        await logActivity('contact_list_deleted', `Contact List "${list.name}" deleted.`, req.user.id);

        res.json({ message: 'Contact list deleted successfully.' });
    } catch (error) {
        console.error('Error deleting contact list:', error);
        res.status(500).json({ error: error.message });
    }
};
