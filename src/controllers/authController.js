const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, logActivity } = require('../models/database');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-whatsapp-saas-2026';

const authController = {
    async signup(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            const db = await getDb();
            const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
            if (existing) {
                return res.status(400).json({ error: 'Email address is already registered' });
            }

            const trialEndsAt = new Date();
            trialEndsAt.setDate(trialEndsAt.getDate() + 14);

            const passwordHash = await bcrypt.hash(password, 10);
            const result = await db.run(
                'INSERT INTO users (email, password_hash, subscription_status, tier, trial_ends_at) VALUES (?, ?, ?, ?, ?)',
                [email, passwordHash, 'active', 'trial', trialEndsAt.toISOString()]
            );

            const userId = result.lastID;
            const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });

            await logActivity('user_signup', `User signed up: ${email}`, userId);

            res.status(201).json({
                message: 'Registration successful',
                token,
                user: {
                    id: userId,
                    email,
                    subscription_status: 'active',
                    tier: 'trial',
                    trial_ends_at: trialEndsAt.toISOString(),
                    is_admin: email === (process.env.ADMIN_EMAIL || '')
                }
            });
        } catch (err) {
            console.error('[Auth signup] Error:', err);
            res.status(500).json({ error: 'Internal server error during registration' });
        }
    },

    async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }

            const db = await getDb();
            const user = await db.get(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (!user) {
                return res.status(400).json({ error: 'Invalid email or password' });
            }

            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                return res.status(400).json({ error: 'Invalid email or password' });
            }

            const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

            await logActivity('user_login', `User logged in: ${email}`, user.id);

            res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    subscription_status: user.subscription_status,
                    tier: user.tier,
                    trial_ends_at: user.trial_ends_at,
                    is_admin: user.email === (process.env.ADMIN_EMAIL || '')
                }
            });
        } catch (err) {
            console.error('[Auth login] Error:', err);
            res.status(500).json({ error: 'Internal server error during login' });
        }
    },

    async me(req, res) {
        // req.user is populated by requireAuth middleware
        res.json({
            user: {
                id: req.user.id,
                email: req.user.email,
                subscription_status: req.user.subscription_status,
                tier: req.user.tier,
                trial_ends_at: req.user.trial_ends_at,
                is_admin: req.user.email === (process.env.ADMIN_EMAIL || '')
            }
        });
    }
};

module.exports = authController;
