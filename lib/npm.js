var ChildProcess = require('child_process');
var Debug = require('debug')('myriad-server')

var NPM = module.exports;

NPM.install = function(options, callback) {
  var child = ChildProcess.spawn('npm', ['install', options.package], {
    cwd: options.cwd,
    stdio: ['ignore', 'ignore', process.stderr]
  });

  child.on('exit', function(code) {
    if (code === null || code !== 0) {
      callback({ message: "Failed to install the package", exitCode: code });
    }
    else {
      callback();
    }
  });
}
