const systemPrompt = "You are an expert AI copywriting assistant for WhatsApp automation campaigns. You ONLY process text. Never generate images or videos. If media descriptions are provided in text, process the text caption only. Return strictly text output.";

const templates = {
    system: () => systemPrompt,

    improve: (text) => 
        `Improve and polish the following WhatsApp caption for maximum engagement, clarity, and impact. Return ONLY the improved text without explanation:\n\n${text.trim()}`,

    rewrite: (text) => 
        `Rewrite the following WhatsApp caption with a fresh, persuasive tone while keeping the core message intact. Return ONLY the rewritten text:\n\n${text.trim()}`,

    grammar: (text) => 
        `Fix all grammar, spelling, and punctuation errors in the following text. Return ONLY the corrected text:\n\n${text.trim()}`,

    expand: (text) => 
        `Expand and elaborate on the following text by adding relevant details and engaging context. Return ONLY the expanded text:\n\n${text.trim()}`,

    shorten: (text) => 
        `Condense and shorten the following text to be concise, clear, and punchy. Return ONLY the shortened text:\n\n${text.trim()}`,

    translate: (text, targetLanguage = 'English') => 
        `Translate the following text into ${targetLanguage}. Return ONLY the translated text:\n\n${text.trim()}`,

    variations: (text, count = 3) => 
        `Generate ${count} distinct text variations for the following WhatsApp caption. Output MUST be formatted strictly as a JSON array of strings (e.g. ["variation 1", "variation 2", ...]) with no markdown backticks, explanations, or codeblocks:\n\n${text.trim()}`
};

module.exports = templates;
