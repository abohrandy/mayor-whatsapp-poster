const { getDb } = require('../models/database');

class JobLogger {
    async log(jobId, logType, message, details = null) {
        if (!jobId) return;
        try {
            const db = await getDb();
            const detailsJson = details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null;
            await db.run(
                'INSERT INTO job_logs (job_id, log_type, message, details) VALUES (?, ?, ?, ?)',
                [jobId, logType, message, detailsJson]
            );
        } catch (err) {
            console.error(`[JobLogger] Failed to write ${logType} log for Job ${jobId}:`, err.message);
        }
    }

    logAutomation(jobId, message, details = null) {
        return this.log(jobId, 'automation', message, details);
    }

    logWhatsApp(jobId, message, details = null) {
        return this.log(jobId, 'whatsapp', message, details);
    }

    logAI(jobId, message, details = null) {
        return this.log(jobId, 'ai', message, details);
    }

    logSync(jobId, message, details = null) {
        return this.log(jobId, 'sync', message, details);
    }

    logError(jobId, message, details = null) {
        return this.log(jobId, 'error', message, details);
    }
}

module.exports = new JobLogger();
