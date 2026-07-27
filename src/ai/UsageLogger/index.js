const { getDb } = require('../../models/database');

class UsageLogger {
    /**
     * Persists comprehensive telemetry log into ai_request_logs table for Super Admin reporting.
     * 
     * Logs:
     * - User (userId, userEmail)
     * - AI Feature (operation)
     * - Credits Used (creditsDeducted)
     * - Model Used (modelUsed)
     * - Input Tokens (promptTokens)
     * - Output Tokens (completionTokens)
     * - Total Tokens (totalTokens)
     * - Actual OpenRouter Cost (estimatedCost)
     * - Response Time (responseTimeMs)
     * - Timestamp (created_at)
     * - Success/Failure (status)
     * - Whether fallback occurred (fallbackOccurred)
     * 
     * @param {Object} params
     */
    async logTelemetry({
        userId,
        userEmail,
        operation,
        creditsDeducted = 1,
        modelUsed,
        promptTokens = 0,
        completionTokens = 0,
        totalTokens = 0,
        estimatedCost = 0.0,
        responseTimeMs = 0,
        status = 'success',
        fallbackOccurred = false
    }) {
        if (!userId || !userEmail) return;

        try {
            const db = await getDb();
            const fallbackFlag = fallbackOccurred ? 1 : 0;
            const computedTotalTokens = totalTokens || (promptTokens + completionTokens);

            await db.run(
                `INSERT INTO ai_request_logs 
                    (user_id, user_email, operation, credits_deducted, prompt_tokens, completion_tokens, total_tokens, estimated_cost, model_used, response_time_ms, status, fallback_occurred)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    userEmail,
                    operation,
                    creditsDeducted,
                    promptTokens,
                    completionTokens,
                    computedTotalTokens,
                    estimatedCost,
                    modelUsed || 'unknown',
                    responseTimeMs,
                    status,
                    fallbackFlag
                ]
            );
        } catch (err) {
            console.error('[UsageLogger] Failed to persist telemetry log row:', err.message);
        }
    }

    /**
     * Fetches detailed request logs for super admin analytics and reporting.
     * @param {number} [limit=100]
     */
    async getTelemetryLogs(limit = 100) {
        const db = await getDb();
        const rows = await db.all(
            `SELECT id, user_id, user_email, operation, credits_deducted, prompt_tokens, completion_tokens, 
                    total_tokens, estimated_cost, model_used, response_time_ms, status, fallback_occurred, created_at 
             FROM ai_request_logs ORDER BY id DESC LIMIT ?`,
            [limit]
        );

        return rows.map(r => ({
            id: r.id,
            userId: r.user_id,
            userEmail: r.user_email,
            operation: r.operation,
            creditsUsed: r.credits_deducted,
            modelUsed: r.model_used,
            inputTokens: r.prompt_tokens,
            outputTokens: r.completion_tokens,
            totalTokens: r.total_tokens,
            actualCost: r.estimated_cost,
            responseTimeMs: r.response_time_ms,
            status: r.status,
            fallbackOccurred: Boolean(r.fallback_occurred),
            timestamp: r.created_at
        }));
    }
}

module.exports = new UsageLogger();
module.exports.UsageLogger = UsageLogger;
