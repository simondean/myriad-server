var Express = require('express');
var Http = require('http');
var SocketIO = require('socket.io');
var Events = require('events');
var Util = require('util');
var Winston = require('winston');
var Debug = require('debug')('myriad-server')
var Spawner = require('./spawner');

var Server = function(options) {
  if (!(this instanceof Server)) return new Server(options);

  var self = this;

  Events.EventEmitter.call(self);

  if (options) {
    self.listen(options);
  }
}

Util.inherits(Server, Events.EventEmitter);

Server.prototype.listen = function(options) {
  var self = this;

  var app = Express();
  var httpServer = Http.createServer(app);
  self._server = SocketIO.listen(httpServer, {
    'log level': 1
  });

  var port = options.port;
  httpServer.listen(port);
  Winston.info('Listening on port ' + port);

  app.get('/', function (req, res) {
    res.send('myriad-server');
  });

  self._server.sockets.on('connection', function (socket) {
    Debug("Socket connected")

    socket.on('spawn', function (data) {
      Debug('Spawning')
      Spawner.spawn(data, socket);
    });

    socket.on('stdin', function (data) {
      Debug('Writing to stdin')
      self._child.stdin.write(data);
    });

    socket.on('message', function (message) {
      Debug('Message received')
      self._child.send(message);
    });
  });
}

module.exports = Server;