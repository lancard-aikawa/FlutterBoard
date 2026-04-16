const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { connectVMService, parseVMEvent } = require('./vmService');
const { appendCmdHistory } = require('./cmdHistory');

// =====================================================================
// プロセスメタ永続化（サーバー再起動後のカード復元用）
// =====================================================================

const crypto     = require('crypto');
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const safeHash   = p => crypto.createHash('sha1').update(p || '').digest('hex').slice(0, 16);
const GLOBAL_PROCMETA_FILE = path.join(CONFIG_DIR, 'procmeta.json');

function procMetaFile(cwd) {
  return cwd ? path.join(CONFIG_DIR, `procmeta_${safeHash(cwd)}.json`) : GLOBAL_PROCMETA_FILE;
}
function loadProcMeta(cwd) {
  try { return JSON.parse(fs.readFileSync(procMetaFile(cwd), 'utf8')); } catch { return []; }
}
function samePath(a, b) {
  const na = path.normalize(a || '');
  const nb = path.normalize(b || '');
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}
function saveProcMetaEntry(id, entry) {
  const meta = loadProcMeta(entry.cwd);
  const rec  = { id, label: entry.label, cmd: entry.cmd, cwd: entry.cwd,
                 startedAt: entry.startedAt, exitCode: entry.exitCode };
  const idx  = meta.findIndex(m => m.id === id);
  if (idx >= 0) meta[idx] = rec; else meta.push(rec);
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(procMetaFile(entry.cwd), JSON.stringify(meta.slice(-50), null, 2));
  } catch (_) {}
}

function removeProcMetaEntry(id, cwd = null) {
  const meta = loadProcMeta(cwd).filter(m => m.id !== id);
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(procMetaFile(cwd), JSON.stringify(meta, null, 2));
  } catch (_) {}
}

// Try to load node-pty; fall back to child_process.spawn if unavailable
let pty = null;
try {
  pty = require('node-pty');
  console.log('[processManager] node-pty loaded — PTY mode enabled');
} catch (_) {
  console.warn('[processManager] node-pty not available — falling back to pipe mode');
}

const LOG_BUFFER_MAX = 2000;

// URL detection patterns for `flutter run` output
const DEVTOOLS_URL_RE   = /https?:\/\/[\w.:-]+\?uri=\S+/;
const VM_SERVICE_URL_RE = /https?:\/\/[\w.:-]+\/[\w+/=%-]+=\//;

// processes: Map<id, { pty|proc, isPty, clients, label, cmd, args, cwd, startedAt, exitCode, buffer, devToolsUrl, vmServiceUrl }>
const processes = new Map();
let nextId = 1;

// =====================================================================
// ANSI / control-character cleaner for plain-text log display
// =====================================================================

const ANSI_RE = /\x1b(?:\[[0-9;?]*[A-Za-z]|\][^\x07]*(?:\x07|\x1b\\)|[()][0-9A-Za-z]|.)/g;

