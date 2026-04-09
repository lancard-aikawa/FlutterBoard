'use strict';
const { execFile } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── ユーティリティ ────────────────────────────────────────────────────

function run(cmd, args, cwd, timeout = 20000) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd, encoding: 'utf-8', shell: process.platform === 'win32', timeout },
      (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

// ── Flutter ───────────────────────────────────────────────────────────

async function getFlutterContext(projectPath) {
  // デバイス一覧 (flutter devices --machine → JSON)
  const raw     = await run('flutter', ['devices', '--machine'], projectPath);
  let devices   = [];
  try {
    devices = (JSON.parse(raw || '[]')).map(d => ({
      id:       d.id,
      name:     d.name,
      platform: d.targetPlatform || '',
      emulator: !!d.emulator,
      sdk:      d.sdk || '',
    }));
  } catch (_) {}

  // エントリポイント: lib/main*.dart
  const libDir     = path.join(projectPath, 'lib');
  const entryPoints = fs.existsSync(libDir)
    ? fs.readdirSync(libDir).filter(f => /^main.*\.dart$/.test(f)).sort().map(f => `lib/${f}`)
    : ['lib/main.dart'];

  // フレーバー検出: lib/main_<flavor>.dart + android build.gradle
  const flavors = new Set();
  if (fs.existsSync(libDir)) {
    fs.readdirSync(libDir)
      .filter(f => /^main_.+\.dart$/.test(f))
      .forEach(f => flavors.add(f.replace(/^main_/, '').replace(/\.dart$/, '')));
  }
  const buildGradle = path.join(projectPath, 'android', 'app', 'build.gradle');
  if (fs.existsSync(buildGradle)) {
    try {
      const content = fs.readFileSync(buildGradle, 'utf-8');
      const block   = content.match(/productFlavors\s*\{([\s\S]*?)\n\s*\}/);
      if (block) {
        for (const m of block[1].matchAll(/^\s+(\w+)\s*\{/gm)) flavors.add(m[1]);
      }
    } catch (_) {}
  }

  return { devices, entryPoints, flavors: [...flavors] };
}

// ── Firebase ──────────────────────────────────────────────────────────

function getFirebaseContext(projectPath) {
  const result = { emulators: [], deployTargets: [], projects: [] };

  const jsonPath = path.join(projectPath, 'firebase.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      if (cfg.emulators) {
        result.emulators = Object.keys(cfg.emulators)
          .filter(k => !['singleProjectMode', 'ui', 'logging'].includes(k)
                    && typeof cfg.emulators[k] === 'object');
      }
      for (const key of ['hosting', 'functions', 'firestore', 'storage', 'database', 'remoteconfig']) {
        if (cfg[key]) result.deployTargets.push(key);
      }
    } catch (_) {}
  }

  const rcPath = path.join(projectPath, '.firebaserc');
  if (fs.existsSync(rcPath)) {
    try {
      const rc = JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
      result.projects = Object.entries(rc.projects || {}).map(([alias, id]) => ({ alias, id }));
    } catch (_) {}
  }

  return result;
}

// ── Git ───────────────────────────────────────────────────────────────

async function getGitContext(projectPath) {
  const [branchRaw, stashRaw, head] = await Promise.all([
    run('git', ['branch', '-a', '--format=%(refname:short)'], projectPath, 8000),
    run('git', ['stash', 'list', '--format=%gd|%s'],          projectPath, 8000),
    run('git', ['rev-parse', '--abbrev-ref', 'HEAD'],          projectPath, 8000),
  ]);

  // ブランチ: remotes/ プレフィックスを除去・重複排除
  const branches = (branchRaw || '').split('\n').filter(Boolean)
    .map(b => b.replace(/^remotes\//, '').trim())
    .filter((b, i, arr) => arr.indexOf(b) === i && b !== 'HEAD');

  const stashes = (stashRaw || '').split('\n').filter(Boolean).map(line => {
    const sep = line.indexOf('|');
    return { ref: line.slice(0, sep).trim(), message: line.slice(sep + 1).trim() };
  });

  return { branches, stashes, currentBranch: head || '' };
}

// ── ハンドラー ────────────────────────────────────────────────────────

async function handleContext(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;
  const p = url.searchParams.get('path');

  if (!p) {
    res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' }));
  }

  if (pathname === '/api/context/flutter' && req.method === 'GET') {
    const ctx = await getFlutterContext(p);
    res.writeHead(200);
    return res.end(JSON.stringify(ctx));
  }

  if (pathname === '/api/context/firebase' && req.method === 'GET') {
    res.writeHead(200);
    return res.end(JSON.stringify(getFirebaseContext(p)));
  }

  if (pathname === '/api/context/git' && req.method === 'GET') {
    const ctx = await getGitContext(p);
    res.writeHead(200);
    return res.end(JSON.stringify(ctx));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleContext };
