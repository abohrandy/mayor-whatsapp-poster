const templates = require('./templates');

class PromptTemplates {
    getSystemPrompt() {
        return templates.system();
    }

    getUserPrompt(operation, text, targetLanguage = 'English', count = 3) {
        if (!text || typeof text !== 'string') {
            throw new Error('Text parameter is required for prompt generation.');
        }

        const op = operation ? operation.toLowerCase() : 'improve';

        switch (op) {
            case 'improve':
                return templates.improve(text);
            case 'rewrite':
                return templates.rewrite(text);
            case 'grammar':
            case 'grammar_correction':
                return templates.grammar(text);
            case 'expand':
                return templates.expand(text);
            case 'shorten':
                return templates.shorten(text);
            case 'translate':
                return templates.translate(text, targetLanguage);
            case 'generate_variations':
            case 'variations':
                return templates.variations(text, count);
            default:
                return templates.improve(text);
        }
    }

    getImprovePrompt(text) {
        return templates.improve(text);
    }

    getRewritePrompt(text) {
        return templates.rewrite(text);
    }

    getGrammarPrompt(text) {
        return templates.grammar(text);
    }

    getExpandPrompt(text) {
        return templates.expand(text);
    }

    getShortenPrompt(text) {
        return templates.shorten(text);
    }

    getTranslatePrompt(text, targetLanguage = 'English') {
        return templates.translate(text, targetLanguage);
    }

    getVariationsPrompt(text, count = 3) {
        return templates.variations(text, count);
    }
}

module.exports = new PromptTemplates();
module.exports.PromptTemplates = PromptTemplates;
module.exports.templates = templates;
