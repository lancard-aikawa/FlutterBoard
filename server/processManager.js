const { spawn } = require('child_process');

const LOG_BUFFER_MAX = 500; // プロセスごとに保持する最大ログ行数

// processes: Map<id, { proc, clients: Set, label, cmd, startedAt, exitCode, buffer: [] }>
const processes = new Map();
let nextId = 1;

function handleProcess(req, res, url) {
  const pathname = url.pathname;

  // GET /api/process/stream?id=1 — SSE でログ配信
  if (pathname === '/api/process/stream' && req.method === 'GET') {
    const id = parseInt(url.searchParams.get('id'));
    const entry = processes.get(id);
    if (!entry) {
      res.writeHead(404);
      return res.end('Process not found');
    }
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write('retry: 1000\n\n');

    // 接続時に既存バッファを一括送信（途中参加でもログを見られる）
    entry.buffer.forEach(item => {
      res.write(`data: ${JSON.stringify(item)}\n\n`);
    });

    entry.clients.add(res);
    req.on('close', () => entry.clients.delete(res));
    return;
  }

  // POST /api/process/start  { label, cmd, args, cwd }
  if (pathname === '/api/process/start' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }

      const { label = '', cmd, args = [], cwd } = parsed;
      if (!cmd) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'cmd is required' }));
      }

      const id = nextId++;
      const clients = new Set();
      const buffer = [];

      const proc = spawn(cmd, args, {
        cwd: cwd || process.cwd(),
        shell: true,
        env: process.env,
      });

      const entry = { proc, clients, label: label || cmd, cmd, args, cwd, startedAt: Date.now(), exitCode: null, buffer };
      processes.set(id, entry);

      const broadcast = (type, data) => {
        const item = { type, data, ts: Date.now() };
        // バッファに追加（古いものを削除）
        buffer.push(item);
        if (buffer.length > LOG_BUFFER_MAX) buffer.shift();
        const msg = `data: ${JSON.stringify(item)}\n\n`;
        clients.forEach(c => c.write(msg));
      };

      proc.stdout.on('data', chunk => broadcast('stdout', chunk.toString()));
      proc.stderr.on('data', chunk => broadcast('stderr', chunk.toString()));
      proc.on('close', code => {
        entry.exitCode = code;
        broadcast('exit', `プロセスが終了しました（コード: ${code}）`);
        // 終了後も履歴として残す（リストから自動削除しない）
      });
      proc.on('error', err => {
        broadcast('stderr', `起動エラー: ${err.message}`);
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id }));
    });
  }

  // POST /api/process/stop  { id }
  if (pathname === '/api/process/stop' && req.method === 'POST') {
    return readBody(req, body => {
      const { id } = JSON.parse(body);
      const entry = processes.get(id);
      if (entry && entry.exitCode === null) {
        entry.proc.kill();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  // DELETE /api/process/remove  { id } — 終了済みプロセスをリストから削除
  if (pathname === '/api/process/remove' && req.method === 'POST') {
    return readBody(req, body => {
      const { id } = JSON.parse(body);
      processes.delete(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  // GET /api/process/list
  if (pathname === '/api/process/list' && req.method === 'GET') {
    const list = [...processes.entries()].map(([id, e]) => ({
      id,
      label:     e.label,
      cmd:       e.cmd,
      startedAt: e.startedAt,
      running:   e.exitCode === null,
      exitCode:  e.exitCode,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(list));
  }

  res.writeHead(404);
  res.end('Not found');
}

function readBody(req, cb) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => cb(body));
}

module.exports = { handleProcess };
