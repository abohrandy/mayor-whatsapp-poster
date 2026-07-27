const whatsAppService = require('../../whatsapp/WhatsAppService');
const jobLogger = require('../JobLogger');

class SyncJobHandler {
    async handle(job) {
        const jobId = job.id;
        const payload = job.payload;

        await jobLogger.logSync(jobId, `Starting contact harvesting sync job #${jobId}`, {
            sessionJid: payload.sessionJid,
            userId: payload.userId
        });

        await jobLogger.logWhatsApp(jobId, `Querying whatsmeow store for session ${payload.sessionJid}...`);

        const result = await whatsAppService.syncContacts(payload.sessionJid, payload.userId);

        await jobLogger.logSync(jobId, `Contact harvesting completed successfully.`, {
            syncedCount: result.syncedCount
        });

        return result;
    }
}

module.exports = new SyncJobHandler();
