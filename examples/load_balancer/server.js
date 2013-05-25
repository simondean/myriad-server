var Http = require('http');
var HttpProxy = require('http-proxy');

var targets = [
  {
    host: 'localhost',
    port: 7778
  },
  {
    host: 'localhost',
    port: 7779
  }
];

var proxies = targets.map(function (target) {
  return new HttpProxy.HttpProxy({
    target: target
  });
});

function nextProxy() {
  var proxy = proxies.shift();
  proxies.push(proxy);
  return proxy;
}

var server = Http.createServer(function (req, res) {
  nextProxy().proxyRequest(req, res);
});

server.on('upgrade', function (req, socket, head) {
  nextProxy().proxyWebSocketRequest(req, socket, head);
});

server.listen(7777);