function cleanOutput(str) {
  str = str.replace(ANSI_RE, '');   // strip ANSI escape sequences
  str = str.replace(/\r\n/g, '\n'); // normalize CRLF
  // Bare CR = "return to line start and overwrite" (spinner / progress bar).
  // Keep only the last segment after the final \r on each line.
  str = str.split('\n').map(line => {
    const parts = line.split('\r');
    return parts[parts.length - 1];
  }).join('\n');
  return str;
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
// Force-exit helper — exitCode を強制セットして SSE クライアントへ通知
// exit イベントが発火しない場合（Windows PTY など）のフォールバック用
// =====================================================================

function forceExit(entry) {
  if (entry.exitCode !== null) return;
  entry.exitCode = -1;
  const item = { type: 'exit', data: 'Process force-killed (code: -1)', ts: Date.now() };
  entry.buffer.push(item);
  if (entry.buffer.length > LOG_BUFFER_MAX) entry.buffer.shift();
  const msg = `data: ${JSON.stringify(item)}\n\n`;
  entry.clients.forEach(c => { try { c.write(msg); } catch (_) {} });
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
        devToolsUrl:  null,
        vmServiceUrl: null,
      };

      const broadcast = (type, data) => {
        const item = { type, data, ts: Date.now() };

        // Detect Flutter DevTools / VM Service URLs from log output
        if (data && (type === 'stdout' || type === 'stderr')) {
          if (!entry.devToolsUrl) {
            const m = data.match(DEVTOOLS_URL_RE);
            if (m) entry.devToolsUrl = m[0].trim();
          }
          if (!entry.vmServiceUrl) {
            const m = data.match(VM_SERVICE_URL_RE);
            if (m) entry.vmServiceUrl = m[0].trim();
          }
        }

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
          saveProcMetaEntry(id, entry);
          appendCmdHistory(entry);
        });
      } else {
        handle.stdout.on('data', chunk => broadcast('stdout', chunk.toString()));
        handle.stderr.on('data', chunk => broadcast('stderr', chunk.toString()));
        handle.on('close', code => {
          entry.exitCode = code;
          broadcast('exit', `Process exited (code: ${code})`);
          saveProcMetaEntry(id, entry);
          appendCmdHistory(entry);
        });
        handle.on('error', err => broadcast('stderr', `Launch error: ${err.message}`));
      }

      processes.set(id, entry);  // リスナー登録後にマップへ追加
      saveProcMetaEntry(id, entry);

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
      if (entry.isVm) {
        return res.end(JSON.stringify({ ok: false, error: 'VM attach process has no stdin' }));
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
          if (entry.isVm) {
            // VM Service attach プロセス: WebSocket を閉じて終了
            if (entry.wsConn) entry.wsConn.close();
            setTimeout(() => { forceExit(entry); }, 500);
          } else if (entry.isPty) {
            // 1. Ctrl+C: flutter run など対話プロセスの正常終了を試みる
            entry.handle.write('\x03');
            // Windows: flutter は flutter.bat (バッチファイル) のため Ctrl+C 後に
            //   "バッチ ジョブを終了しますか (Y/N)?" プロンプトが出て cmd.exe が停止する。
            //   200ms 後に Y を自動送信してプロンプトを解除する。
            if (process.platform === 'win32') {
              setTimeout(() => { try { entry.handle.write('Y\r\n'); } catch (_) {} }, 200);
            }
            // 2. 2s 後: PTY プロセスを強制終了
            //    Windows: handle.kill() は内部の Promise callback で uncaught exception を
            //    投げる既知バグがあるため使用しない。taskkill /T /F のみで終了する。
            //    Y で cmd.exe を抜けても dart.exe が残る場合もここで確実に終了。
            //    非 Windows: handle.kill() で PTY に SIGTERM を送る。
            setTimeout(() => {
              if (entry.exitCode === null) {
                if (process.platform === 'win32') {
                  if (entry.handle.pid) {
                    const { execFile } = require('child_process');
                    execFile('taskkill', ['/PID', String(entry.handle.pid), '/T', '/F'], () => {});
                  }
                } else {
                  try { entry.handle.kill(); } catch (_) {}
                }
              }
            }, 2000);
            // 3. 3.5s 後: exit イベントが発火しない場合（node-pty の Windows 既知問題）は
            //    強制的に exitCode をセットして UI を更新させる
            setTimeout(() => { forceExit(entry); }, 3500);
          } else {
            if (process.platform === 'win32') {
              // Windows pipe: taskkill でプロセスツリーごと終了
              const { execFile } = require('child_process');
              execFile('taskkill', ['/PID', String(entry.handle.pid), '/T', '/F'], () => {});
              setTimeout(() => { forceExit(entry); }, 2000);
            } else {
              entry.handle.kill('SIGINT');
              setTimeout(() => {
                if (entry.exitCode === null) entry.handle.kill('SIGKILL');
                setTimeout(() => { forceExit(entry); }, 1000);
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
      const { id, cwd: bodyCwd } = parsed;
      const entry = processes.get(id);
      processes.delete(id);
      removeProcMetaEntry(id, entry?.cwd ?? bodyCwd ?? null);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  // GET /api/process/list
  if (pathname === '/api/process/list' && req.method === 'GET') {
    const requestedPath = url.searchParams.get('path');
    const list = [...processes.entries()]
      .filter(([, e]) => !requestedPath || e.isLogFile || samePath(e.cwd, requestedPath))
      .map(([id, e]) => ({
        id, label: e.label, cmd: e.cmd,
        cwd:          e.cwd || null,
        startedAt:    e.startedAt,
        running:      e.exitCode === null,
        exitCode:     e.exitCode,
        pty:          e.isPty,
        vm:           e.isVm      || false,
        logFile:      e.isLogFile || false,
        devToolsUrl:  e.devToolsUrl  || null,
        vmServiceUrl: e.vmServiceUrl || null,
      }));

    if (requestedPath) {
      const seen = new Set(list.map(item => item.id));
      loadProcMeta(requestedPath).forEach(m => {
        if (seen.has(m.id)) return;
        list.push({
          id: m.id, label: m.label, cmd: m.cmd,
          cwd: m.cwd || requestedPath,
          startedAt: m.startedAt, running: false,
          exitCode: m.exitCode, pty: false, vm: false,
          devToolsUrl: null, vmServiceUrl: null,
          ghost: true,
        });
      });
    } else if (processes.size === 0) {
      const ghosts = loadProcMeta().map(m => ({
        id: m.id, label: m.label, cmd: m.cmd,
        cwd: m.cwd || null,
        startedAt: m.startedAt, running: false,
        exitCode: m.exitCode, pty: false, vm: false,
        devToolsUrl: null, vmServiceUrl: null,
        ghost: true,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(ghosts));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(list));
  }

  // POST /api/process/attach-vm  { label, vmUrl }
  // Dart VM Service WebSocket に接続し、ログをキャプチャするプロセスエントリを作成する
  if (pathname === '/api/process/attach-vm' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
      const { label, vmUrl, cwd = null } = parsed;
      if (!vmUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'vmUrl required' }));
      }

      const id      = nextId++;
      const clients = new Set();
      const buffer  = [];

      const broadcast = (type, data) => {
        const item = { type, data, ts: Date.now() };
        buffer.push(item);
        if (buffer.length > LOG_BUFFER_MAX) buffer.shift();
        const msg = `data: ${JSON.stringify(item)}\n\n`;
        clients.forEach(c => { try { c.write(msg); } catch (_) {} });
      };

      const entry = {
        handle: null, isPty: false, isVm: true,
        wsConn: null,
        clients, label: label || `VM:${vmUrl}`, cmd: 'vm-attach', args: [], cwd,
        startedAt:    Date.now(),
        exitCode:     null,
        buffer,
        devToolsUrl:  null,
        vmServiceUrl: vmUrl,
        isolateId:      null,  // V2: populated by getVM response
        rpcId:          10,    // V2: RPC ID counter (1-2 used by streamListen, 3 by getVM)
        pendingActions: {},    // V2: rpcId -> 'reload'|'restart' で応答を識別
      };

      let responded = false;

      // 5s 以内に接続できなければタイムアウト
      const timer = setTimeout(() => {
        if (responded) return;
        responded = true;
        entry._earlyClose?.close();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Connection timeout (5s)' }));
      }, 5000);

      entry._earlyClose = connectVMService(vmUrl, {
        onOpen(ws) {
          entry.wsConn = ws;
          processes.set(id, entry);
          saveProcMetaEntry(id, entry);
          // V2: アイソレート ID を取得（Hot Reload/Restart RPC に使用）
          ws.send({ jsonrpc: '2.0', id: 3, method: 'getVM', params: {} });
          clearTimeout(timer);
          if (responded) return;
          responded = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, id }));
          broadcast('stdout', `[FlutterBoard] VM Service 接続: ${vmUrl}\n`);
        },
        onMessage(json) {
          const ev = parseVMEvent(json);
          if (ev) { broadcast(ev.type, ev.text); return; }
          // V2: RPC レスポンスを処理
          let msg;
          try { msg = JSON.parse(json); } catch { return; }

          if (msg.id === 3 && msg.result?.isolates) {
            // getVM レスポンス — 最初のアイソレート ID を保存
            entry.isolateId = msg.result.isolates[0]?.id || null;
            return;
          }

          // reload / restart の応答を ID で識別
          const action = entry.pendingActions[msg.id];
          if (action) {
            delete entry.pendingActions[msg.id];
            if (msg.error) {
              const label = action === 'reload' ? 'Hot Reload' : 'Hot Restart';
              const isUnknown = msg.error.message?.includes('Unknown method');
              if (action === 'restart' && isUnknown) {
                broadcast('stderr', `[FlutterBoard] Hot Restart: web ターゲットは VM Service 経由で非対応です。PTY 起動 → R キーを使用してください。\n`);
              } else {
                broadcast('stderr', `[FlutterBoard] ${label} エラー: ${msg.error.message}\n`);
              }
              return;
            }
            if (action === 'reload') {
              const ok = msg.result?.success;
              if (ok) {
                broadcast('stdout', '[FlutterBoard] Hot Reload: 成功 ✓\n');
              } else {
                // notices に失敗理由が入っている
                const details = (msg.result?.notices || []).map(n => n.message).filter(Boolean).join('\n');
                broadcast('stderr', `[FlutterBoard] Hot Reload: 失敗 ✗${details ? '\n' + details : ''}\n`);
              }
            } else {
              // ext.flutter.reassemble はエラーがなければ成功
              broadcast('stdout', '[FlutterBoard] Hot Restart: 完了 ✓\n');
            }
          }
        },
        onClose() {
          clearTimeout(timer);
          if (!responded) {
            responded = true;
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'VM Service connection failed' }));
            return;
          }
          if (entry.exitCode === null) {
            entry.exitCode = 0;
            broadcast('exit', '[FlutterBoard] VM Service との接続が切断されました\n');
            saveProcMetaEntry(id, entry);
          }
        },
      });
    });
  }

  // POST /api/process/vm-action  { id, action: 'reload'|'restart' }
  // V2: VM Service 経由で Hot Reload / Hot Restart を実行する
  if (pathname === '/api/process/vm-action' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
      const { id, action } = parsed;
      const entry = processes.get(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (!entry || !entry.isVm || !entry.wsConn || entry.exitCode !== null) {
        return res.end(JSON.stringify({ ok: false, error: 'No active VM connection' }));
      }
      if (!entry.isolateId) {
        return res.end(JSON.stringify({ ok: false, error: 'Isolate ID not yet available — retry' }));
      }
      const rpcId = entry.rpcId++;
      if (action === 'reload') {
        entry.pendingActions[rpcId] = 'reload';
        entry.wsConn.send({
          jsonrpc: '2.0', id: rpcId, method: 'reloadSources',
          params: { isolateId: entry.isolateId, pause: false },
        });
      } else if (action === 'restart') {
        entry.pendingActions[rpcId] = 'restart';
        // flutter tools / DWDS が registerService で登録する hotRestart を直接呼ぶ
        // isolateId 不要（VM レベルのサービス）
        entry.wsConn.send({
          jsonrpc: '2.0', id: rpcId, method: 'hotRestart', params: {},
        });
      } else {
        return res.end(JSON.stringify({ ok: false, error: 'Unknown action' }));
      }
      return res.end(JSON.stringify({ ok: true }));
    });
  }

  // POST /api/process/open-log  { filename, content }
  // クライアントが読んだログファイルの内容を受け取って仮想プロセスエントリを作成する
  if (pathname === '/api/process/open-log' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
      const { filename, content } = parsed;
      if (!filename || content == null) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'filename and content required' }));
      }

      const lines  = content.split('\n');
      const baseTs = Date.now();
      const buffer = lines
        .filter(l => l.length > 0)
        .map((l, i) => ({ type: 'stdout', data: l + '\n', ts: baseTs + i }));

      const id    = nextId++;
      const entry = {
        handle: null, isPty: false, isVm: false, isLogFile: true,
        clients: new Set(),
        label: filename, cmd: filename, args: [], cwd: null,
        startedAt: baseTs,
        exitCode:  0,
        buffer,
        devToolsUrl: null, vmServiceUrl: null,
      };
      processes.set(id, entry);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, lines: buffer.length }));
    });
  }

  // GET /api/process/scan-vm
  // V3: Dart が書き込むサービスファイルを走査して実行中の VM Service URL を返す
  if (pathname === '/api/process/scan-vm' && req.method === 'GET') {
    const os   = require('os');
    const fs   = require('fs');
    const path = require('path');
    const results = [];
    try {
      const tmpDir = os.tmpdir();
      const files  = fs.readdirSync(tmpDir).filter(f => /^dart[-_]vm[-_]service.*\.json$/i.test(f) || /^dart-service.*\.json$/i.test(f));
      for (const file of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(tmpDir, file), 'utf8'));
          if (content.uri) results.push({ uri: content.uri, name: content.name || file });
        } catch { /* skip unreadable / invalid files */ }
      }
    } catch { /* tmpdir 読み取り失敗は無視 */ }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(results));
  }

  // GET /api/process/combined-log — 全プロセスのバッファをタイムスタンプ順で返す
  if (pathname === '/api/process/combined-log' && req.method === 'GET') {
    const entries = [];
    processes.forEach((e, id) => {
      e.buffer.forEach(item => {
        entries.push({ id, label: e.label, running: e.exitCode === null, ...item });
      });
    });
    entries.sort((a, b) => a.ts - b.ts);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(entries));
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
