const { getDb } = require('../../models/database');

class CreditService {
    /**
     * Retrieves user credit balance, limit, and reset date.
     * Automatically handles monthly reset if reset date has passed.
     * 
     * @param {number} userId
     * @returns {Promise<Object>} { remainingCredits, monthlyLimit, resetDate }
     */
    async getUserCredits(userId) {
        if (!userId) {
            throw new Error('User ID is required to fetch credits.');
        }

        const db = await getDb();
        let user = await db.get(
            'SELECT ai_credits_remaining, ai_credits_monthly_limit, ai_credits_reset_at FROM users WHERE id = ?',
            [userId]
        );

        if (!user) {
            throw new Error('User account not found.');
        }

        const now = new Date();
        const resetAt = user.ai_credits_reset_at ? new Date(user.ai_credits_reset_at) : now;

        // Auto-reset monthly credits if reset date has elapsed
        if (now >= resetAt) {
            const nextReset = new Date();
            nextReset.setDate(nextReset.getDate() + 30);
            const nextResetISO = nextReset.toISOString();
            const limit = user.ai_credits_monthly_limit || 50;

            await db.run(
                'UPDATE users SET ai_credits_remaining = ?, ai_credits_reset_at = ? WHERE id = ?',
                [limit, nextResetISO, userId]
            );

            user.ai_credits_remaining = limit;
            user.ai_credits_reset_at = nextResetISO;
        }

        return {
            remainingCredits: user.ai_credits_remaining !== undefined ? user.ai_credits_remaining : 50,
            monthlyLimit: user.ai_credits_monthly_limit || 50,
            resetDate: user.ai_credits_reset_at
        };
    }

    /**
     * Checks if user has sufficient credits, blocks request if insufficient (HTTP 402),
     * deducts requested credit count, and logs white-labeled event.
     * 
     * @param {number} userId
     * @param {string} [operation] - Operation name (e.g. 'improve', 'rewrite', 'translate')
     * @param {number} [count] - Credits to deduct
     * @returns {Promise<Object>} { remainingCredits, resetDate }
     */
    async checkAndDeductCredits(userId, operation = 'AI Text Processing', count = 1) {
        if (!userId) {
            throw new Error('User ID is required to check and deduct credits.');
        }

        const { remainingCredits, resetDate } = await this.getUserCredits(userId);

        if (remainingCredits < count) {
            const resetFormatted = resetDate ? new Date(resetDate).toLocaleDateString() : 'next billing cycle';
            const error = new Error(`Insufficient AI credits remaining (${remainingCredits} available). Your AI credits will reset on ${resetFormatted}.`);
            error.statusCode = 402;
            throw error;
        }

        const db = await getDb();
        const updatedRemaining = remainingCredits - count;

        await db.run(
            'UPDATE users SET ai_credits_remaining = ? WHERE id = ?',
            [updatedRemaining, userId]
        );

        const labels = {
            improve: 'Text Improvement',
            rewrite: 'Text Rewrite',
            grammar: 'Grammar & Spelling Correction',
            translate: 'Language Translation',
            expand: 'Text Expansion',
            shorten: 'Text Shortening',
            generate_variations: 'Text Variations Generation'
        };

        const displayOp = labels[operation] || operation;

        await db.run(
            'INSERT INTO ai_credit_logs (user_id, operation, credits_deducted) VALUES (?, ?, ?)',
            [userId, displayOp, count]
        );

        return {
            remainingCredits: updatedRemaining,
            resetDate
        };
    }

    /**
     * Alias for checkAndDeductCredits for backwards compatibility.
     */
    async deductCredits(userId, operation = 'AI Text Processing', count = 1) {
        return this.checkAndDeductCredits(userId, operation, count);
    }

    /**
     * Returns white-labeled usage history for standard user view.
     * Never exposes model info, provider info, or OpenRouter costs.
     * 
     * @param {number} userId
     * @param {number} [limit]
     * @returns {Promise<Array>} List of { id, operation, creditsDeducted, createdAt }
     */
    async getUsageHistory(userId, limit = 50) {
        if (!userId) {
            throw new Error('User ID is required to fetch usage history.');
        }

        const db = await getDb();
        const rows = await db.all(
            'SELECT id, operation, credits_deducted, created_at FROM ai_credit_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?',
            [userId, limit]
        );

        return rows.map(r => ({
            id: r.id,
            operation: r.operation,
            creditsDeducted: r.credits_deducted,
            createdAt: r.created_at
        }));
    }
}

module.exports = new CreditService();
module.exports.CreditService = CreditService;
