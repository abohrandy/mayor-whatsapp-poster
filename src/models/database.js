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

    // Users table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            subscription_status TEXT DEFAULT 'inactive', -- active, inactive, past_due
            paystack_customer_code TEXT DEFAULT NULL,
            paystack_subscription_code TEXT DEFAULT NULL,
            tier TEXT DEFAULT 'trial',                  -- trial, premium
            trial_ends_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migrate existing users table if columns don't exist
    const usersColumns = await db.all('PRAGMA table_info(users)');
    const hasTier = usersColumns.some(col => col.name === 'tier');
    if (!hasTier) {
        try {
            await db.exec("ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'trial'");
            await db.exec("ALTER TABLE users ADD COLUMN trial_ends_at DATETIME DEFAULT NULL");
            console.log('Migrated users table: added tier and trial_ends_at columns.');
        } catch (err) {
            console.error('Failed to add tier/trial_ends_at columns to users:', err);
        }
    }

    const hasPlanId = usersColumns.some(col => col.name === 'plan_id');
    if (!hasPlanId) {
        try {
            await db.exec("ALTER TABLE users ADD COLUMN plan_id INTEGER DEFAULT NULL");
            console.log('Migrated users table: added plan_id column.');
        } catch (err) {
            console.error('Failed to add plan_id column to users:', err);
        }
    }

    // Post History table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS post_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            content_hash TEXT NOT NULL,
            posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Subscription Plans table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            price INTEGER DEFAULT 0,
            duration_days INTEGER DEFAULT 30,
            max_groups INTEGER DEFAULT 3,
            max_sessions INTEGER DEFAULT 1,
            spam_interval_hours INTEGER DEFAULT 12,
            paystack_plan_code TEXT DEFAULT NULL,
            is_trial INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Seed default subscription plans if none exist
    const planCount = await db.get('SELECT COUNT(*) as count FROM subscription_plans');
    if (planCount.count === 0) {
        await db.run(
            `INSERT INTO subscription_plans (name, slug, price, duration_days, max_groups, max_sessions, spam_interval_hours, is_trial, is_active)
             VALUES ('Free Trial', 'trial', 0, 14, 3, 1, 12, 1, 1)`
        );
        await db.run(
            `INSERT INTO subscription_plans (name, slug, price, duration_days, max_groups, max_sessions, spam_interval_hours, is_trial, is_active)
             VALUES ('Plus Plan', 'plus', 500000, 30, 25, 999, 6, 0, 1)`
        );
        console.log('Seeded default subscription plans.');
    }

    // Migrate premium plan to plus plan if database was already initialized
    await db.run("UPDATE subscription_plans SET name = 'Plus Plan', slug = 'plus' WHERE slug = 'premium'");
    await db.run("UPDATE users SET tier = 'plus' WHERE tier = 'premium'");

    // Ensure existing database migrations/updates are applied to default plans
    await db.run("UPDATE subscription_plans SET max_groups = 25 WHERE slug = 'plus' AND max_groups > 25");

    // WhatsApp Sessions table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_id TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

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
            recurrence_days_of_week TEXT NOT NULL DEFAULT '[]', -- JSON array of day indices (0=Sunday, 1=Monday, etc)
            sender_jid TEXT DEFAULT NULL,             -- target WhatsApp JID to send from
            post_time TEXT DEFAULT '08:00',           -- HH:MM (24h)
            target_groups TEXT NOT NULL DEFAULT '[]', -- JSON array of group IDs
            ribbon_index INTEGER NOT NULL DEFAULT 0,  -- which media file fires next
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
            next_post_at TEXT DEFAULT NULL,           -- ISO datetime string
            user_id INTEGER DEFAULT NULL,
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

    const hasDaysOfWeek = annColumns.some(col => col.name === 'recurrence_days_of_week');
    if (!hasDaysOfWeek) {
        try {
            await db.exec("ALTER TABLE announcements ADD COLUMN recurrence_days_of_week TEXT NOT NULL DEFAULT '[]'");
            console.log('Migrated announcements table: added recurrence_days_of_week column.');
        } catch (err) {
            console.error('Failed to add recurrence_days_of_week to announcements:', err);
        }
    }

    const hasSenderJid = annColumns.some(col => col.name === 'sender_jid');
    if (!hasSenderJid) {
        try {
            await db.exec("ALTER TABLE announcements ADD COLUMN sender_jid TEXT DEFAULT NULL");
            console.log('Migrated announcements table: added sender_jid column.');
        } catch (err) {
            console.error('Failed to add sender_jid to announcements:', err);
        }
    }

    const hasAnnUserId = annColumns.some(col => col.name === 'user_id');
    if (!hasAnnUserId) {
        try {
            await db.exec("ALTER TABLE announcements ADD COLUMN user_id INTEGER DEFAULT NULL");
            console.log('Migrated announcements table: added user_id column.');
        } catch (err) {
            console.error('Failed to add user_id to announcements:', err);
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
            user_id INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const logColumns = await db.all('PRAGMA table_info(activity_logs)');
    const hasLogUserId = logColumns.some(col => col.name === 'user_id');
    if (!hasLogUserId) {
        try {
            await db.exec("ALTER TABLE activity_logs ADD COLUMN user_id INTEGER DEFAULT NULL");
            console.log('Migrated activity_logs table: added user_id column.');
        } catch (err) {
            console.error('Failed to add user_id to activity_logs:', err);
        }
    }

    // Posting profiles
    await db.exec(`
        CREATE TABLE IF NOT EXISTS posting_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            groups TEXT NOT NULL DEFAULT '[]',
            user_id INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const profColumns = await db.all('PRAGMA table_info(posting_profiles)');
    const hasProfUserId = profColumns.some(col => col.name === 'user_id');
    if (!hasProfUserId) {
        try {
            await db.exec("ALTER TABLE posting_profiles ADD COLUMN user_id INTEGER DEFAULT NULL");
            console.log('Migrated posting_profiles table: added user_id column.');
        } catch (err) {
            console.error('Failed to add user_id to posting_profiles:', err);
        }
    }

    // Assign any historical orphan records to the first registered user
    try {
        const firstUser = await db.get('SELECT id FROM users ORDER BY id ASC LIMIT 1');
        if (firstUser) {
            await db.run('UPDATE announcements SET user_id = ? WHERE user_id IS NULL', [firstUser.id]);
            await db.run('UPDATE posting_profiles SET user_id = ? WHERE user_id IS NULL', [firstUser.id]);
            await db.run('UPDATE activity_logs SET user_id = ? WHERE user_id IS NULL', [firstUser.id]);
            
            // Also map existing whatsapp sessions from Go store if any exist and are not mapped
            const waClient = require('../services/whatsapp');
            if (waClient.sessions && waClient.sessions.length > 0) {
                for (const sess of waClient.sessions) {
                    await db.run(
                        'INSERT OR IGNORE INTO whatsapp_sessions (user_id, session_id) VALUES (?, ?)',
                        [firstUser.id, sess.id]
                    );
                }
            }
        }
    } catch (err) {
        console.error('Failed to run historical orphan user adoption migration:', err);
    }

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

async function logActivity(action_type, description, user_id = null) {
    try {
        const db = await getDb();
        await db.run(
            'INSERT INTO activity_logs (action_type, description, user_id) VALUES (?, ?, ?)',
            [action_type, description, user_id]
        );
        const { emitStats } = require('../services/socket');
        emitStats(user_id, { action: 'new_log' });
    } catch (e) {
        console.error('Failed to log activity:', e);
    }
}

module.exports = { initDb, getDb, logActivity };
