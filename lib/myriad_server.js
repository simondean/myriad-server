var Server = require('./server');
var Debug = require('debug')('myriad-server')

var MyriadServer = function(options, callback) {
  return new Server(options, callback);
}

MyriadServer.Server = Server;

module.exports = MyriadServer;
