const jwt = require('jsonwebtoken');
const { getDb } = require('../models/database');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-whatsapp-saas-2026';

async function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization token required' });
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired authorization token' });
        }

        const db = await getDb();
        const user = await db.get(
            'SELECT id, email, subscription_status, paystack_customer_code, paystack_subscription_code, tier, trial_ends_at FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (!user) {
            return res.status(401).json({ error: 'User account not found' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('[Auth Middleware] Error verifying token:', err);
        res.status(500).json({ error: 'Authentication processing error' });
    }
}

function requireSubscription(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // Bypass subscription requirements for admin
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && req.user.email === adminEmail) {
        return next();
    }

    if (req.user.subscription_status !== 'active') {
        return res.status(403).json({ error: 'Active subscription required. Please subscribe to proceed.' });
    }

    // Check if trial has expired
    if (req.user.tier === 'trial') {
        if (req.user.trial_ends_at) {
            const endsAt = new Date(req.user.trial_ends_at);
            if (endsAt < new Date()) {
                return res.status(403).json({ error: 'Your 14-day free trial has expired. Please subscribe to a premium plan to proceed.' });
            }
        } else {
            return res.status(403).json({ error: 'Your 14-day free trial has expired. Please subscribe to a premium plan to proceed.' });
        }
    }

    next();
}

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        console.warn('[Auth Middleware] ADMIN_EMAIL env is not configured. Admin access blocked.');
        return res.status(403).json({ error: 'Access denied: Admin panel is not configured.' });
    }

    if (req.user.email !== adminEmail) {
        return res.status(403).json({ error: 'Access denied: Admin permissions required.' });
    }

    next();
}

module.exports = { requireAuth, requireSubscription, requireAdmin };
