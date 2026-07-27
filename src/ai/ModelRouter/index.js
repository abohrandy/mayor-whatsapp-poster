const openRouterAdapter = require('../OpenRouterAdapter');
const aiConfig = require('../AIConfig');

const MODEL_REGISTRY = {
    // ── Primary Models (Enabled) ─────────────────────────────────────────────
    'deepseek-v4-flash': { id: 'deepseek/deepseek-chat', name: 'DeepSeek V4 Flash', type: 'primary', enabled: true },
    'deepseek/deepseek-chat': { id: 'deepseek/deepseek-chat', name: 'DeepSeek V4 Flash', type: 'primary', enabled: true },

    'qwen-3.5-flash': { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 3.5 Flash', type: 'primary', enabled: true },
    'qwen/qwen-2.5-72b-instruct': { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 3.5 Flash', type: 'primary', enabled: true },

    'glm-5.1': { id: 'thudm/glm-4-9b-chat', name: 'GLM 5.1', type: 'primary', enabled: true },
    'thudm/glm-4-9b-chat': { id: 'thudm/glm-4-9b-chat', name: 'GLM 5.1', type: 'primary', enabled: true },

    'minimax-m2': { id: 'minimax/minimax-01', name: 'MiniMax M2', type: 'primary', enabled: true },
    'minimax/minimax-01': { id: 'minimax/minimax-01', name: 'MiniMax M2', type: 'primary', enabled: true },

    // ── Premium Models (Supported but DISABLED by default) ────────────────────
    'gpt': { id: 'openai/gpt-4o-mini', name: 'GPT (OpenAI)', type: 'premium', enabled: false },
    'openai/gpt-4o-mini': { id: 'openai/gpt-4o-mini', name: 'GPT (OpenAI)', type: 'premium', enabled: false },
    'openai/gpt-4o': { id: 'openai/gpt-4o', name: 'GPT-4o (OpenAI)', type: 'premium', enabled: false },

    'claude': { id: 'anthropic/claude-3.5-haiku', name: 'Claude (Anthropic)', type: 'premium', enabled: false },
    'anthropic/claude-3.5-haiku': { id: 'anthropic/claude-3.5-haiku', name: 'Claude (Anthropic)', type: 'premium', enabled: false },
    'anthropic/claude-3.5-sonnet': { id: 'anthropic/claude-3.5-sonnet', name: 'Claude (Anthropic)', type: 'premium', enabled: false },

    'gemini': { id: 'google/gemini-2.5-flash', name: 'Gemini (Google)', type: 'premium', enabled: false },
    'google/gemini-2.5-flash': { id: 'google/gemini-2.5-flash', name: 'Gemini (Google)', type: 'premium', enabled: false }
};

const DEFAULT_PRIMARY_MODEL = 'deepseek/deepseek-chat';
const FALLBACK_CHAIN_DEFAULTS = [
    'qwen/qwen-2.5-72b-instruct',
    'thudm/glm-4-9b-chat',
    'minimax/minimax-01'
];

class ModelRouter {
    constructor() {
        this.registry = MODEL_REGISTRY;
    }

    resolveModel(modelKey) {
        const key = (modelKey || '').toLowerCase();
        const entry = this.registry[key] || this.registry[modelKey];

        if (entry) {
            if (!entry.enabled) {
                console.warn(`[ModelRouter] Premium model "${entry.name}" (${entry.id}) is disabled. Routing to primary model "${DEFAULT_PRIMARY_MODEL}".`);
                return DEFAULT_PRIMARY_MODEL;
            }
            return entry.id;
        }

        return modelKey || DEFAULT_PRIMARY_MODEL;
    }

    /**
     * Determines whether fallback should occur for a given failure.
     * Fallback ONLY occurs for:
     * - Timeout (ECONNABORTED, request timeout, HTTP 408)
     * - Rate limits (HTTP 429)
     * - HTTP & Provider errors (HTTP 500, 502, 503, 504)
     * - Empty responses (HTTP 200 but content string is empty/null)
     * 
     * Do NOT fallback for:
     * - Invalid prompt (HTTP 400)
     * - No credits (HTTP 402)
     * - Invalid request / auth (HTTP 401)
     */
    isFallbackAllowed(adapterResult) {
        if (!adapterResult) return true;

        const code = adapterResult.statusCode || 500;
        const errStr = (adapterResult.error || '').toLowerCase();

        // Do NOT fallback for client validation / credit / auth errors
        if (code === 400 || code === 401 || code === 402) {
            return false;
        }

        // Fallback for empty responses
        if (adapterResult.success && (!adapterResult.content || !adapterResult.content.trim())) {
            return true;
        }

        // Fallback for timeouts, rate limits, and server/provider errors
        if (code === 429 || code === 408 || code >= 500 || errStr.includes('timeout') || errStr.includes('econnaborted')) {
            return true;
        }

        // Default fallback allowed for generic network failures
        return true;
    }

    /**
     * Route request with automatic 5-step fallback execution flow:
     * Primary Model ➔ Retry Primary Once ➔ Fallback 1 ➔ Fallback 2 ➔ Fallback 3 ➔ Return Error
     */
    async routeRequest({ systemPrompt, userPrompt, overrideModel = null, temperature = 0.7, maxTokens = null }) {
        const apiKey = await aiConfig.getApiKey();
        const configActiveModel = await aiConfig.getActiveModel();

        if (!apiKey) {
            throw new Error('OpenRouter API key is missing. Please configure OPENROUTER_API_KEY in environment or settings.');
        }

        const primaryModel = this.resolveModel(overrideModel || configActiveModel);

        // Build 5-step execution chain: Primary, Primary Retry, Fallback 1, Fallback 2, Fallback 3
        const steps = [
            { stepName: 'Primary Model (Attempt 1)', model: primaryModel },
            { stepName: 'Primary Model (Retry 1)', model: primaryModel },
            { stepName: 'Fallback 1', model: FALLBACK_CHAIN_DEFAULTS[0] },
            { stepName: 'Fallback 2', model: FALLBACK_CHAIN_DEFAULTS[1] },
            { stepName: 'Fallback 3', model: FALLBACK_CHAIN_DEFAULTS[2] }
        ];

        let lastErrorResult = null;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            console.log(`[ModelRouter] Executing Step ${i + 1}/${steps.length}: ${step.stepName} (${step.model})...`);

            const adapterResult = await openRouterAdapter.sendRequest({
                apiKey,
                model: step.model,
                systemPrompt,
                userPrompt,
                temperature,
                maxTokens
            });

            // Check if response is successful with non-empty content
            if (adapterResult.success && adapterResult.content && adapterResult.content.trim()) {
                if (i > 0) {
                    console.log(`[ModelRouter] Step ${i + 1} (${step.stepName}) succeeded after prior failure.`);
                }
                return {
                    content: adapterResult.content,
                    usage: adapterResult.usage,
                    modelUsed: adapterResult.model,
                    responseData: adapterResult.raw
                };
            }

            lastErrorResult = adapterResult;

            // Check if fallback is allowed for this failure
            const canFallback = this.isFallbackAllowed(adapterResult);
            if (!canFallback) {
                console.warn(`[ModelRouter] Non-fallback error encountered (${adapterResult.statusCode}: ${adapterResult.error}). Aborting failover chain immediately.`);
                throw new Error(adapterResult.error || 'AI request failed due to invalid prompt or credit limits.');
            }

            console.warn(`[ModelRouter] Step ${i + 1} (${step.stepName}) failed (${adapterResult.statusCode}: ${adapterResult.error}). Triggering automatic fallback to next step...`);
        }

        // If all 5 steps fail, throw the final aggregated error
        const finalErrMsg = lastErrorResult?.error || 'All Primary and Fallback AI models failed to process request.';
        throw new Error(`AI processing failed across all fallback models: ${finalErrMsg}`);
    }

    getModelRegistry() {
        return this.registry;
    }
}

module.exports = new ModelRouter();
module.exports.ModelRouter = ModelRouter;
module.exports.MODEL_REGISTRY = MODEL_REGISTRY;
