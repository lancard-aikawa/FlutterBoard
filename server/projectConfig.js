'use strict';
const fs   = require('fs');
const path = require('path');
const { hashPath } = require('./projectInfo');

const CONFIG_DIR = path.join(__dirname, '..', 'config');

function configPath(projectPath) {
  return path.join(CONFIG_DIR, `project_${hashPath(projectPath)}.json`);
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

const DEFAULTS = { webPort: 8080 };

async function handleProjectConfig(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/project/config?path=
  if (pathname === '/api/project/config' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const cfgFile = configPath(p);
    const saved = fs.existsSync(cfgFile)
      ? JSON.parse(fs.readFileSync(cfgFile, 'utf-8'))
      : {};
    res.writeHead(200);
    return res.end(JSON.stringify({ ...DEFAULTS, ...saved }));
  }

  // POST /api/project/config  { path, webPort, ... }
  if (pathname === '/api/project/config' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, ...incoming } = body;
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const cfgFile = configPath(p);
    const existing = fs.existsSync(cfgFile)
      ? JSON.parse(fs.readFileSync(cfgFile, 'utf-8'))
      : {};
    fs.writeFileSync(cfgFile, JSON.stringify({ ...existing, ...incoming }, null, 2), 'utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleProjectConfig };
