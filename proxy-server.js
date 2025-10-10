const http = require('http');
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({
  secure: false,
  changeOrigin: true,
  xfwd: true
});

const server = http.createServer((req, res) => {
  const host = req.headers.host;

  if (host === 'asemb.luwi.dev' || host === 'www.asemb.luwi.dev') {
    // Frontend'i 3002 portuna yönlendir
    proxy.web(req, res, { target: 'http://localhost:3002' }, (err) => {
      console.error('Proxy error for frontend:', err);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    });
  } else if (host === 'api.asemb.luwi.dev') {
    // Backend'i 8083 portuna yönlendir
    proxy.web(req, res, { target: 'http://localhost:8083' }, (err) => {
      console.error('Proxy error for backend:', err);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    });
  } else {
    // Default - frontend'e yönlendir
    proxy.web(req, res, { target: 'http://localhost:3002' });
  }
});

// WebSocket support
server.on('upgrade', (req, socket, head) => {
  const host = req.headers.host;

  if (host === 'asemb.luwi.dev' || host === 'api.asemb.luwi.dev') {
    proxy.ws(req, socket, head, { target: 'http://localhost:8083' });
  }
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  }
});

const PORT = 80;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Reverse proxy running on port ${PORT}`);
  console.log(`asemb.luwi.dev -> localhost:3002`);
  console.log(`api.asemb.luwi.dev -> localhost:8083`);
});