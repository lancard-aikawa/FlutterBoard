'use strict';
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function run(cmd, args, cwd, timeout = 6000) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd, encoding: 'utf-8', shell: process.platform === 'win32', timeout },
      (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

async function getFvmInfo(projectPath) {
  const configPath = path.join(projectPath, '.fvm', 'fvm_config.json');
  const result = { hasFvm: false, sdkVersion: null, globalVersion: null, mismatch: false };

  if (!fs.existsSync(configPath)) return result;

  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    result.hasFvm    = true;
    result.sdkVersion = cfg.flutterSdkVersion || cfg.flutter || null;
  } catch { return result; }

  // グローバル Flutter バージョンを取得
  const out = await run('flutter', ['--version', '--machine'], projectPath);
  if (out) {
    try {
      const parsed = JSON.parse(out);
      result.globalVersion = parsed.frameworkVersion || null;
    } catch {
      const m = out.match(/Flutter\s+(\S+)/);
      if (m) result.globalVersion = m[1];
    }
  }

  if (result.sdkVersion && result.globalVersion) {
    // major.minor で比較（patch まで一致しないケースを許容）
    const norm = v => v.split('.').slice(0, 2).join('.');
    result.mismatch = norm(result.sdkVersion) !== norm(result.globalVersion);
  }

  return result;
}

async function handleFvmInfo(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/api/fvm/info' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p || !fs.existsSync(p)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path required' }));
    }
    const info = await getFvmInfo(p);
    res.writeHead(200);
    return res.end(JSON.stringify(info));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleFvmInfo };
