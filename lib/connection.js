var Temp = require('temp');
var FS = require('fs');
var Path = require('path');
var WinSpawn = require('win-spawn');
var Glob = require('glob');
var Async = require('async');
var WebSocketDriver = require('websocket-driver');
var Debug = require('debug')('myriad-server')
var NPM = require('./npm');

var Connection = function(request, socket, body) {
  if (!(this instanceof Connection)) return new Connection(request, socket, body);

  var self = this;

  self._driver = WebSocketDriver.http(request);

  Debug("Socket connected");

  self._driver.io.write(body);
  socket.pipe(self._driver.io);
  self._driver.io.pipe(socket);

  self._driver.on('message', function(event) {
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

  self._driver.start();
}

Connection.prototype._send = function(options) {
  var self = this;

  Debug('Sending ' + options.event + ' message');
  self._driver.text(JSON.stringify(options));
}


Connection.prototype.spawn = function(options) {
  var self = this;

  if (options.localPackage !== true && options.localPackage !== false) {
    Debug("Defaulting localPackage to true");
    options.localPackage = true;
  }

  var tasks;

  if (options.localPackage) {
    tasks =
      [
        function(callback) {
          Debug("Using local package " + options.package);
          callback(null, options.package);
        }
      ];
  }
  else {
    tasks =
      [
        function(callback) {
          Debug("Creating temp directory");
          Temp.mkdir('myriad-spawn-', function(err, tempDir) {
            if (err) {
              callback({ message: "Failed to create a temporary directory for the package", error: err });
            }
            else {
              Debug("Created temporary directory " + tempDir);
              callback(null, tempDir);
            }
          });
        },
        function(tempDir, callback) {
          var package = Path.join(tempDir, 'package.tgz');
          Debug("Extracting package to " + package);

          FS.writeFile(package, new Buffer(options.package, 'base64'), function(err) {
            if (err) {
              callback({ message: "Failed to save package tarball", error: err });
            }
            else {
              callback(null, tempDir);
            }
          });
        },
        function(tempDir, callback) {
          Debug("Installing package " + Path.join(tempDir, 'package.tgz'));
          NPM.install({ package: 'package.tgz', cwd: tempDir }, function(err) {
            if (err) {
              callback({ message: "Failed to install package", error: err });
            }
            else {
              callback(null, tempDir);
            }
          });
        },
        function(tempDir, callback) {
          Glob('node_modules/*', { strict: true, cwd: tempDir }, function(err, matches) {
            if (err) {
              callback({ message: "Failed to find installed package", error: err });
            }
            else {
              if (matches.length !== 1) {
                callback({ message: "Expected 1 installed package.  Actually got " + matches.length + " packages" });
              }
              else {
                var packageDir = Path.join(tempDir, matches[0]);
                Debug('Package installed in ' + packageDir);
                callback(null, packageDir);
              }
            }
          });
        }
      ];
  }

  Async.waterfall(
    tasks,
    function(err, packageDir) {
      if (err) {
        send({ event: 'error', error: err });
      }
      else {
        Debug('Spawning a process for ' + Path.resolve(packageDir, options.bin));
        Debug(options.bin);
        Debug(options.args);
        // See https://github.com/joyent/node/issues/2318 for the reason that
        // win-spawn has to be used instead of child_process
        self._child = WinSpawn(options.bin, options.args, {
          cwd: packageDir,
          stdio: 'pipe',
          env: options.env
        });

        self._child.stdout.on('data', function(data) {
          self._send({ event: 'child_stdout', data: data.toString('base64') });
        });

        self._child.stderr.on('data', function(data) {
          self._send({ event: 'child_stderr', data: data.toString('base64') });
        });

        self._child.on('error', function(err) {
          self._send({ event: 'child_error', error: err })
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