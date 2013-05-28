var Temp = require('temp');
var FS = require('fs');
var Path = require('path');
var WinSpawn = require('win-spawn');
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
        socket.emit('error', err);
      }
      else {
        Debug('Spawning a process for ' + Path.resolve(packageDir, options.bin));
        var bin = toOSStylePath(options.bin);
        Debug(bin);
        Debug(options.args);
        // See https://github.com/joyent/node/issues/2318 for the reason that
        // win-spawn has to be used instead of child_process
        this._child = WinSpawn(bin, options.args, {
          cwd: packageDir,
          stdio: 'pipe',
          env: options.env
        });

        this._child.stdout.on('data', function(data) {
          Debug("Emitting event child_stdout");
          socket.emit('childStdout', data.toString('base64'));
        });

        this._child.stderr.on('data', function(data) {
          Debug("Emitting event child_stderr");
          socket.emit('childStderr', data.toString('base64'));
        });

        this._child.on('error', function(err) {
          Debug("Emitting event child_error");
          socket.emit('childError', err);
        });

        this._child.on('exit', function(code, signal) {
          Debug("Emitting event child_exit");
          socket.emit('childExit', { code: code, signal: signal });
        });

        this._child.on('close', function(code, signal) {
          Debug("Emitting event child_close");
          socket.emit('childClose', { code: code, signal: signal });
        });

        this._child.on('disconnect', function() {
          Debug("Emitting event child_disconnect");
          socket.emit('childDisconnect', {});
        });

        this._child.on('message', function(message) {
          Debug("Emitting event child_message");
          socket.emit('childMessage', message);
        });
      }
    }
  );
}

function toOSStylePath(path) {
  if (!path) {
    return path;
  }
  else if (process.platform === 'win32') {
    return path.replace(/\//g, '\\');
  }
  else {
    return path;
  }
}