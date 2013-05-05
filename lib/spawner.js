var ChildProcess = require('child_process');
var Temp = require('temp');
var FS = require('fs');
var Path = require('path');
var Glob = require('glob');
var Async = require('async');
var Debug = require('debug')('myriad-server')
var NPM = require('./npm');

var Spawner = module.exports;

Spawner.spawn = function(options, socket) {
  if (options.localPackage !== true && options.localPackage !== false) {
    Debug("Defaulting localPackage to true");
    options.localPackage = true;
  }

  var tasks;

  if (options.localPackage) {
    tasks =
      [
        function(callback) {
          callback(null, options.package);
        }
      ];
  }
  else {
    tasks =
      [
        function(callback) {
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
        socket.emit('error', err);
      }
      else {
        Debug('Spawning a process for ' + Path.resolve(packageDir, options.bin));
        this._child = ChildProcess.spawn(options.bin, options.args, {
          cwd: packageDir,
          stdio: 'pipe',
          env: options.env
        });

        this._child.stdout.on('data', function(data) {
          socket.emit('childStdout', data.toString('base64'));
        });

        this._child.stderr.on('data', function(data) {
          socket.emit('childStderr', data.toString('base64'));
        });

        this._child.on('error', function(err) {
          socket.emit('childError', err);
        });

        this._child.on('exit', function(code, signal) {
          socket.emit('childExit', { code: code, signal: signal });
        });

        this._child.on('close', function(code, signal) {
          socket.emit('childClose', { code: code, signal: signal });
        });

        this._child.on('disconnect', function() {
          socket.emit('childDisconnect', {});
        });

        this._child.on('message', function(message) {
          socket.emit('childMessage', message);
        });
      }
    }
  );
}
