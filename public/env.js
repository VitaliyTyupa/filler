(function (global) {
  var location = global.location;
  var hostname = location && typeof location.hostname === 'string' ? location.hostname : 'localhost';
  var host = location && typeof location.host === 'string' ? location.host : hostname;
  var isHttps = location && location.protocol === 'https:';
  var isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0';

  function inferApiOrigin() {
    if (isLocal) {
      return 'http://localhost:8080';
    }

    var parts = hostname.split('.');
    if (parts.length >= 3) {
      return (isHttps ? 'https://' : 'http://') + 'api.' + parts.slice(1).join('.');
    }

    return (isHttps ? 'https://' : 'http://') + host;
  }

  function inferWsUrl() {
    if (isLocal) {
      return 'ws://localhost:8080/ws';
    }

    var parts = hostname.split('.');
    if (parts.length >= 3) {
      return (isHttps ? 'wss://' : 'ws://') + 'api.' + parts.slice(1).join('.') + '/ws';
    }

    return (isHttps ? 'wss://' : 'ws://') + host + '/ws';
  }

  global.__FILLER_WS_URL__ = inferWsUrl();
  global.__FILLER_API_URL__ = inferApiOrigin();
})(globalThis);
