var FS = require('fs');
var Path = require('path');
var Zlib = require('zlib');
var Glob = require('glob');
var Async = require('async');
var Tar = require('tar')
var Wrench = require('wrench');
var Crypto = require('crypto');
var Debug = require('debug')('myriad-server')
var NPM = require('./npm');

var Installer = function() {
  if (!(this instanceof Installer)) return new Installer();

  var self = this;

  self._installingPackages = {};
};

Installer.prototype.install = function(options, callback) {
  var self = this;

  var tempDir = Path.join('myriad/tmp', self._getTempName());

  try {
    Wrench.mkdirSyncRecursive(tempDir, '0700');
  }
  catch (err) {
    callback({ message: "Failed to create temp directory", error: err });
    return;
  }

  var cacheDir = Path.join('myriad/cache');

  try {
    Wrench.mkdirSyncRecursive(cacheDir, '0700');
  }
  catch (err) {
    callback({ message: "Failed to create cache directory", error: err });
    return;
  }

  var packagesDir = Path.join('myriad/packages');

  try {
    Wrench.mkdirSyncRecursive(packagesDir, '0700');
  }
  catch (err) {
    callback({ message: "Failed to create packages directory", error: err });
    return;
  }

  Async.waterfall(
    [
      function(callback) {
        var packageFile = Path.join(tempDir, 'package.tgz');
        Debug("Saving package to " + packageFile);

        var packageData = new Buffer(options.package, 'base64');

        FS.writeFile(packageFile, packageData, function(err) {
          if (err) {
            callback({ message: "Failed to save package tarball", error: err });
          }
          else {
            callback(null, packageFile, packageData);
          }
        });
      },
      function(packageFile, packageData, callback) {
        var finished = false;

        var packageTempDir = Path.join(tempDir, "package");

        Debug("Extracting " + packageFile + " to " + tempDir);
        FS.createReadStream(packageFile)
          .pipe(Zlib.createGunzip())
          .pipe(Tar.Extract({ path: tempDir }))
          .on("error", function (err) {
            if (finished) return;
            finished = true;

            callback({ message: "Failed to extract package tarball", error: err });
          })
          .on("end", function () {
            if (finished) return;
            finished = true;

            callback(null, packageTempDir, packageData);
          });
      },
      function(packageTempDir, packageData, callback) {
        var packageJsonFile = Path.join(packageTempDir, 'package.json');

        Debug('Reading ' + packageJsonFile);
        FS.readFile(packageJsonFile, { encoding: 'utf8' }, function(err, data) {
          if (err) {
            callback({ message: "Failed to read package.json", error: err });
          }
          else {
            var packageJson;

            try {
              packageJson = JSON.parse(data);
            }
            catch (err) {
              callback({ message: "Failed to parse package.json", error: err });
              return;
            }

            callback(null, packageTempDir, packageJson, packageData);
          }
        });
      },
      function(packageTempDir, packageJson, packageData, callback) {
        var packageId = self._getPackageId(packageJson.name, packageJson.version, packageData);

        var cachePackageDir = Path.join(cacheDir, packageId);

        FS.exists(cachePackageDir, function(exists) {
          callback(null, packageTempDir, packageId, cachePackageDir, exists);
        });
      },
      function(packageTempDir, packageId, cachePackageDir, cachePackageDirExists, callback) {
        if (cachePackageDirExists) {
          callback(null, packageId, cachePackageDir);
        }
        else {
          var installingPackage = self._installingPackages[packageId];

          if (installingPackage) {
            installingPackage.waiting.push(callback);
          }
          else {
            installingPackage = {
              waiting: []
            };

            self._installingPackages[packageId] = installingPackage;

            Async.waterfall(
              [
                function(callback) {
                  Debug("Installing package " + packageTempDir);
                  NPM.install({ cwd: packageTempDir }, function(err) {
                    if (err) {
                      callback({ message: "Failed to install package via npm install", error: err });
                    }
                    else {
                      callback();
                    }
                  });
                },
                function(callback) {
                  Debug("Copying installed package fom temp directory to cache");
                  Wrench.copyDirRecursive(packageTempDir, cachePackageDir, function(err) {
                    if (err) {
                      callback({ message: "Failed to copy installed package from temp directory to cache", error: err });
                    }
                    else {
                      callback();
                    }
                  });
                }
              ],
              function(err) {
                if (err) {
                  callback({ message: "Failed to install package", error: err });
                }
                else {
                  callback(null, packageId, cachePackageDir);

                  installingPackage.waiting.forEach(function(waiting) {
                    waiting(null, packageId, cachePackageDir);
                  });
                }
              }
            );
          }
        }
      },
      function(packageId, cachePackageDir, callback) {
        var packageDir = Path.join(packagesDir, self._getTempName());

        Wrench.copyDirRecursive(cachePackageDir, packageDir, function(err) {
          if (err) {
            callback({ message: "Failed to copy installed package from cache", error: err });
          }
          else {
            callback(null, packageDir);
          }
        });
      }
    ],
    function(err, packageDir) {
      if (err) {
        callback(err);
      }
      else {
        callback(null, packageDir);
      }
    }
  );
};

Installer.prototype._stringPadLeft = function(value, length, character) {
  while (value.length < length) {
    value = character + value;
  }

  return value;
}

Installer.prototype._getTempName = function() {
  var self = this;

  var now = new Date();

  return [
    self._stringPadLeft(now.getFullYear().toString(), 4, '0'),
    self._stringPadLeft((now.getMonth() + 1).toString(), 2, '0'),
    self._stringPadLeft(now.getDate().toString(), 2, '0'),
    (Math.random() * 0x100000000).toString(36)
  ].join('-');
};

Installer.prototype._getPackageId = function(name, version, packageData) {
  return name + '@' + (version | '') + '-' + Crypto.createHash('md5').update(packageData).digest("hex");
};

module.exports = Installer;