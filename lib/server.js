var HTTP = require('http');
var WebSocket = require('faye-websocket');
var Events = require('events');
var Util = require('util');
var Debug = require('debug')('myriad-server');
var Installer = require('./installer');
var Connection = require('./connection');

var Server = function(options, callback) {
  if (!(this instanceof Server)) return new Server(options, callback);

  var self = this;

  Events.EventEmitter.call(self);

  self._installer = new Installer(function() {
    if (options) {
      self.listen(options, callback);
    }
  });
}

Util.inherits(Server, Events.EventEmitter);

Server.prototype.listen = function(options, callback) {
  var self = this;

  self._server = HTTP.createServer();

  self._server.on('request', function(req, res) {
    Debug('Request for ' + req.url);
    if (req.url == '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('myriad-server');
    }
    else {
      res.writeHead(404);
      res.end();
    }
  });

  self._server.on('upgrade', function(request, socket, body) {
    Debug('Upgrade');
    if (WebSocket.isWebSocket(request)) {
      new Connection(request, socket, body, self._installer);
    }
  });

  if (callback) {
    self.on('listening', callback);
  }

  self._server.listen(options.port, function() {
    Debug('Raising listening event');
    self.emit('listening', { port: options.port })
  });
}

Server.prototype.close = function(callback) {
  var self = this;

  if (callback) {
    self.on('close', callback);
  }

  Debug('Closing server');

  self._server.close(function() {
    Debug('Closed server');
    self.emit('close', {})
  });
}

module.exports = Server;