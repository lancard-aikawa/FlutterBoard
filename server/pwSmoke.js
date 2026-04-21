'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFile } = require('child_process');
const { hashPath } = require('./projectInfo');

const SMOKE_SCRIPT = path.join(__dirname, '..', 'playwright', 'smoke.js');
const CONFIG_DIR   = path.join(__dirname, '..', 'config');

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

function runCmd(cmd, args, opts = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, {
      encoding: 'utf-8', shell: process.platform === 'win32',
      timeout: opts.timeout || 10000,
      cwd: opts.cwd,
    }, (err, stdout, stderr) => resolve({ ok: !err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() }));
  });
}

function configPath(projectPath) {
  return path.join(CONFIG_DIR, `pwsmoke_${hashPath(projectPath)}.json`);
}

function defaultConfig() {
  return {
    baseUrl: 'http://localhost:8080',
    routes:  [{ name: 'ホーム', path: '/' }],
  };
}

async function handlePwSmoke(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/pwsmoke/status?path=
  if (pathname === '/api/pwsmoke/status' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    const hasWebTarget = fs.existsSync(path.join(p, 'web'));
    const hasWebBuild  = fs.existsSync(path.join(p, 'build', 'web', 'index.html'));
    const pwCheck = await runCmd('node', ['-e', "require('playwright');console.log('ok')"], { timeout: 5000, cwd: path.join(__dirname, '..') });
    const playwrightInstalled = pwCheck.ok && pwCheck.stdout.includes('ok');

    res.writeHead(200);
    return res.end(JSON.stringify({ hasWebTarget, hasWebBuild, playwrightInstalled }));
  }

  // GET /api/pwsmoke/config?path=
  if (pathname === '/api/pwsmoke/config' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const cfgFile = configPath(p);
    const cfg = fs.existsSync(cfgFile)
      ? JSON.parse(fs.readFileSync(cfgFile, 'utf-8'))
      : defaultConfig();
    res.writeHead(200);
    return res.end(JSON.stringify(cfg));
  }

  // POST /api/pwsmoke/config  { path, baseUrl, routes }
  if (pathname === '/api/pwsmoke/config' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, ...cfg } = body;
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    fs.writeFileSync(configPath(p), JSON.stringify(cfg, null, 2), 'utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }

  // POST /api/pwsmoke/run  { path }
  if (pathname === '/api/pwsmoke/run' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p } = body;
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    const cfgFile = configPath(p);
    const cfg = fs.existsSync(cfgFile)
      ? JSON.parse(fs.readFileSync(cfgFile, 'utf-8'))
      : defaultConfig();

    const tmpCfg = path.join(os.tmpdir(), `pwsmoke_${Date.now()}.json`);
    fs.writeFileSync(tmpCfg, JSON.stringify(cfg), 'utf-8');

    const result = await new Promise(resolve => {
      execFile('node', [SMOKE_SCRIPT, tmpCfg], {
        encoding: 'utf-8', timeout: 60000,
        shell: process.platform === 'win32',
      }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpCfg); } catch { /* ignore */ }
        const out = (stdout || '').trim();
        if (!out) {
          return resolve({ ok: false, error: err ? err.message : 'no output', stderr });
        }
        try {
          resolve(JSON.parse(out));
        } catch {
          resolve({ ok: false, error: 'parse_error', stdout: out });
        }
      });
    });

    res.writeHead(200);
    return res.end(JSON.stringify(result));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handlePwSmoke };
