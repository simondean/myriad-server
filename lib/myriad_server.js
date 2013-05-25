var Server = require('./server');
var Debug = require('debug')('myriad-server')

var MyriadServer = function(options) {
  return new Server(options);
}

MyriadServer.Server = Server;

module.exports = MyriadServer;
