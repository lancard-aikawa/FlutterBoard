const http = require('http');
const fs = require('fs');
const path = require('path');

const { handleApi } = require('./api');

const PORT = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1])
  : 3210;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const PUBLIC = path.join(__dirname, '..', 'public');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API ルート
  if (url.pathname.startsWith('/api/')) {
    return handleApi(req, res, url);
  }

  // 静的ファイル配信
  let filePath = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);

  // パストラバーサル防止
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`FlutterBoard running at http://localhost:${PORT}`);

  // Write PID file so stop.cmd can find the exact node process
  const pidFile = path.join(__dirname, '..', 'config', 'flutterboard.pid');
  try {
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(process.pid), 'utf-8');
  } catch (_) {}
});
