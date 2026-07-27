const WhatsAppService = require('./WhatsAppService');
const BaileysAdapter = require('./BaileysAdapter');
const SessionManager = require('./SessionManager');

// Singleton instance
const whatsappService = new WhatsAppService();

module.exports = whatsappService;
module.exports.WhatsAppService = WhatsAppService;
module.exports.BaileysAdapter = BaileysAdapter;
module.exports.SessionManager = SessionManager;
