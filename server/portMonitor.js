'use strict';
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ── 監視ポート設定 ─────────────────────────────────────────────────────────────
const CONFIG_FILE = path.join(__dirname, '..', 'config', 'ports_watched.json');

// Flutter / Firebase 開発でよく使うポートをデフォルトに
const DEFAULT_PORTS = [3210, 4000, 5000, 5001, 8080, 8085, 9099, 9199, 9150, 9299];

function loadWatched() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
  catch { return [...DEFAULT_PORTS]; }
}

function saveWatched(ports) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(ports), 'utf-8');
}

// ── OS 判別 ──────────────────────────────────────────────────────────────────
const IS_WIN = process.platform === 'win32';

function run(cmd, args, timeout = 8000) {
  return new Promise(resolve => {
    execFile(cmd, args, { shell: IS_WIN, encoding: 'utf-8', timeout },
      (err, stdout) => resolve(err ? '' : stdout));
  });
}

// ── Windows: netstat -ano + tasklist + wmic ───────────────────────────────────

async function getListeningWin() {
  const [netOut, taskOut, wmicOut] = await Promise.all([
    run('netstat', ['-ano']),
    run('tasklist', ['/FO', 'CSV', '/NH']),
    run('wmic', ['process', 'get', 'ProcessId,CommandLine', '/FORMAT:LIST'], 15000),
  ]);

  // PID → name map (tasklist: 高速・確実)
  const pidName = {};
  taskOut.split('\n').forEach(line => {
    // "chrome.exe","12345","Console","1","100,000 K"
    const m = line.match(/^"([^"]+)","(\d+)"/);
    if (m) pidName[parseInt(m[2])] = m[1];
  });

  // PID → cmdline map (wmic LIST形式: CommandLine= → ProcessId= の順で出力)
  const pidCmdline = {};
  let curCmd = null;
  wmicOut.replace(/\0/g, '').split('\n').forEach(rawLine => {
    const line = rawLine.trimEnd();
    if (line.startsWith('CommandLine=')) {
      curCmd = line.slice(12);
    } else if (line.startsWith('ProcessId=')) {
      const pid = parseInt(line.slice(10));
      if (pid && curCmd !== null) pidCmdline[pid] = curCmd;
      curCmd = null;
    }
  });

  const result = {};
  netOut.split('\n').forEach(line => {
    // TCP    0.0.0.0:3210    0.0.0.0:0    LISTENING    12345
    const m = line.match(/(TCP|UDP)\s+[\d.*]+:(\d+)\s+[\S]+\s+(LISTENING|\*:\*)\s+(\d+)/i);
    if (!m) return;
    const port = parseInt(m[2]);
    const pid  = parseInt(m[4]);
    if (!result[port]) {
      result[port] = { proto: m[1].toUpperCase(), pid, name: pidName[pid] || '', cmdline: pidCmdline[pid] || '' };
    }
  });

  return result;  // { port: { proto, pid, name, cmdline } }
}

// ── Unix: ss -tlnp ────────────────────────────────────────────────────────────

async function getListeningUnix() {
  const [ssOut, psOut] = await Promise.all([
    run('ss', ['-tlnp']),
    run('ps', ['-eo', 'pid=,args=']),
  ]);

  // PID → cmdline map
  const pidCmdline = {};
  psOut.split('\n').forEach(line => {
    const m = line.match(/^\s*(\d+)\s+(.*)/);
    if (m) pidCmdline[parseInt(m[1])] = m[2].trim();
  });

  // fallback: lsof
  if (!ssOut.trim()) {
    const lsofOut = await run('lsof', ['-i', '-P', '-n', '-s', 'TCP:LISTEN']);
    return parseLsof(lsofOut, pidCmdline);
  }
  return parseSs(ssOut, pidCmdline);
}

function parseSs(out, pidCmdline = {}) {
  const result = {};
  out.split('\n').forEach(line => {
    // LISTEN 0  128  0.0.0.0:22  0.0.0.0:*  users:(("sshd",pid=1234,fd=3))
    const m = line.match(/LISTEN\s+\d+\s+\d+\s+[\S]+:(\d+)\s+\S+\s+users:\(\("([^"]+)",pid=(\d+)/);
    if (!m) return;
    const port = parseInt(m[1]);
    const pid  = parseInt(m[3]);
    if (!result[port]) result[port] = { proto: 'TCP', pid, name: m[2], cmdline: pidCmdline[pid] || '' };
  });
  return result;
}

function parseLsof(out, pidCmdline = {}) {
  const result = {};
  out.split('\n').forEach(line => {
    // COMMAND  PID  USER   FD  TYPE ...  TCP *:3210 (LISTEN)
    const m = line.match(/^(\S+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+TCP\s+\S+:(\d+)\s+\(LISTEN\)/);
    if (!m) return;
    const port = parseInt(m[3]);
    const pid  = parseInt(m[2]);
    if (!result[port]) result[port] = { proto: 'TCP', pid, name: m[1], cmdline: pidCmdline[pid] || '' };
  });
  return result;
}

// ── 統合: 監視ポートに使用状況を付与 ─────────────────────────────────────────

async function checkPorts(ports) {
  const listening = IS_WIN ? await getListeningWin() : await getListeningUnix();
  return ports.map(port => {
    const info = listening[port];
    return info
      ? { port, status: 'listening', proto: info.proto, pid: info.pid, name: info.name, cmdline: info.cmdline || '' }
      : { port, status: 'free',      proto: '',          pid: null,    name: '',         cmdline: '' };
  });
}

// ── Kill ──────────────────────────────────────────────────────────────────────

async function killPid(pid) {
  if (IS_WIN) {
    return run('taskkill', ['/PID', String(pid), '/T', '/F']);
  } else {
    return run('kill', ['-9', String(pid)]);
  }
}

// ── ハンドラ ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

async function handlePortMonitor(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/ports/status — 監視ポートの状態を返す
  if (pathname === '/api/ports/status' && req.method === 'GET') {
    const watched = loadWatched();
    const results = await checkPorts(watched);
    res.writeHead(200);
    return res.end(JSON.stringify({ ports: results, watched }));
  }

  // GET /api/ports/watched — 監視ポート一覧
  if (pathname === '/api/ports/watched' && req.method === 'GET') {
    res.writeHead(200);
    return res.end(JSON.stringify({ watched: loadWatched() }));
  }

  // POST /api/ports/watched — 監視ポートを更新 { ports: [number,...] }
  if (pathname === '/api/ports/watched' && req.method === 'POST') {
    const body = await readBody(req);
    const ports = (body.ports || []).map(Number).filter(n => n > 0 && n <= 65535);
    saveWatched(ports);
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true, watched: ports }));
  }

  // POST /api/ports/kill — プロセスを kill { pid: number }
  if (pathname === '/api/ports/kill' && req.method === 'POST') {
    const body = await readBody(req);
    const pid  = parseInt(body.pid);
    if (!pid || pid <= 0) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'pid required' }));
    }
    await killPid(pid);
    // 少し待ってから状態を再確認して返す
    await new Promise(r => setTimeout(r, 600));
    const watched = loadWatched();
    const results = await checkPorts(watched);
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true, ports: results }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handlePortMonitor };
