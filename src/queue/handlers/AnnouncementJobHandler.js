const DestinationEngine = require('../../destinations/DestinationEngine');
const jobLogger = require('../JobLogger');

class AnnouncementJobHandler {
    async handle(job) {
        const jobId = job.id;
        const payload = job.payload;

        await jobLogger.logAutomation(jobId, `Starting announcement dispatch job #${jobId}`, {
            title: payload.announcementTitle,
            userId: payload.userId,
            attempt: job.attempts
        });

        if (payload.captionVariations && payload.captionVariations.length > 0) {
            await jobLogger.logAI(jobId, `Selected caption variation index ${payload.captionIndex || 0} for dispatch.`, {
                selectedCaption: payload.caption,
                variationsCount: payload.captionVariations.length
            });
        }

        await jobLogger.logWhatsApp(jobId, `Connecting to Destination Engine for dispatching...`, {
            groupsCount: payload.targetGroups?.length || 0,
            contactsCount: payload.contactIds?.length || 0,
            listsCount: payload.contactListIds?.length || 0,
            audienceListsCount: payload.audienceListIds?.length || 0,
            includeStatus: Boolean(payload.includeStatus)
        });

        const result = await DestinationEngine.dispatch(payload);

        await jobLogger.logAutomation(jobId, `Announcement dispatch completed.`, {
            totalDelivered: result.succeeded,
            totalFailed: result.failed,
            totalTargets: result.totalTargets
        });

        if (result.failed > 0 && result.succeeded === 0) {
            throw new Error(`Dispatch failed for all ${result.totalTargets} destination(s). Check WhatsApp connection status.`);
        }

        return result;
    }
}

module.exports = new AnnouncementJobHandler();
