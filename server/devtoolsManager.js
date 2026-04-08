'use strict';
const { spawn } = require('child_process');

// Singleton DevTools server state
let devtoolsPort = null;
let devtoolsProc = null;

// Pending requests waiting for DevTools to start
const pendingQueue = [];

// "Serving DevTools at http://127.0.0.1:9100" (period optional)
const SERVING_RE = /Serving DevTools at https?:\/\/[^:]+:(\d+)/i;

// =====================================================================
// Flush helpers
// =====================================================================

function flushOk(port) {
  while (pendingQueue.length > 0) {
    const { res, vmUri } = pendingQueue.shift();
    sendUrl(res, vmUri, port);
  }
}

function flushError(msg) {
  while (pendingQueue.length > 0) {
    const { res } = pendingQueue.shift();
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  }
}

function sendUrl(res, vmUri, port) {
  const url = `http://127.0.0.1:${port}?uri=${encodeURIComponent(vmUri)}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ url, port: Number(port) }));
}

// =====================================================================
// Start / reuse DevTools server
// =====================================================================

function ensureDevTools(res, vmUri) {
  // Already running — reuse
  if (devtoolsPort) {
    return sendUrl(res, vmUri, devtoolsPort);
  }

  // Enqueue this request
  pendingQueue.push({ res, vmUri });

  // Another request is already starting the process — wait in queue
  if (pendingQueue.length > 1) return;

  // Spawn `dart devtools --no-launch-browser`
  const args = ['devtools', '--no-launch-browser'];
  const proc = spawn('dart', args, {
    shell: process.platform === 'win32',
    env:   process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  devtoolsProc = proc;

  let resolved = false;

  const onData = (chunk) => {
    if (resolved) return;
    const text = chunk.toString();
    const m    = text.match(SERVING_RE);
    if (m) {
      resolved     = true;
      devtoolsPort = m[1];
      clearTimeout(timer);
      flushOk(devtoolsPort);
    }
  };

  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('error', (err) => {
    if (resolved) return;
    resolved = true;
    clearTimeout(timer);
    devtoolsProc = null;
    devtoolsPort = null;
    flushError(`dart コマンドが見つかりません。Flutter SDK が PATH に含まれているか確認してください。(${err.message})`);
  });

  proc.on('exit', (code) => {
    devtoolsProc = null;
    devtoolsPort = null;
    if (!resolved) {
      resolved = true;
      clearTimeout(timer);
      flushError(`dart devtools が予期せず終了しました (code: ${code})`);
    }
  });

  const timer = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      flushError('dart devtools の起動がタイムアウトしました（20秒）');
    }
  }, 20000);
}

// =====================================================================
// Request handler
// =====================================================================

function handleDevTools(req, res, url) {
  if (url.pathname !== '/api/devtools/start' || req.method !== 'GET') {
    res.writeHead(404);
    return res.end('Not found');
  }

  const vmUri = url.searchParams.get('vmUri');
  if (!vmUri) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'vmUri パラメータが必要です' }));
  }

  ensureDevTools(res, vmUri);
}

module.exports = { handleDevTools };
