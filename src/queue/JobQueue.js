const { getDb } = require('../models/database');
const jobLogger = require('./JobLogger');

class JobQueue {
    /**
     * Enqueue a new Job.
     * @param {string} jobType - 'announcement_dispatch'|'contact_sync'|'status_dispatch'
     * @param {Object} payload
     * @param {number} [userId]
     * @param {number} [maxRetries=3]
     */
    async enqueue(jobType, payload, userId = null, maxRetries = 3) {
        const db = await getDb();
        const payloadJson = JSON.stringify(payload || {});
        const result = await db.run(
            `INSERT INTO jobs (job_type, payload, status, attempts, max_retries, user_id) VALUES (?, ?, 'pending', 0, ?, ?)`,
            [jobType, payloadJson, maxRetries, userId]
        );

        const jobId = result.lastID;
        await jobLogger.logAutomation(jobId, `Job queued successfully. Type: ${jobType}`, { userId, maxRetries });
        return jobId;
    }

    /**
     * Claims next pending job for execution atomically.
     */
    async getNextPendingJob() {
        const db = await getDb();
        const job = await db.get(
            `SELECT * FROM jobs WHERE status = 'pending' ORDER BY id ASC LIMIT 1`
        );

        if (!job) return null;

        const now = new Date().toISOString();
        await db.run(
            `UPDATE jobs SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?`,
            [now, job.id]
        );

        job.attempts = job.attempts + 1;
        job.status = 'processing';
        job.payload = JSON.parse(job.payload || '{}');
        return job;
    }

    async completeJob(jobId) {
        const db = await getDb();
        const now = new Date().toISOString();
        await db.run(
            `UPDATE jobs SET status = 'completed', updated_at = ? WHERE id = ?`,
            [now, jobId]
        );
        await jobLogger.logAutomation(jobId, `Job execution completed successfully.`);
    }

    async failJob(jobId, errorMessage) {
        const db = await getDb();
        const job = await db.get('SELECT attempts, max_retries FROM jobs WHERE id = ?', [jobId]);
        const now = new Date().toISOString();

        const isFinalFailure = job ? job.attempts >= job.max_retries : true;
        const newStatus = isFinalFailure ? 'failed' : 'pending';

        await db.run(
            `UPDATE jobs SET status = ?, error_message = ?, updated_at = ? WHERE id = ?`,
            [newStatus, errorMessage, now, jobId]
        );

        await jobLogger.logError(jobId, `Job execution error: ${errorMessage}`, {
            attempt: job?.attempts,
            maxRetries: job?.max_retries,
            finalFailure: isFinalFailure
        });
    }

    async retryJob(jobId) {
        const db = await getDb();
        const job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
        if (!job) throw new Error('Job not found.');

        const now = new Date().toISOString();
        await db.run(
            `UPDATE jobs SET status = 'pending', attempts = 0, error_message = NULL, updated_at = ? WHERE id = ?`,
            [now, jobId]
        );

        await jobLogger.logAutomation(jobId, `Job reset manually for retry.`);
        return { message: `Job #${jobId} reset and queued for retry.` };
    }

    async getJobLogsGrouped(jobId) {
        const db = await getDb();
        const logs = await db.all(
            'SELECT id, log_type, message, details, created_at FROM job_logs WHERE job_id = ? ORDER BY id ASC',
            [jobId]
        );

        const grouped = {
            automation: [],
            whatsapp: [],
            ai: [],
            sync: [],
            error: []
        };

        for (const log of logs) {
            let detailsObj = null;
            try { detailsObj = JSON.parse(log.details); } catch { detailsObj = log.details; }

            const entry = {
                id: log.id,
                message: log.message,
                details: detailsObj,
                createdAt: log.created_at
            };

            if (grouped[log.log_type]) {
                grouped[log.log_type].push(entry);
            }
        }

        return grouped;
    }
}

module.exports = new JobQueue();
