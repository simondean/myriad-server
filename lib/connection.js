var Path = require('path');
var WinSpawn = require('win-spawn');
var Async = require('async');
var WebSocket = require('faye-websocket');
var Debug = require('debug')('myriad-server')

var Connection = function(request, socket, body, installer) {
  if (!(this instanceof Connection)) return new Connection(request, socket, body, installer);

  var self = this;

  self._installer = installer;

  Debug("Socket connecting");
  self._socket = new WebSocket(request, socket, body);
  Debug("Socket connected");

  self._socket.on('message', function(event) {
    var event = JSON.parse(event.data);
    Debug('Received ' + event.event + ' message');
    if (event.event === 'spawn') {
      self.spawn(event.data);
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
}

Connection.prototype._send = function(options) {
  var self = this;

  Debug('Sending ' + options.event + ' message');
  self._socket.send(JSON.stringify(options));
}


Connection.prototype.spawn = function(options) {
  var self = this;

  Debug("localPackage: " + options.localPackage);

  if (options.localPackage !== true && options.localPackage !== false) {
    Debug("Defaulting localPackage to true");
    options.localPackage = true;
  }

  Async.waterfall(
    [
      function(callback) {
        callback(null, options.package);
      },
      function(package, callback) {
        if (options.localPackage) {
          Debug("Using local package " + package);
          callback(null, package);
        }
        else {
          self._installer.install({ package: package }, function(err, packageDir) {
            callback(err, packageDir);
          });
        }
      }
    ],
    function(err, packageDir) {
      if (err) {
        self._send({ event: 'error', error: err });
      }
      else {
        Debug('Spawning a process for ' + Path.resolve(packageDir, options.bin));
        Debug("bin: " + JSON.stringify(options.bin));
        Debug("args: " + JSON.stringify(options.args));
        Debug("env: " + JSON.stringify(options.env));
        // See https://github.com/joyent/node/issues/2318 for the reason that
        // win-spawn has to be used instead of child_process
        self._child = WinSpawn(options.bin, options.args, {
          cwd: packageDir,
          stdio: 'pipe',
          env: options.env
        });

        self._child.on('error', function(err) {
          self._send({ event: 'child_error', error: err })
        });

        self._child.stdout.on('data', function(data) {
          self._send({ event: 'child_stdout', data: data.toString('base64') });
        });

        self._child.stderr.on('data', function(data) {
          self._send({ event: 'child_stderr', data: data.toString('base64') });
        });

        self._child.on('exit', function(code, signal) {
          self._send({ event: 'child_exit', code: code, signal: signal });
        });

        self._child.on('close', function(code, signal) {
          self._send({ event: 'child_close', code: code, signal: signal });
        });

        self._child.on('disconnect', function() {
          self._send({ event: 'child_disconnect' });
        });

//        self._child.on('message', function(message) {
//          self._send({ event: 'child_message', data: message.toString('base64') });
//        });
      }
    }
  );
}

module.exports = Connection;