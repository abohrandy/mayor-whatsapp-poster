const aiService = require('./AIService');
const creditService = require('./CreditService');

aiService.AIService = aiService;
aiService.aiCreditManager = creditService;
aiService.creditService = creditService;

module.exports = aiService;
