'use strict';
/*
 * D4: 配布 URL / テスター管理
 *
 * プロジェクト別に以下を config/ 以下の JSON で永続化する。
 *   config/dist_<hash>.json  — リリース記録（url / title / note / createdAt）
 *   config/testers_<hash>.json — テスター一覧（name / email / device / note）
 */

const fs   = require('fs');
const path = require('path');

const { hashPath } = require('./projectInfo');

const CONFIG_DIR = path.resolve(__dirname, '..', 'config');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function distFile(projectPath)    { return path.join(CONFIG_DIR, `dist_${hashPath(projectPath)}.json`); }
function testersFile(projectPath) { return path.join(CONFIG_DIR, `testers_${hashPath(projectPath)}.json`); }

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}

function saveJson(file, data) {
  ensureConfigDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 64 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

// -----------------------------------------------------------------------
// リリース CRUD
// -----------------------------------------------------------------------

function listReleases(projectPath) {
  return loadJson(distFile(projectPath));
}

function addRelease(projectPath, { title, url, note }) {
  const releases = loadJson(distFile(projectPath));
  const entry = {
    id:        Date.now().toString(36),
    title:     (title  || '').trim(),
    url:       (url    || '').trim(),
    note:      (note   || '').trim(),
    createdAt: new Date().toISOString(),
  };
  if (!entry.title && !entry.url) return { error: 'title または url が必要です' };
  releases.unshift(entry);
  saveJson(distFile(projectPath), releases);
  return { ok: true, entry };
}

function deleteRelease(projectPath, id) {
  const releases = loadJson(distFile(projectPath));
  const next = releases.filter(r => r.id !== id);
  if (next.length === releases.length) return { error: '該当エントリが見つかりません' };
  saveJson(distFile(projectPath), next);
  return { ok: true };
}

// -----------------------------------------------------------------------
// テスター CRUD
// -----------------------------------------------------------------------

function listTesters(projectPath) {
  return loadJson(testersFile(projectPath));
}

function addTester(projectPath, { name, email, device, note }) {
  const testers = loadJson(testersFile(projectPath));
  const entry = {
    id:     Date.now().toString(36),
    name:   (name   || '').trim(),
    email:  (email  || '').trim(),
    device: (device || '').trim(),
    note:   (note   || '').trim(),
  };
  if (!entry.name && !entry.email) return { error: 'name または email が必要です' };
  testers.push(entry);
  saveJson(testersFile(projectPath), testers);
  return { ok: true, entry };
}

function deleteTester(projectPath, id) {
  const testers = loadJson(testersFile(projectPath));
  const next = testers.filter(t => t.id !== id);
  if (next.length === testers.length) return { error: '該当テスターが見つかりません' };
  saveJson(testersFile(projectPath), next);
  return { ok: true };
}

// -----------------------------------------------------------------------
// ハンドラ
// -----------------------------------------------------------------------

async function handleDistributor(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  const p = url.searchParams.get('path');
  if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

  const { pathname } = url;
  const { method }   = req;

  // --- releases ---
  if (pathname === '/api/distributor/releases' && method === 'GET') {
    res.writeHead(200);
    return res.end(JSON.stringify({ releases: listReleases(p) }));
  }

  if (pathname === '/api/distributor/releases' && method === 'POST') {
    const body = await readBody(req);
    const result = addRelease(p, body);
    res.writeHead(result.error ? 400 : 200);
    return res.end(JSON.stringify(result));
  }

  if (pathname === '/api/distributor/releases/delete' && method === 'POST') {
    const body = await readBody(req);
    const result = deleteRelease(p, body.id);
    res.writeHead(result.error ? 404 : 200);
    return res.end(JSON.stringify(result));
  }

  // --- testers ---
  if (pathname === '/api/distributor/testers' && method === 'GET') {
    res.writeHead(200);
    return res.end(JSON.stringify({ testers: listTesters(p) }));
  }

  if (pathname === '/api/distributor/testers' && method === 'POST') {
    const body = await readBody(req);
    const result = addTester(p, body);
    res.writeHead(result.error ? 400 : 200);
    return res.end(JSON.stringify(result));
  }

  if (pathname === '/api/distributor/testers/delete' && method === 'POST') {
    const body = await readBody(req);
    const result = deleteTester(p, body.id);
    res.writeHead(result.error ? 404 : 200);
    return res.end(JSON.stringify(result));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleDistributor };
