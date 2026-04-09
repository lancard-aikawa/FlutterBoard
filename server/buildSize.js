'use strict';
const fs   = require('fs');
const path = require('path');
const { hashPath } = require('./projectInfo');

function getHistoryFile(projectPath) {
  return path.join(__dirname, '..', 'config', `buildsize_${hashPath(projectPath)}.json`);
}

function loadHistory(projectPath) {
  try { return JSON.parse(fs.readFileSync(getHistoryFile(projectPath), 'utf-8')); }
  catch { return []; }
}

function saveHistory(projectPath, history) {
  const file = getHistoryFile(projectPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(history, null, 2), 'utf-8');
}

// ── ファイルスキャン ──────────────────────────────────────────────────────────

// 指定ディレクトリを最大 depth まで再帰してマッチする拡張子のファイルを返す
function findFiles(dir, exts, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  const results = [];
  try {
    fs.readdirSync(dir).forEach(name => {
      const full = path.join(dir, name);
      let stat;
      try { stat = fs.statSync(full); } catch { return; }
      if (stat.isDirectory()) {
        results.push(...findFiles(full, exts, maxDepth, depth + 1));
      } else if (exts.some(e => name.endsWith(e))) {
        results.push({ full, size: stat.size });
      }
    });
  } catch {}
  return results;
}

// build/web/ ディレクトリ全体のサイズ
function getDirSize(dir) {
  let total = 0;
  try {
    fs.readdirSync(dir).forEach(name => {
      const full = path.join(dir, name);
      let stat;
      try { stat = fs.statSync(full); } catch { return; }
      total += stat.isDirectory() ? getDirSize(full) : stat.size;
    });
  } catch {}
  return total;
}

function scanArtifacts(projectPath) {
  const buildDir = path.join(projectPath, 'build');
  if (!fs.existsSync(buildDir)) return [];

  const results = [];

  // APK / AAB
  const apkDir = path.join(buildDir, 'app', 'outputs');
  if (fs.existsSync(apkDir)) {
    findFiles(apkDir, ['.apk', '.aab'], 3).forEach(({ full, size }) => {
      const rel  = path.relative(projectPath, full).replace(/\\/g, '/');
      const name = path.basename(full);
      const type = path.extname(full).slice(1).toUpperCase();
      results.push({ path: rel, name, type, size });
    });
  }

  // IPA (iOS)
  const iosDir = path.join(buildDir, 'ios');
  if (fs.existsSync(iosDir)) {
    findFiles(iosDir, ['.ipa'], 4).forEach(({ full, size }) => {
      const rel  = path.relative(projectPath, full).replace(/\\/g, '/');
      results.push({ path: rel, name: path.basename(full), type: 'IPA', size });
    });
  }

  // Web（ディレクトリ全体のサイズ）
  const webDir = path.join(buildDir, 'web');
  if (fs.existsSync(webDir)) {
    const size = getDirSize(webDir);
    if (size > 0) results.push({ path: 'build/web', name: 'web (total)', type: 'WEB', size });
  }

  // Windows EXE
  const winDir = path.join(buildDir, 'windows');
  if (fs.existsSync(winDir)) {
    findFiles(winDir, ['.exe'], 4).forEach(({ full, size }) => {
      const rel = path.relative(projectPath, full).replace(/\\/g, '/');
      results.push({ path: rel, name: path.basename(full), type: 'EXE', size });
    });
  }

  return results;
}

// ── ハンドラ ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

async function handleBuildSize(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/buildsize/scan?path=...
  if (pathname === '/api/buildsize/scan' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p || !fs.existsSync(p)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path required' }));
    }
    const artifacts = scanArtifacts(p);
    res.writeHead(200);
    return res.end(JSON.stringify({ artifacts }));
  }

  // GET /api/buildsize/history?path=...
  if (pathname === '/api/buildsize/history' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p || !fs.existsSync(p)) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    res.writeHead(200);
    return res.end(JSON.stringify({ history: loadHistory(p) }));
  }

  // POST /api/buildsize/record  { path, label, artifacts }
  if (pathname === '/api/buildsize/record' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, label, artifacts } = body;
    if (!p || !artifacts) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and artifacts required' }));
    }
    const history = loadHistory(p);
    history.unshift({ timestamp: Date.now(), label: label || '', artifacts });
    if (history.length > 50) history.length = 50;
    saveHistory(p, history);
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true, history }));
  }

  // POST /api/buildsize/delete  { path, index }
  if (pathname === '/api/buildsize/delete' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, index } = body;
    const history = loadHistory(p || '');
    if (!p || typeof index !== 'number' || index < 0 || index >= history.length) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and valid index required' }));
    }
    history.splice(index, 1);
    saveHistory(p, history);
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true, history }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleBuildSize };
