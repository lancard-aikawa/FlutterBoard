'use strict';
const fs   = require('fs');
const path = require('path');

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

function findGradleFile(projectPath) {
  const kts = path.join(projectPath, 'android', 'app', 'build.gradle.kts');
  const gvy = path.join(projectPath, 'android', 'app', 'build.gradle');
  if (fs.existsSync(kts)) return kts;
  if (fs.existsSync(gvy)) return gvy;
  return null;
}

async function handleAndroidConfig(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/android/gradle?path=...
  if (pathname === '/api/android/gradle' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const file = findGradleFile(p);
    if (!file) { res.writeHead(404); return res.end(JSON.stringify({ error: 'build.gradle が見つかりません' })); }
    const content = fs.readFileSync(file, 'utf-8');
    const appIdM  = content.match(/applicationId\s*=?\s*"([^"]+)"/);
    res.writeHead(200);
    return res.end(JSON.stringify({
      file:          path.relative(p, file).replace(/\\/g, '/'),
      content,
      applicationId: appIdM ? appIdM[1] : null,
    }));
  }

  // POST /api/android/gradle  { path, content }
  if (pathname === '/api/android/gradle' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, content } = body;
    if (!p || content == null) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path と content が必要です' })); }
    const file = findGradleFile(p);
    if (!file) { res.writeHead(404); return res.end(JSON.stringify({ error: 'build.gradle が見つかりません' })); }
    fs.writeFileSync(file, content, 'utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }

  // GET /api/android/keyprops?path=...
  if (pathname === '/api/android/keyprops' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const file = path.join(p, 'android', 'key.properties');
    if (!fs.existsSync(file)) {
      res.writeHead(200);
      return res.end(JSON.stringify({ exists: false, content: '' }));
    }
    res.writeHead(200);
    return res.end(JSON.stringify({ exists: true, content: fs.readFileSync(file, 'utf-8') }));
  }

  // POST /api/android/keyprops  { path, content }
  if (pathname === '/api/android/keyprops' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, content } = body;
    if (!p || content == null) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path と content が必要です' })); }
    const dir  = path.join(p, 'android');
    const file = path.join(dir, 'key.properties');
    if (!fs.existsSync(dir)) { res.writeHead(400); return res.end(JSON.stringify({ error: 'android/ ディレクトリが存在しません' })); }
    fs.writeFileSync(file, content, 'utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleAndroidConfig };
