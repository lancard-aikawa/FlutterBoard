'use strict';
const fs   = require('fs');
const path = require('path');

const SNAPSHOT_DIR = 'emu-snapshots';

function getSnapshotRoot(projectPath) {
  return path.join(projectPath, SNAPSHOT_DIR);
}

// スナップショット名の安全性チェック（パストラバーサル防止）
function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 && !/[/\\<>:"|?*\x00-\x1f]/.test(name);
}

function listSnapshots(projectPath) {
  const root = getSnapshotRoot(projectPath);
  if (!fs.existsSync(root)) return [];
  try {
    return fs.readdirSync(root)
      .filter(name => {
        try { return fs.statSync(path.join(root, name)).isDirectory(); }
        catch { return false; }
      })
      .map(name => {
        const dirPath = path.join(root, name);
        const stat    = fs.statSync(dirPath);
        let fileCount = 0;
        try { fileCount = fs.readdirSync(dirPath).length; } catch {}
        return { name, mtime: stat.mtimeMs, fileCount };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return []; }
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

async function handleEmuSnapshot(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/emusnapshot/list?path=...
  if (pathname === '/api/emusnapshot/list' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p || !fs.existsSync(p)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path required' }));
    }
    res.writeHead(200);
    return res.end(JSON.stringify({ snapshots: listSnapshots(p) }));
  }

  // POST /api/emusnapshot/delete  { path, name }
  if (pathname === '/api/emusnapshot/delete' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, name } = body;

    if (!p || !isSafeName(name)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and valid name required' }));
    }

    const target = path.join(getSnapshotRoot(p), name);
    // 削除対象がスナップショットルート配下にあることを確認
    if (!target.startsWith(getSnapshotRoot(p) + path.sep)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'invalid snapshot name' }));
    }

    if (!fs.existsSync(target)) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'snapshot not found' }));
    }

    fs.rmSync(target, { recursive: true, force: true });
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true, snapshots: listSnapshots(p) }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleEmuSnapshot };
