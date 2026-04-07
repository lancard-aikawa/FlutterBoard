const { spawn } = require('child_process');

const LOG_BUFFER_MAX = 2000;

// processes: Map<id, { proc, clients, label, cmd, args, cwd, startedAt, exitCode, buffer }>
const processes = new Map();
let nextId = 1;

function handleProcess(req, res, url) {
  const pathname = url.pathname;

  // GET /api/process/stream?id=1 — SSE ログ配信
  if (pathname === '/api/process/stream' && req.method === 'GET') {
    const id    = parseInt(url.searchParams.get('id'));
    const entry = processes.get(id);
    if (!entry) { res.writeHead(404); return res.end('Process not found'); }

    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write('retry: 1000\n\n');

    // バッファを一括送信
    entry.buffer.forEach(item => res.write(`data: ${JSON.stringify(item)}\n\n`));

    entry.clients.add(res);
    req.on('close', () => entry.clients.delete(res));
    return;
  }

  // POST /api/process/start  { label, cmd, args, cwd }
  if (pathname === '/api/process/start' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }

      const { label = '', cmd, args = [], cwd } = parsed;
      if (!cmd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'cmd is required' })); }

      const id      = nextId++;
      const clients = new Set();
      const buffer  = [];

      const proc = spawn(cmd, args, {
        cwd:   cwd || process.cwd(),
        shell: true,
        env:   process.env,
        // stdin を pipe にして書き込み可能にする
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const entry = { proc, clients, label: label || cmd, cmd, args, cwd, startedAt: Date.now(), exitCode: null, buffer };
      processes.set(id, entry);

      const broadcast = (type, data) => {
        const item = { type, data, ts: Date.now() };
        buffer.push(item);
        if (buffer.length > LOG_BUFFER_MAX) buffer.shift();
        const msg = `data: ${JSON.stringify(item)}\n\n`;
        clients.forEach(c => c.write(msg));
      };

      proc.stdout.on('data', chunk => broadcast('stdout', chunk.toString()));
      proc.stderr.on('data', chunk => broadcast('stderr', chunk.toString()));
      proc.on('close', code => {
        entry.exitCode = code;
        broadcast('exit', `Process exited (code: ${code})`);
      });
      proc.on('error', err => broadcast('stderr', `Launch error: ${err.message}`));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id }));
    });
  }

  // POST /api/process/input  { id, text } — stdin に書き込む
  if (pathname === '/api/process/input' && req.method === 'POST') {
    return readBody(req, body => {
      const { id, text } = JSON.parse(body);
      const entry = processes.get(id);

      res.writeHead(200, { 'Content-Type': 'application/json' });

      if (!entry || entry.exitCode !== null) {
        return res.end(JSON.stringify({ ok: false, error: 'Process not running' }));
      }

      try {
        entry.proc.stdin.write(text);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  }

  // GET /api/process/log?id=1 — バッファ全体をテキストで返す（ファイル保存用）
  if (pathname === '/api/process/log' && req.method === 'GET') {
    const id    = parseInt(url.searchParams.get('id'));
    const entry = processes.get(id);
    if (!entry) { res.writeHead(404); return res.end('Not found'); }

    const text = entry.buffer.map(item => {
      const t = new Date(item.ts).toISOString();
      return `[${t}] [${item.type.toUpperCase()}] ${item.data}`;
    }).join('');

    res.writeHead(200, {
      'Content-Type':        'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${entry.label.replace(/[^\w.-]/g, '_')}.log"`,
    });
    return res.end(text);
  }

  // POST /api/process/stop  { id }
  if (pathname === '/api/process/stop' && req.method === 'POST') {
    return readBody(req, body => {
      const { id } = JSON.parse(body);
      const entry  = processes.get(id);
      if (entry && entry.exitCode === null) entry.proc.kill();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  // POST /api/process/remove  { id }
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
      id, label: e.label, cmd: e.cmd,
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
