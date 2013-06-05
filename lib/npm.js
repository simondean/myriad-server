var WinSpawn = require('win-spawn');
var Debug = require('debug')('myriad-server')

var NPM = module.exports;

NPM.install = function(options, callback) {
  Debug("Installing package");

  var args = ['install'];

  if (options.package) {
    args.push(options.package);
  }

  // See https://github.com/joyent/node/issues/2318 for the reason that
  // win-spawn has to be used instead of child_process
  var child = WinSpawn('npm', [args], {
    cwd: options.cwd,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: process.env
  });

  var finished = false;
  var stderrData = [];

  child.stderr.on('data', function(data) {
    stderrData.push(data.toString('base64'));
  });

  child.on('error', function(err) {
    if (finished) return;
    finished = true;

    callback({ message: "Failed to install the package", error: err });
  });

  child.on('exit', function(code) {
    if (finished) return;
    finished = true;

    if (code === null || code !== 0) {
      console.error(stderrData.join(''));
      callback({ message: "Failed to install the package", exitCode: code });
    }
    else {
      callback();
    }
  });
}
