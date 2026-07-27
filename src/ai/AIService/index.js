const aiConfig = require('../AIConfig');
const promptTemplates = require('../PromptTemplates');
const modelRouter = require('../ModelRouter');
const usageLogger = require('../UsageLogger');

class AIService {
    /**
     * Helper method to ignore media files completely and extract ONLY text caption.
     * @param {string|Object} input
     */
    extractTextOnly(input) {
        if (!input) {
            throw new Error('Text prompt or caption is required for AI processing.');
        }

        if (typeof input === 'string') {
            const trimmed = input.trim();
            if (!trimmed) throw new Error('Text caption cannot be empty.');
            return trimmed;
        }

        if (typeof input === 'object' && input !== null) {
            // Explicitly ignore media_files / media arrays and extract caption text only
            const textCandidate = input.caption || input.text || input.message || input.title;
            if (typeof textCandidate === 'string' && textCandidate.trim()) {
                return textCandidate.trim();
            }
        }

        throw new Error('No valid text caption found in input object for AI processing.');
    }

    /**
     * Core orchestrator method for processing text prompts via ModelRouter.
     * AIService NEVER calls OpenRouter or HTTP APIs directly!
     * 
     * @param {Object} params
     * @param {string} params.operation - 'improve'|'rewrite'|'grammar'|'translate'|'expand'|'shorten'|'generate_variations'
     * @param {string|Object} params.text - Input text or caption object
     * @param {string} [params.targetLanguage] - Target language for translate
     * @param {number} [params.count] - Variations count
     * @param {number} [params.userId] - User ID
     * @param {string} [params.userEmail] - User Email
     */
    async processText({ operation, text, targetLanguage = 'English', count = 3, userId = null, userEmail = null }) {
        const cleanText = this.extractTextOnly(text);

        const isEnabled = await aiConfig.isAIEnabled();
        if (!isEnabled) {
            throw new Error('AI features are currently disabled by system administrator.');
        }

        const systemPrompt = promptTemplates.getSystemPrompt();
        const userPrompt = promptTemplates.getUserPrompt(operation, cleanText, targetLanguage, count);

        // AIService communicates ONLY with ModelRouter
        const { responseData, modelUsed } = await modelRouter.routeRequest({ systemPrompt, userPrompt });

        const resultText = responseData?.choices?.[0]?.message?.content?.trim();
        if (!resultText) {
            throw new Error('AI processing returned an empty response.');
        }

        // Record telemetry asynchronously
        await usageLogger.logTelemetry({ userId, userEmail, operation, responseData, modelUsed });

        if (operation === 'generate_variations') {
            try {
                const cleanJson = resultText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
                const parsed = JSON.parse(cleanJson);
                if (Array.isArray(parsed)) {
                    return { result: parsed, count: parsed.length };
                }
            } catch {
                const lines = resultText.split('\n').map(l => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
                return { result: lines, count: lines.length };
            }
        }

        return { result: resultText };
    }

    // 1. Improve Text
    async improveText(input, options = {}) {
        const text = this.extractTextOnly(input?.text || input);
        return this.processText({ operation: 'improve', text, ...options });
    }

    // 2. Rewrite Text
    async rewriteText(input, options = {}) {
        const text = this.extractTextOnly(input?.text || input);
        return this.processText({ operation: 'rewrite', text, ...options });
    }

    // 3. Expand Text
    async expandText(input, options = {}) {
        const text = this.extractTextOnly(input?.text || input);
        return this.processText({ operation: 'expand', text, ...options });
    }

    // 4. Shorten Text
    async shortenText(input, options = {}) {
        const text = this.extractTextOnly(input?.text || input);
        return this.processText({ operation: 'shorten', text, ...options });
    }

    // 5. Grammar Correction
    async grammarCorrection(input, options = {}) {
        const text = this.extractTextOnly(input?.text || input);
        return this.processText({ operation: 'grammar', text, ...options });
    }

    // 6. Translate Text
    async translateText(input, targetLanguage = 'English', options = {}) {
        const rawInput = typeof input === 'object' && input !== null ? input : { text: input };
        const text = this.extractTextOnly(rawInput.text || rawInput);
        const lang = rawInput.targetLanguage || targetLanguage;
        return this.processText({ operation: 'translate', text, targetLanguage: lang, ...options });
    }

    // 7. Generate Variations
    async generateVariations(input, count = 3, options = {}) {
        const rawInput = typeof input === 'object' && input !== null ? input : { text: input };
        const text = this.extractTextOnly(rawInput.text || rawInput);
        const cnt = rawInput.count || count;
        return this.processText({ operation: 'generate_variations', text, count: cnt, ...options });
    }
}

module.exports = new AIService();
