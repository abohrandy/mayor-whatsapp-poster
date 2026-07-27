const jobQueue = require('./JobQueue');
const announcementJobHandler = require('./handlers/AnnouncementJobHandler');
const syncJobHandler = require('./handlers/SyncJobHandler');

class QueueWorker {
    constructor() {
        this.isRunning = false;
        this.pollIntervalMs = 2000;
        this.timer = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[QueueWorker] Background Queue Worker engine started.');
        this.loop();
    }

    stop() {
        this.isRunning = false;
        if (this.timer) clearTimeout(this.timer);
        console.log('[QueueWorker] Background Queue Worker engine stopped.');
    }

    async loop() {
        if (!this.isRunning) return;

        try {
            const job = await jobQueue.getNextPendingJob();
            if (job) {
                console.log(`[QueueWorker] Picked up Job #${job.id} (type: ${job.job_type}, attempt: ${job.attempts}/${job.max_retries})`);
                await this.processJob(job);
            }
        } catch (err) {
            console.error('[QueueWorker] Worker loop error:', err.message);
        } finally {
            if (this.isRunning) {
                this.timer = setTimeout(() => this.loop(), this.pollIntervalMs);
            }
        }
    }

    async processJob(job) {
        try {
            switch (job.job_type) {
                case 'announcement_dispatch':
                case 'status_dispatch':
                    await announcementJobHandler.handle(job);
                    break;
                case 'contact_sync':
                    await syncJobHandler.handle(job);
                    break;
                default:
                    throw new Error(`Unknown job_type: ${job.job_type}`);
            }

            await jobQueue.completeJob(job.id);
            console.log(`[QueueWorker] Job #${job.id} completed successfully.`);
        } catch (err) {
            console.error(`[QueueWorker] Job #${job.id} failed:`, err.message);
            await jobQueue.failJob(job.id, err.message);
        }
    }
}

module.exports = new QueueWorker();
