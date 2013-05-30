var HTTP = require('http');
var WebSocketDriver = require('websocket-driver');
var Events = require('events');
var Util = require('util');
var Winston = require('winston');
var Debug = require('debug')('myriad-server')
var Spawner = require('./spawner');

var Server = function(options, callback) {
  if (!(this instanceof Server)) return new Server(options, callback);

  var self = this;

  Events.EventEmitter.call(self);

  if (options) {
    self.listen(options, callback);
  }
}

Util.inherits(Server, Events.EventEmitter);

Server.prototype.listen = function(options, callback) {
  var self = this;

  var server = HTTP.createServer();

  server.on('request', function(req, res) {
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

  server.on('upgrade', function(request, socket, body) {
    Debug('Upgrade');
    if (!WebSocketDriver.isWebSocket(request)) return;

    var driver = WebSocketDriver.http(request);

    Debug("Socket connected");

    driver.io.write(body);
    socket.pipe(driver.io);
    driver.io.pipe(socket);

    driver.on('message', function(event) {
      var event = JSON.parse(event.data);
      Debug('Received ' + event.event + ' message');
      if (event.event === 'spawn') {
        Spawner.spawn(event.data, driver);
      }
    });

//    socket.on('stdin', function (data) {
//      Debug('Writing to stdin')
//      self._child.stdin.write(data);
//    });

//    socket.on('message', function (message) {
//      Debug('Message received')
//      self._child.send(message);
//    });

    driver.start();
  });

  if (callback) {
    self.on('listening', callback);
  }

  Winston.info('Listening on port ' + options.port);
  server.listen(options.port, function() {
    Debug('Raising listening event');
    self.emit('listening', {})
  });
}

module.exports = Server;