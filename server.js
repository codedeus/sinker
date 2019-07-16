'use strict';
require('dotenv').config();
const Hapi = require('hapi');

var mongojs = require('mongojs');

const util = require('util');

var logger = require('./logConfig/logConfig');

var syncCtrl = require('./DataSync/synchingController');

const server = new Hapi.Server({ debug: { request: ['error'] } });

if (global.JSON && !global.JSON.dateParser) {
    var reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
    var reMsAjax = /^\/Date\((d|-|.*)\)[\/|\\]$/;
    JSON.dateParser = function (key, value) {
        if (typeof value === 'string') {
            var a = reISO.exec(value);
            if (a)
                return new Date(value);
            a = reMsAjax.exec(value);
            if (a) {
                var b = a[1].split(/[-+,.]/);
                return new Date(b[0] ? +b[0] : 0 - +b[1]);
            }
        }
        return value;
    };
}


server.app.StoreConnections = {};

server.connection({
    host: 'localhost',
    port: 8000,
    routes: {
        log: true,
        cors: true,
        payload: {
            maxBytes: 1048576000
        },
    }
});


const GetStoreConnection = function (StoreName) {
    var storeConnection = server.app.StoreConnections[StoreName];
    if (!storeConnection) {
        storeConnection = mongojs(StoreName);
        server.app.StoreConnections[StoreName] = storeConnection;
    }
    return  storeConnection;
};

//sync entities
server.route({
    method: 'POST',
    path: '/syncentities',
    handler: function (request, reply) {
		
		//logger.debug(request.payload);

        //JSON.parse(request.payload);
        let requestPayLoad;

        if (request.payload.IsSetUpCall) {
          
            requestPayLoad = JSON.parse(JSON.stringify(request.payload), JSON.dateParser);
        }

        else {
           
            requestPayLoad = JSON.parse(request.payload, JSON.dateParser);
        }
       
        var tenantStore = GetStoreConnection(requestPayLoad.StoreIdentifier);

        //const tenantStore = mongojs(requestPayLoad.StoreIdentifier);
        syncCtrl.SyncEntities(requestPayLoad, tenantStore, function (response) {
           
            response.NewEntityDateMark = new Date();
            var outputStream = require('stream').Readable();
            outputStream._read = function (size) {
               
                outputStream.push(JSON.stringify(response));
                // });

                outputStream.push(null);
                //}, 1000);
            };

            reply(outputStream);
        });
    }
});

server.on('request-error', function (request, err) {
    logger.error("Error Processing Request: \n" + request + "\n Details: " + util.inspect(err));
});

server.on('response', function (request) {
    logger.debug(request.info.remoteAddress + ': ' + request.method.toUpperCase() + ' ' + request.url.path + ' --> ' + request.response.statusCode + ' Details: \n' + util.inspect(request.getLog(), { depth: null, colors: false }));
});

server.on('log', function (log) {
    logger.debug("The server just said: " + log.data);
});

//ping
server.route({
    method: 'GET',
    path: '/ping',
    handler: function (request, reply) {

        reply('Ready');
    }
});

server.start((err) => {
    if (err) {
        throw err;
    }
    console.log('Server is running at..........', server.info.uri);
});


