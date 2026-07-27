const DestinationEngine = require('./DestinationEngine');
const GroupHandler = require('./GroupHandler');
const ContactHandler = require('./ContactHandler');
const ContactListHandler = require('./ContactListHandler');
const StatusHandler = require('./StatusHandler');

const destinationEngine = new DestinationEngine();

module.exports = destinationEngine;
module.exports.DestinationEngine = DestinationEngine;
module.exports.GroupHandler = GroupHandler;
module.exports.ContactHandler = ContactHandler;
module.exports.ContactListHandler = ContactListHandler;
module.exports.StatusHandler = StatusHandler;
