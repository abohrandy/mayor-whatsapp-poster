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

    if (!usersColumns.some(col => col.name === 'ai_credits_remaining')) {
        try { await db.exec("ALTER TABLE users ADD COLUMN ai_credits_remaining INTEGER DEFAULT 50"); } catch (err) {}
    }
    if (!usersColumns.some(col => col.name === 'ai_credits_monthly_limit')) {
        try { await db.exec("ALTER TABLE users ADD COLUMN ai_credits_monthly_limit INTEGER DEFAULT 50"); } catch (err) {}
    }
    if (!usersColumns.some(col => col.name === 'ai_credits_reset_at')) {
        try {
            const nextMonth = new Date();
            nextMonth.setDate(nextMonth.getDate() + 30);
            await db.exec(`ALTER TABLE users ADD COLUMN ai_credits_reset_at DATETIME DEFAULT '${nextMonth.toISOString()}'`);
        } catch (err) {}
    }

    // AI Credit Logs table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_credit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            operation TEXT NOT NULL,
            credits_deducted INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // AI Settings table (Super Admin)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            openrouter_api_key TEXT DEFAULT NULL,
            active_model TEXT DEFAULT 'deepseek/deepseek-chat',
            fallback_model TEXT DEFAULT 'qwen/qwen-2.5-72b-instruct',
            fallback_model_1 TEXT DEFAULT 'qwen/qwen-2.5-72b-instruct',
            fallback_model_2 TEXT DEFAULT 'thudm/glm-4-9b-chat',
            fallback_model_3 TEXT DEFAULT 'minimax/minimax-01',
            disabled_models TEXT DEFAULT '["openai/gpt-4o-mini","openai/gpt-4o","anthropic/claude-3.5-haiku","google/gemini-2.5-flash"]',
            ai_enabled INTEGER DEFAULT 1,
            credits_trial INTEGER DEFAULT 50,
            credits_plus INTEGER DEFAULT 200,
            credits_unlimited INTEGER DEFAULT 1000,
            cost_per_feature TEXT DEFAULT '{}'
        )
    `);

    const aiSettingsCols = await db.all('PRAGMA table_info(ai_settings)');
    if (!aiSettingsCols.some(col => col.name === 'fallback_model_1')) {
        try { await db.exec("ALTER TABLE ai_settings ADD COLUMN fallback_model_1 TEXT DEFAULT 'qwen/qwen-2.5-72b-instruct'"); } catch (err) {}
    }
    if (!aiSettingsCols.some(col => col.name === 'fallback_model_2')) {
        try { await db.exec("ALTER TABLE ai_settings ADD COLUMN fallback_model_2 TEXT DEFAULT 'thudm/glm-4-9b-chat'"); } catch (err) {}
    }
    if (!aiSettingsCols.some(col => col.name === 'fallback_model_3')) {
        try { await db.exec("ALTER TABLE ai_settings ADD COLUMN fallback_model_3 TEXT DEFAULT 'minimax/minimax-01'"); } catch (err) {}
    }
    if (!aiSettingsCols.some(col => col.name === 'disabled_models')) {
        try { await db.exec('ALTER TABLE ai_settings ADD COLUMN disabled_models TEXT DEFAULT \'["openai/gpt-4o-mini","openai/gpt-4o","anthropic/claude-3.5-haiku","google/gemini-2.5-flash"]\''); } catch (err) {}
    }

    const aiSettingsCount = await db.get('SELECT COUNT(*) as count FROM ai_settings');
    if (aiSettingsCount.count === 0) {
        const defaultCostPerFeature = JSON.stringify({
            improve: 1,
            rewrite: 1,
            grammar: 1,
            translate: 1,
            expand: 1,
            shorten: 1,
            generate_variations: 1
        });
        await db.run(
            `INSERT INTO ai_settings (id, active_model, fallback_model, fallback_model_1, fallback_model_2, fallback_model_3, disabled_models, ai_enabled, credits_trial, credits_plus, credits_unlimited, cost_per_feature)
             VALUES (1, 'deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct', 'qwen/qwen-2.5-72b-instruct', 'thudm/glm-4-9b-chat', 'minimax/minimax-01', '["openai/gpt-4o-mini","openai/gpt-4o","anthropic/claude-3.5-haiku","google/gemini-2.5-flash"]', 1, 50, 200, 1000, ?)`,
            [defaultCostPerFeature]
        );
    }


    // AI Request Logs table (Super Admin detailed telemetry)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ai_request_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_email TEXT NOT NULL,
            operation TEXT NOT NULL,
            credits_deducted INTEGER NOT NULL DEFAULT 1,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            estimated_cost REAL DEFAULT 0.0,
            model_used TEXT NOT NULL,
            response_time_ms INTEGER DEFAULT 0,
            status TEXT DEFAULT 'success',
            fallback_occurred INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    const reqLogColumns = await db.all('PRAGMA table_info(ai_request_logs)');
    if (!reqLogColumns.some(col => col.name === 'response_time_ms')) {
        try { await db.exec("ALTER TABLE ai_request_logs ADD COLUMN response_time_ms INTEGER DEFAULT 0"); } catch (err) {}
    }
    if (!reqLogColumns.some(col => col.name === 'status')) {
        try { await db.exec("ALTER TABLE ai_request_logs ADD COLUMN status TEXT DEFAULT 'success'"); } catch (err) {}
    }
    if (!reqLogColumns.some(col => col.name === 'fallback_occurred')) {
        try { await db.exec("ALTER TABLE ai_request_logs ADD COLUMN fallback_occurred INTEGER DEFAULT 0"); } catch (err) {}
    }


    // Queue Jobs table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 3,
            error_message TEXT DEFAULT NULL,
            user_id INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Queue Job Logs table (5 log types: automation, whatsapp, ai, sync, error)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS job_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            log_type TEXT NOT NULL,
            message TEXT NOT NULL,
            details TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )
    `);

    // Post History table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS post_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            content_hash TEXT NOT NULL,
            posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Clean up any improperly cross-synced contacts tagged with 'whatsapp_synced' where user_id does not own a connected session
    try {
        await db.exec(`
            DELETE FROM contacts 
            WHERE tags LIKE '%whatsapp_synced%' 
            AND user_id NOT IN (SELECT user_id FROM whatsapp_sessions WHERE session_id IS NOT NULL AND session_id != '')
        `);
    } catch (err) {}

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
            last_contacts_synced_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    const sessColumns = await db.all('PRAGMA table_info(whatsapp_sessions)');
    const hasLastSynced = sessColumns.some(col => col.name === 'last_contacts_synced_at');
    if (!hasLastSynced) {
        try {
            await db.exec("ALTER TABLE whatsapp_sessions ADD COLUMN last_contacts_synced_at DATETIME DEFAULT NULL");
        } catch (err) {}
    }

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

    if (!annColumns.some(col => col.name === 'target_contacts')) {
        try { await db.exec("ALTER TABLE announcements ADD COLUMN target_contacts TEXT NOT NULL DEFAULT '[]'"); } catch (err) {}
    }

    if (!annColumns.some(col => col.name === 'target_contact_lists')) {
        try { await db.exec("ALTER TABLE announcements ADD COLUMN target_contact_lists TEXT NOT NULL DEFAULT '[]'"); } catch (err) {}
    }

    if (!annColumns.some(col => col.name === 'target_audience_lists')) {
        try { await db.exec("ALTER TABLE announcements ADD COLUMN target_audience_lists TEXT NOT NULL DEFAULT '[]'"); } catch (err) {}
    }

    if (!annColumns.some(col => col.name === 'target_group_lists')) {
        try { await db.exec("ALTER TABLE announcements ADD COLUMN target_group_lists TEXT NOT NULL DEFAULT '[]'"); } catch (err) {}
    }

    if (!annColumns.some(col => col.name === 'include_status')) {
        try { await db.exec("ALTER TABLE announcements ADD COLUMN include_status INTEGER NOT NULL DEFAULT 0"); } catch (err) {}
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

    if (!annColumns.some(col => col.name === 'last_posted_at')) {
        try {
            await db.exec("ALTER TABLE announcements ADD COLUMN last_posted_at DATETIME DEFAULT NULL");
            console.log('Migrated announcements table: added last_posted_at column.');
        } catch (err) {}
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

    // Migrate existing DB if columns don't exist
    const columns = await db.all('PRAGMA table_info(settings)');
    const colNames = columns.map(c => c.name);
    if (!colNames.includes('send_delay_seconds')) {
        try { await db.exec('ALTER TABLE settings ADD COLUMN send_delay_seconds INTEGER DEFAULT 5'); } catch (err) {}
    }
    if (!colNames.includes('randomize_delay')) {
        try { await db.exec('ALTER TABLE settings ADD COLUMN randomize_delay INTEGER DEFAULT 1'); } catch (err) {}
    }
    if (!colNames.includes('auto_retry')) {
        try { await db.exec('ALTER TABLE settings ADD COLUMN auto_retry INTEGER DEFAULT 1'); } catch (err) {}
    }
    if (!colNames.includes('max_retries')) {
        try { await db.exec('ALTER TABLE settings ADD COLUMN max_retries INTEGER DEFAULT 3'); } catch (err) {}
    }
    if (!colNames.includes('quiet_hours_enabled')) {
        try { await db.exec('ALTER TABLE settings ADD COLUMN quiet_hours_enabled INTEGER DEFAULT 0'); } catch (err) {}
    }
    if (!colNames.includes('quiet_hours_start')) {
        try { await db.exec("ALTER TABLE settings ADD COLUMN quiet_hours_start TEXT DEFAULT '22:00'"); } catch (err) {}
    }
    if (!colNames.includes('quiet_hours_end')) {
        try { await db.exec("ALTER TABLE settings ADD COLUMN quiet_hours_end TEXT DEFAULT '07:00'"); } catch (err) {}
    }
    if (!colNames.includes('ai_tone')) {
        try { await db.exec("ALTER TABLE settings ADD COLUMN ai_tone TEXT DEFAULT 'Professional'"); } catch (err) {}
    }
    if (!colNames.includes('ai_language')) {
        try { await db.exec("ALTER TABLE settings ADD COLUMN ai_language TEXT DEFAULT 'English'"); } catch (err) {}
    }
    if (!colNames.includes('notify_email_failures')) {
        try { await db.exec('ALTER TABLE settings ADD COLUMN notify_email_failures INTEGER DEFAULT 1'); } catch (err) {}
    }
    if (!colNames.includes('notify_email_disconnects')) {
        try { await db.exec('ALTER TABLE settings ADD COLUMN notify_email_disconnects INTEGER DEFAULT 1'); } catch (err) {}
    }
    if (!colNames.includes('notify_email_low_credits')) {
        try { await db.exec('ALTER TABLE settings ADD COLUMN notify_email_low_credits INTEGER DEFAULT 1'); } catch (err) {}
    }
    if (!colNames.includes('webhook_url')) {
        try { await db.exec("ALTER TABLE settings ADD COLUMN webhook_url TEXT DEFAULT ''"); } catch (err) {}
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

    // Audience lists (formerly Posting Profiles)
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.map(t => t.name);

    if (tableNames.includes('posting_profiles') && !tableNames.includes('audience_lists')) {
        try {
            await db.exec("ALTER TABLE posting_profiles RENAME TO audience_lists");
            console.log('Migrated database table: posting_profiles -> audience_lists');
        } catch (err) {
            console.error('Failed to rename posting_profiles table to audience_lists:', err);
        }
    }

    await db.exec(`
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            email TEXT,
            tags TEXT DEFAULT '[]',
            custom_fields TEXT DEFAULT '{}',
            whatsapp_session_id TEXT DEFAULT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Ensure whatsapp_session_id column exists on existing contacts tables
    try {
        const contactColumns = await db.all("PRAGMA table_info(contacts)");
        const hasSessionId = contactColumns.some(col => col.name === 'whatsapp_session_id');
        if (!hasSessionId) {
            await db.exec("ALTER TABLE contacts ADD COLUMN whatsapp_session_id TEXT DEFAULT NULL");
            console.log('Added whatsapp_session_id column to contacts table');
        }
    } catch (err) {
        console.error('Failed to migrate contacts table for whatsapp_session_id:', err);
    }

    await db.exec(`
        CREATE TABLE IF NOT EXISTS contact_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            contact_ids TEXT DEFAULT '[]',
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS group_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            groups TEXT NOT NULL DEFAULT '[]',
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS audience_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            groups TEXT NOT NULL DEFAULT '[]',
            contact_list_ids TEXT DEFAULT '[]',
            group_list_ids TEXT DEFAULT '[]',
            user_id INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const listColumns = await db.all('PRAGMA table_info(audience_lists)');
    const hasListUserId = listColumns.some(col => col.name === 'user_id');
    if (!hasListUserId) {
        try {
            await db.exec("ALTER TABLE audience_lists ADD COLUMN user_id INTEGER DEFAULT NULL");
            console.log('Migrated audience_lists table: added user_id column.');
        } catch (err) {
            console.error('Failed to add user_id to audience_lists:', err);
        }
    }

    const hasContactListIds = listColumns.some(col => col.name === 'contact_list_ids');
    if (!hasContactListIds) {
        try {
            await db.exec("ALTER TABLE audience_lists ADD COLUMN contact_list_ids TEXT DEFAULT '[]'");
        } catch (err) {}
    }

    if (!listColumns.some(col => col.name === 'group_list_ids')) {
        try {
            await db.exec("ALTER TABLE audience_lists ADD COLUMN group_list_ids TEXT DEFAULT '[]'");
        } catch (err) {}
    }

    const hasDescription = listColumns.some(col => col.name === 'description');
    if (!hasDescription) {
        try {
            await db.exec("ALTER TABLE audience_lists ADD COLUMN description TEXT DEFAULT ''");
        } catch (err) {}
    }

    // Assign any historical orphan records to the first registered user
    try {
        const firstUser = await db.get('SELECT id FROM users ORDER BY id ASC LIMIT 1');
        if (firstUser) {
            await db.run('UPDATE announcements SET user_id = ? WHERE user_id IS NULL', [firstUser.id]);
            await db.run('UPDATE audience_lists SET user_id = ? WHERE user_id IS NULL', [firstUser.id]);
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

    // Ensure the super admin account is always upgraded to the Plus tier and active
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
        try {
            await db.run(
                "UPDATE users SET tier = 'plus', subscription_status = 'active' WHERE email = ?",
                [adminEmail]
            );
            console.log(`[Database] Ensured admin account (${adminEmail}) is active on Plus tier.`);
        } catch (err) {
            console.error('[Database] Failed to upgrade admin account tier:', err);
        }
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
