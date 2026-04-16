'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const safeHash   = p => crypto.createHash('sha1').update(p || '').digest('hex').slice(0, 16);

function histFile(cwd) { return path.join(CONFIG_DIR, `history_${safeHash(cwd)}.json`); }
function loadJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } }

// サーバー側から呼ばれる: プロセス終了時に履歴を追記
function appendCmdHistory(entry) {
  if (!entry.cwd || entry.cmd === 'vm-attach') return;
  const file    = histFile(entry.cwd);
  const hist    = loadJson(file);
  const fullCmd = entry.args && entry.args.length
    ? `${entry.cmd} ${entry.args.join(' ')}`
    : entry.cmd;

  // 同一 fullCmd は最新だけ残す（重複排除）
  const dedup = hist.filter(h => (h.fullCmd || h.cmd) !== fullCmd);
  dedup.push({
    label:    entry.label,
    cmd:      entry.cmd,
    fullCmd,
    cwd:      entry.cwd,
    startedAt: entry.startedAt,
    exitCode:  entry.exitCode,
    endedAt:   Date.now(),
  });

  // 最大 100 件
  try { fs.writeFileSync(file, JSON.stringify(dedup.slice(-100))); } catch (_) {}
}

async function handleCmdHistory(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;
  const cwd = url.searchParams.get('path');

  // GET /api/history/list?path=<dir>
  if (pathname === '/api/history/list' && req.method === 'GET') {
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const hist = loadJson(histFile(cwd)).reverse().slice(0, 50); // 新しい順
    res.writeHead(200);
    return res.end(JSON.stringify(hist));
  }

  // DELETE /api/history/clear?path=<dir>
  if (pathname === '/api/history/clear' && req.method === 'DELETE') {
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    try { fs.writeFileSync(histFile(cwd), '[]'); } catch (_) {}
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleCmdHistory, appendCmdHistory };
