var log4js = require('log4js');

log4js.configure({
    appenders: [
        { type: 'dateFile', filename: 'logs/HmisServer.log', pattern: '-dd-MM-yyyy', alwaysIncludePattern: 'false' }
    ]
});

var logger = log4js.getLogger();

logger.setLevel('DEBUG');

module.exports = logger;