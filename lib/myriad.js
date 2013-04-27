var ChildProcess = require('child_process');
var Async = require('async');

var Myriad = function(argv) {
  var self = {
    run: function(callback) {
      var bin = argv._[0];
      var args = argv._.slice(1);

      map([{ bin: bin, args: args }], callback);
    }
  }

  return self;
}

function map(tasks, callback) {
  Async.map(tasks, function(task, callback) {
    var taskProcess = ChildProcess.spawn(task.bin, task.args, {
      stdio: ['ignore', process.stdout, process.stderr, 'ipc']
    });

    var done = false;

    taskProcess.on('message', function(data) {
      if (data.method === 'map') {
        map(data.tasks, function(err, output) {
          if (err) {
            taskProcess.send({ error: err });
          }
          else {
            taskProcess.send({ output: output });
          }
        });
      }
      else if (data.method === 'done') {
        if (done) {
          console.error("Duplicate done message received");
        }
        else {
          done = true;
          taskProcess.kill();
          callback(data);
        }
      }
      else {
        callback({ message: 'Unknown action ' + JSON.stringify(data.action) });
      }
    })
  }, callback);
}