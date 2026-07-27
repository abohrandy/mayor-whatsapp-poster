const { getDb } = require('../../models/database');

class AIConfig {
    constructor() {
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.defaultActiveModel = 'google/gemini-2.5-flash';
        this.defaultFallbackModel = 'openai/gpt-4o-mini';
    }

    async getSettings() {
        try {
            const db = await getDb();
            const row = await db.get('SELECT * FROM ai_settings WHERE id = 1');
            return row || {};
        } catch {
            return {};
        }
    }

    async getApiKey() {
        const settings = await this.getSettings();
        return settings.openrouter_api_key || process.env.OPENROUTER_API_KEY || null;
    }

    async getActiveModel() {
        const settings = await this.getSettings();
        return settings.active_model || process.env.OPENROUTER_MODEL || this.defaultActiveModel;
    }

    async getFallbackModel() {
        const settings = await this.getSettings();
        return settings.fallback_model || this.defaultFallbackModel;
    }

    async isAIEnabled() {
        const settings = await this.getSettings();
        return settings.ai_enabled !== undefined ? Boolean(settings.ai_enabled) : true;
    }
}

module.exports = new AIConfig();
