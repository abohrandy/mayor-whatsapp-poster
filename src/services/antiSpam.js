const crypto = require('crypto');
const { getDb } = require('../models/database');

function getHash(text) {
    // Normalise text: trim and collapse whitespaces to prevent simple punctuation bypasses
    const cleanText = (text || '').trim().replace(/\s+/g, ' ').toLowerCase();
    return crypto.createHash('sha256').update(cleanText).digest('hex');
}

/**
 * Checks if the user is attempting to repost identical content in violation of their tier's interval limits.
 * @param {number} userId - The user ID
 * @param {string} caption - The message caption or text
 * @returns {Promise<{allowed: boolean, message?: string}>}
 */
async function checkSpamLimits(userId, caption) {
    if (!caption || !caption.trim()) {
        return { allowed: true };
    }

    try {
        const db = await getDb();
        const user = await db.get(
            'SELECT tier, trial_ends_at, subscription_status FROM users WHERE id = ?',
            [userId]
        );

        if (!user) {
            return { allowed: false, message: 'User account not found' };
        }

        // Determine rate-limiting threshold
        // Trial tier: 12 hours
        // Premium tier: 6 hours
        const isPremium = user.tier === 'premium' && user.subscription_status === 'active';
        const limitHours = isPremium ? 6 : 12;

        const contentHash = getHash(caption);
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - limitHours);

        const recentPost = await db.get(
            `SELECT posted_at FROM post_history 
             WHERE user_id = ? AND content_hash = ? AND posted_at >= ? 
             ORDER BY posted_at DESC LIMIT 1`,
            [userId, contentHash, cutoffTime.toISOString()]
        );

        if (recentPost) {
            const timeSincePost = new Date() - new Date(recentPost.posted_at);
            const remainingMs = (limitHours * 60 * 60 * 1000) - timeSincePost;
            const remainingHours = Math.ceil(remainingMs / (60 * 1000) / 60);

            return {
                allowed: false,
                message: `Anti-Spam rate-limiting triggered! You cannot repost identical content within ${limitHours} hours. Please wait another ${remainingHours} hour(s) before sending this message again.`
            };
        }

        return { allowed: true };
    } catch (err) {
        console.error('[Anti-Spam Service] Error checking rate limits:', err);
        // Fallback to allowing post on db failure so we don't completely lock out users, but log it
        return { allowed: true };
    }
}

/**
 * Log successfully posted content hash in post_history database.
 * @param {number} userId - The user ID
 * @param {string} caption - The message caption or text
 */
async function logPostContent(userId, caption) {
    if (!caption || !caption.trim()) return;
    try {
        const db = await getDb();
        const contentHash = getHash(caption);
        await db.run(
            'INSERT INTO post_history (user_id, content_hash) VALUES (?, ?)',
            [userId, contentHash]
        );
        console.log(`[Anti-Spam] Logged post hash for user ${userId}`);
    } catch (err) {
        console.error('[Anti-Spam Service] Failed to log post content hash:', err);
    }
}

module.exports = { checkSpamLimits, logPostContent };
