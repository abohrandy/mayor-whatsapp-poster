const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function initDb() {
    // Use persistent Railway volume if configured, otherwise local directory
    const dbDir = process.env.DATA_DIR || path.join(__dirname, '..');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const dbPath = path.join(dbDir, 'database.sqlite');

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Announcements table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            caption TEXT,
            caption_variations TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
            caption_index INTEGER NOT NULL DEFAULT 0,      -- which caption variation fires next
            media_files TEXT NOT NULL DEFAULT '[]',  -- JSON array of {path, type}
            is_recurring INTEGER NOT NULL DEFAULT 0,  -- 0=one-time, 1=recurring
            recurrence_days INTEGER DEFAULT NULL,      -- "every N days"
            post_time TEXT DEFAULT '08:00',           -- HH:MM (24h)
            target_groups TEXT NOT NULL DEFAULT '[]', -- JSON array of group IDs
            ribbon_index INTEGER NOT NULL DEFAULT 0,  -- which media file fires next
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
            next_post_at TEXT DEFAULT NULL,           -- ISO datetime string
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migrate existing announcements table if new columns don't exist
    const annColumns = await db.all('PRAGMA table_info(announcements)');
    const hasCaptionVariations = annColumns.some(col => col.name === 'caption_variations');
    if (!hasCaptionVariations) {
        try {
            await db.exec("ALTER TABLE announcements ADD COLUMN caption_variations TEXT NOT NULL DEFAULT '[]'");
            await db.exec("ALTER TABLE announcements ADD COLUMN caption_index INTEGER NOT NULL DEFAULT 0");
            console.log('Migrated announcements table: added caption_variations and caption_index columns.');
        } catch (err) {
            console.error('Failed to add caption_variations/caption_index to announcements:', err);
        }
    }

    // Settings table (simplified)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            timezone TEXT DEFAULT 'Africa/Lagos',
            default_post_time TEXT DEFAULT '08:00',
            send_delay_seconds INTEGER DEFAULT 5
        )
    `);

    // Migrate existing DB if column doesn't exist
    const columns = await db.all('PRAGMA table_info(settings)');
    const hasDelay = columns.some(col => col.name === 'send_delay_seconds');
    if (!hasDelay) {
        try {
            await db.exec('ALTER TABLE settings ADD COLUMN send_delay_seconds INTEGER DEFAULT 5');
            console.log('Migrated settings table: added send_delay_seconds column.');
        } catch (err) {
            console.error('Failed to add send_delay_seconds column:', err);
        }
    }

    // Insert default settings if not present
    const settingsCount = await db.get('SELECT COUNT(*) as count FROM settings');
    if (settingsCount.count === 0) {
        await db.run(`INSERT INTO settings (id, timezone, default_post_time, send_delay_seconds) VALUES (1, 'Africa/Lagos', '08:00', 5)`);
    }

    // Activity logs
    await db.exec(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Posting profiles
    await db.exec(`
        CREATE TABLE IF NOT EXISTS posting_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            groups TEXT NOT NULL DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('Database initialized successfully.');
    return db;
}

// Global cached db promise
let dbPromise = null;
function getDb() {
    if (!dbPromise) {
        dbPromise = initDb();
    }
    return dbPromise;
}

async function logActivity(action_type, description) {
    try {
        const db = await getDb();
        await db.run(
            'INSERT INTO activity_logs (action_type, description) VALUES (?, ?)',
            [action_type, description]
        );
        const { emitStats } = require('../services/socket');
        emitStats({ action: 'new_log' });
    } catch (e) {
        console.error('Failed to log activity:', e);
    }
}

module.exports = { initDb, getDb, logActivity };
