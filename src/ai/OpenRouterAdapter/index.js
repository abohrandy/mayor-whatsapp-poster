const axios = require('axios');

class OpenRouterAdapter {
    constructor(baseUrl = null) {
        this.baseUrl = baseUrl || 'https://openrouter.ai/api/v1/chat/completions';
        this.defaultModel = 'google/gemini-2.5-flash';
    }

    /**
     * Resolves OpenRouter API Key from environment or explicit override.
     * @param {string} [overrideKey]
     */
    getApiKey(overrideKey = null) {
        return overrideKey || process.env.OPENROUTER_API_KEY || null;
    }

    /**
     * Builds standard HTTP headers for OpenRouter API requests.
     * @param {string} apiKey
     */
    buildHeaders(apiKey) {
        return {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': process.env.APP_TITLE || 'Mayor WhatsApp Poster',
            'Content-Type': 'application/json'
        };
    }

    /**
     * Constructs standardized OpenRouter request payload.
     * @param {Object} options
     */
    buildPayload({
        model = null,
        messages = [],
        systemPrompt = null,
        userPrompt = null,
        temperature = 0.7,
        maxTokens = null,
        topP = null,
        responseFormat = null
    }) {
        const formattedMessages = [...messages];

        if (systemPrompt && !messages.some(m => m.role === 'system')) {
            formattedMessages.unshift({ role: 'system', content: systemPrompt });
        }

        if (userPrompt && !messages.some(m => m.role === 'user' && m.content === userPrompt)) {
            formattedMessages.push({ role: 'user', content: userPrompt });
        }

        const payload = {
            model: model || process.env.OPENROUTER_MODEL || this.defaultModel,
            messages: formattedMessages,
            temperature
        };

        if (maxTokens) payload.max_tokens = maxTokens;
        if (topP) payload.top_p = topP;
        if (responseFormat) payload.response_format = responseFormat;

        return payload;
    }

    /**
     * Sends a request to OpenRouter API and returns a standardized response or error object.
     * Reusable throughout the project.
     * 
     * @param {Object} options
     * @param {string} [options.apiKey] - Optional custom API key override
     * @param {string} [options.model] - Target AI model
     * @param {Array} [options.messages] - Array of message objects [{role, content}]
     * @param {string} [options.systemPrompt] - System prompt instructions
     * @param {string} [options.userPrompt] - User prompt text
     * @param {number} [options.temperature] - Sampling temperature (0.0 - 2.0)
     * @param {number} [options.maxTokens] - Max tokens to generate
     * 
     * @returns {Promise<Object>} Standardized result object:
     * {
     *   success: boolean,
     *   content?: string,
     *   model?: string,
     *   usage?: { promptTokens: number, completionTokens: number, totalTokens: number },
     *   raw?: object,
     *   error?: string,
     *   statusCode?: number,
     *   rawError?: object
     * }
     */
    async sendRequest(options = {}) {
        const apiKey = this.getApiKey(options.apiKey);

        if (!apiKey) {
            return {
                success: false,
                error: 'OpenRouter API key is missing. Please set OPENROUTER_API_KEY in environment variables.',
                statusCode: 401,
                rawError: null
            };
        }

        const headers = this.buildHeaders(apiKey);
        const payload = this.buildPayload(options);

        try {
            const response = await axios.post(this.baseUrl, payload, { headers, timeout: 60000 });
            return this.parseResponse(response.data);
        } catch (error) {
            return this.handleError(error);
        }
    }

    /**
     * Parses OpenRouter API response data into a standardized response object.
     * @param {Object} data
     */
    parseResponse(data) {
        const choice = data?.choices?.[0];
        const content = choice?.message?.content?.trim() || '';
        const modelUsed = data?.model || 'unknown';
        const usageData = data?.usage || {};

        return {
            success: true,
            content,
            model: modelUsed,
            usage: {
                promptTokens: usageData.prompt_tokens || 0,
                completionTokens: usageData.completion_tokens || 0,
                totalTokens: usageData.total_tokens || ((usageData.prompt_tokens || 0) + (usageData.completion_tokens || 0))
            },
            raw: data
        };
    }

    /**
     * Normalizes errors into a standardized error response object.
     * @param {Error} error
     */
    handleError(error) {
        const response = error.response;
        const statusCode = response?.status || 500;
        const rawErrorData = response?.data || null;

        let errorMessage = error.message;

        if (response?.data?.error) {
            if (typeof response.data.error === 'string') {
                errorMessage = response.data.error;
            } else if (response.data.error.message) {
                errorMessage = response.data.error.message;
            }
        }

        console.error(`[OpenRouterAdapter Error] [${statusCode}]:`, errorMessage);

        return {
            success: false,
            error: errorMessage,
            statusCode,
            rawError: rawErrorData
        };
    }

    /**
     * Backwards-compatible legacy method.
     */
    async executeRequest({ apiKey, model, systemPrompt, userPrompt }) {
        const result = await this.sendRequest({ apiKey, model, systemPrompt, userPrompt });
        if (!result.success) {
            throw new Error(result.error);
        }
        return result.raw;
    }
}

module.exports = new OpenRouterAdapter();
module.exports.OpenRouterAdapter = OpenRouterAdapter;
