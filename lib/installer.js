var Temp = require('temp');
var FS = require('fs');
var Path = require('path');
var Glob = require('glob');
var Async = require('async');
var Debug = require('debug')('myriad-server')
var NPM = require('./npm');

var Installer = function() {
  if (!(this instanceof Installer)) return new Installer();

  var self = this;
}

Installer.prototype.install = function(options, callback) {
  Async.waterfall(
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
    ],
    function(err, packageDir) {
      callback(err, packageDir);
    }
  );
}

module.exports = Installer;