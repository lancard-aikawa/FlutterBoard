const { spawn } = require('child_process');

// Try to load node-pty; fall back to child_process.spawn if unavailable
let pty = null;
try {
  pty = require('node-pty');
  console.log('[processManager] node-pty loaded — PTY mode enabled');
} catch (_) {
  console.warn('[processManager] node-pty not available — falling back to pipe mode');
}

const LOG_BUFFER_MAX = 2000;

// processes: Map<id, { pty|proc, isPty, clients, label, cmd, args, cwd, startedAt, exitCode, buffer }>
const processes = new Map();
let nextId = 1;

// =====================================================================
// ANSI / control-character cleaner for plain-text log display
// =====================================================================

const ANSI_RE = /\x1b(?:\[[0-9;?]*[A-Za-z]|\][^\x07]*(?:\x07|\x1b\\)|[()][0-9A-Za-z]|.)/g;

function cleanOutput(str) {
  return str
    .replace(ANSI_RE, '')        // strip ANSI escape sequences
    .replace(/\r\n/g, '\n')      // normalize CRLF
    .replace(/\r(?!\n)/g, '\n'); // bare CR → newline
}

// =====================================================================
// Spawn helper — PTY preferred, pipe fallback
// =====================================================================

function spawnProcess(cmd, args, cwd) {
  if (pty) {
    try {
      // Reconstruct full command string for the shell
      const fullCmd = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;
      const shell   = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/bash');
      const shellArgs = process.platform === 'win32' ? ['/c', fullCmd] : ['-c', fullCmd];

      const ptyProc = pty.spawn(shell, shellArgs, {
        name: 'xterm-color',
        cols: 220,
        rows: 50,
        cwd:  cwd || process.cwd(),
        env:  process.env,
      });
      return { handle: ptyProc, isPty: true };
    } catch (e) {
      console.warn('[processManager] PTY spawn failed, falling back to pipe:', e.message);
    }
  }

  // Pipe fallback
  const proc = spawn(cmd, args, {
    cwd:   cwd || process.cwd(),
    shell: true,
    env:   process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { handle: proc, isPty: false };
}

// =====================================================================
// Request handler
// =====================================================================

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

      const { handle, isPty } = spawnProcess(cmd, args, cwd);

      // entry を先に作り broadcast を定義する
      const entry = {
        handle, isPty,
        clients, label: label || cmd, cmd, args, cwd,
        startedAt: Date.now(),
        exitCode: null,
        buffer,
      };

      const broadcast = (type, data) => {
        const item = { type, data, ts: Date.now() };
        buffer.push(item);
        if (buffer.length > LOG_BUFFER_MAX) buffer.shift();
        const msg = `data: ${JSON.stringify(item)}\n\n`;
        clients.forEach(c => c.write(msg));
      };

      // ★ イベントリスナーを processes.set より前に登録する
      //    即終了コマンド(ls/dir等)がリスナー登録前に exit しても取りこぼさない
      if (isPty) {
        handle.on('data', chunk => broadcast('stdout', cleanOutput(chunk)));
        handle.on('exit', (code) => {
          entry.exitCode = (code != null) ? code : 0;
          broadcast('exit', `Process exited (code: ${entry.exitCode})`);
        });
      } else {
        handle.stdout.on('data', chunk => broadcast('stdout', chunk.toString()));
        handle.stderr.on('data', chunk => broadcast('stderr', chunk.toString()));
        handle.on('close', code => {
          entry.exitCode = code;
          broadcast('exit', `Process exited (code: ${code})`);
        });
        handle.on('error', err => broadcast('stderr', `Launch error: ${err.message}`));
      }

      processes.set(id, entry);  // リスナー登録後にマップへ追加

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, pty: isPty }));
    });
  }

  // POST /api/process/input  { id, text }
  if (pathname === '/api/process/input' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
      const { id, text } = parsed;
      const entry = processes.get(id);

      res.writeHead(200, { 'Content-Type': 'application/json' });

      if (!entry || entry.exitCode !== null) {
        return res.end(JSON.stringify({ ok: false, error: 'Process not running' }));
      }

      try {
        if (entry.isPty) {
          entry.handle.write(text);
        } else {
          entry.handle.stdin.write(text);
        }
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  }

  // GET /api/process/log?id=1
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
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
      const { id } = parsed;
      const entry  = processes.get(id);
      if (entry && entry.exitCode === null) {
        try {
          if (entry.isPty) {
            // PTY: SIGINT first (Ctrl+C), then force kill after 2s
            entry.handle.write('\x03');
            setTimeout(() => {
              if (entry.exitCode === null) entry.handle.kill();
            }, 2000);
          } else {
            if (process.platform === 'win32') {
              // Windows pipe: taskkill でプロセスツリーごと終了
              const { execFile } = require('child_process');
              execFile('taskkill', ['/PID', String(entry.handle.pid), '/T', '/F'], () => {});
            } else {
              entry.handle.kill('SIGINT');
              setTimeout(() => {
                if (entry.exitCode === null) entry.handle.kill('SIGKILL');
              }, 2000);
            }
          }
        } catch (_) {}
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  // POST /api/process/remove  { id }
  if (pathname === '/api/process/remove' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
      const { id } = parsed;
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
      pty:       e.isPty,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(list));
  }

  res.writeHead(404);
  res.end('Not found');
}

const MAX_BODY = 1 * 1024 * 1024; // 1MB
function readBody(req, cb) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY) req.destroy();
  });
  req.on('end', () => cb(body));
}

module.exports = { handleProcess };
