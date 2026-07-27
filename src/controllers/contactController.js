const { getDb, logActivity } = require('../models/database');

exports.list = async (req, res) => {
    try {
        const db = await getDb();
        const { search, tag } = req.query;

        let query = 'SELECT * FROM contacts WHERE user_id = ?';
        let params = [req.user.id];

        if (search) {
            query += ' AND (name LIKE ? OR phone_number LIKE ? OR email LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        query += ' ORDER BY name ASC';

        const contacts = await db.all(query, params);

        let filtered = contacts.map(c => ({
            ...c,
            tags: JSON.parse(c.tags || '[]'),
            custom_fields: JSON.parse(c.custom_fields || '{}')
        }));

        if (tag) {
            filtered = filtered.filter(c => Array.isArray(c.tags) && c.tags.includes(tag));
        }

        res.json(filtered);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.get = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;
        const contact = await db.get('SELECT * FROM contacts WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found.' });
        }
        res.json({
            ...contact,
            tags: JSON.parse(contact.tags || '[]'),
            custom_fields: JSON.parse(contact.custom_fields || '{}')
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const db = await getDb();
        const { name, phone_number, email, tags, custom_fields } = req.body;

        if (!name || !phone_number) {
            return res.status(400).json({ error: 'Name and phone number are required.' });
        }

        // Clean phone number
        const cleanPhone = phone_number.replace(/[^\d+]/g, '');

        const existing = await db.get('SELECT id FROM contacts WHERE user_id = ? AND phone_number = ?', [req.user.id, cleanPhone]);
        if (existing) {
            return res.status(400).json({ error: 'A contact with this phone number already exists.' });
        }

        const tagsJSON = JSON.stringify(Array.isArray(tags) ? tags : []);
        const customFieldsJSON = JSON.stringify(typeof custom_fields === 'object' && custom_fields ? custom_fields : {});

        const result = await db.run(
            'INSERT INTO contacts (name, phone_number, email, tags, custom_fields, user_id) VALUES (?, ?, ?, ?, ?, ?)',
            [name.trim(), cleanPhone, email ? email.trim() : null, tagsJSON, customFieldsJSON, req.user.id]
        );

        await logActivity('contact_created', `Contact "${name}" (${cleanPhone}) created.`, req.user.id);

        res.status(201).json({
            id: result.lastID,
            name: name.trim(),
            phone_number: cleanPhone,
            email: email ? email.trim() : null,
            tags: Array.isArray(tags) ? tags : [],
            custom_fields: typeof custom_fields === 'object' && custom_fields ? custom_fields : {}
        });
    } catch (error) {
        console.error('Error creating contact:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.importBulk = async (req, res) => {
    try {
        const db = await getDb();
        const { contacts } = req.body;

        if (!Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'An array of contacts is required for import.' });
        }

        let importedCount = 0;
        let skippedCount = 0;

        for (const item of contacts) {
            if (!item.name || !item.phone_number) {
                skippedCount++;
                continue;
            }

            const cleanPhone = item.phone_number.replace(/[^\d+]/g, '');
            if (!cleanPhone) {
                skippedCount++;
                continue;
            }

            const existing = await db.get('SELECT id FROM contacts WHERE user_id = ? AND phone_number = ?', [req.user.id, cleanPhone]);
            if (existing) {
                skippedCount++;
                continue;
            }

            const tagsJSON = JSON.stringify(Array.isArray(item.tags) ? item.tags : []);
            const customFieldsJSON = JSON.stringify(typeof item.custom_fields === 'object' && item.custom_fields ? item.custom_fields : {});

            await db.run(
                'INSERT INTO contacts (name, phone_number, email, tags, custom_fields, user_id) VALUES (?, ?, ?, ?, ?, ?)',
                [item.name.trim(), cleanPhone, item.email ? item.email.trim() : null, tagsJSON, customFieldsJSON, req.user.id]
            );
            importedCount++;
        }

        await logActivity('contacts_imported', `Imported ${importedCount} contacts (${skippedCount} skipped/duplicates).`, req.user.id);

        res.json({
            message: `Successfully imported ${importedCount} contact(s).`,
            importedCount,
            skippedCount
        });
    } catch (error) {
        console.error('Error importing contacts:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;
        const { name, phone_number, email, tags, custom_fields } = req.body;

        const existing = await db.get('SELECT * FROM contacts WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Contact not found.' });
        }

        if (!name || !phone_number) {
            return res.status(400).json({ error: 'Name and phone number are required.' });
        }

        const cleanPhone = phone_number.replace(/[^\d+]/g, '');

        // Uniqueness check if phone changed
        if (existing.phone_number !== cleanPhone) {
            const dup = await db.get('SELECT id FROM contacts WHERE user_id = ? AND phone_number = ? AND id != ?', [req.user.id, cleanPhone, id]);
            if (dup) {
                return res.status(400).json({ error: 'A contact with this phone number already exists.' });
            }
        }

        const tagsJSON = JSON.stringify(Array.isArray(tags) ? tags : JSON.parse(existing.tags || '[]'));
        const customFieldsJSON = JSON.stringify(typeof custom_fields === 'object' && custom_fields ? custom_fields : JSON.parse(existing.custom_fields || '{}'));

        await db.run(
            'UPDATE contacts SET name = ?, phone_number = ?, email = ?, tags = ?, custom_fields = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [name.trim(), cleanPhone, email ? email.trim() : null, tagsJSON, customFieldsJSON, id, req.user.id]
        );

        await logActivity('contact_updated', `Contact "${name}" updated.`, req.user.id);

        res.json({
            id: parseInt(id),
            name: name.trim(),
            phone_number: cleanPhone,
            email: email ? email.trim() : null,
            tags: JSON.parse(tagsJSON),
            custom_fields: JSON.parse(customFieldsJSON)
        });
    } catch (error) {
        console.error('Error updating contact:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const db = await getDb();
        const { id } = req.params;

        const contact = await db.get('SELECT name FROM contacts WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found.' });
        }

        await db.run('DELETE FROM contacts WHERE id = ? AND user_id = ?', [id, req.user.id]);

        // Also clean up this contact ID from all contact lists owned by user
        const lists = await db.all('SELECT id, contact_ids FROM contact_lists WHERE user_id = ?', [req.user.id]);
        for (const l of lists) {
            let ids = JSON.parse(l.contact_ids || '[]');
            const numericId = parseInt(id);
            if (ids.includes(numericId)) {
                ids = ids.filter(i => i !== numericId);
                await db.run('UPDATE contact_lists SET contact_ids = ? WHERE id = ?', [JSON.stringify(ids), l.id]);
            }
        }

        await logActivity('contact_deleted', `Contact "${contact.name}" deleted.`, req.user.id);

        res.json({ message: 'Contact deleted successfully.' });
    } catch (error) {
        console.error('Error deleting contact:', error);
        res.status(500).json({ error: error.message });
    }
};
