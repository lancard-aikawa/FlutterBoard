'use strict';
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function run(cmd, args, cwd, timeout = 10000) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd, encoding: 'utf-8', shell: process.platform === 'win32', timeout },
      (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

// .env.* ファイルをスキャン（.env 自体は除く）
function detectEnvVariants(projectPath) {
  const found = [];
  try {
    fs.readdirSync(projectPath).forEach(name => {
      if (name.startsWith('.env.')) found.push(name);
    });
  } catch (_) {}
  return found.sort();
}

// 現在の .env がどの .env.* と一致するか判定
function detectActiveEnvFile(projectPath, variants) {
  const dotEnvPath = path.join(projectPath, '.env');
  if (!fs.existsSync(dotEnvPath)) return null;
  let dotEnvContent;
  try { dotEnvContent = fs.readFileSync(dotEnvPath, 'utf-8'); } catch (_) { return null; }
  for (const name of variants) {
    try {
      const content = fs.readFileSync(path.join(projectPath, name), 'utf-8');
      if (content === dotEnvContent) return name;
    } catch (_) {}
  }
  return null; // .env はあるが variant と一致しない（独自編集済み等）
}

async function handleFirebaseEnv(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // -------------------------------------------------------
  // GET /api/firebaseenv/status?path=...
  // -------------------------------------------------------
  if (pathname === '/api/firebaseenv/status' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    // .firebaserc からエイリアス一覧を取得
    let aliases = {};
    const rcPath = path.join(p, '.firebaserc');
    if (fs.existsSync(rcPath)) {
      try {
        const rc = JSON.parse(fs.readFileSync(rcPath, 'utf-8'));
        aliases = rc.projects || {};
      } catch (_) {}
    }

    // firebase use --json で現在のプロジェクトを取得
    // 出力例: {"status":"success","result":"my-app-staging"}
    let currentAlias = null;
    let currentProjectId = null;
    const out = await run('firebase', ['use', '--json'], p, 8000);
    if (out) {
      try {
        const json = JSON.parse(out);
        if (json.result && typeof json.result === 'string') {
          currentProjectId = json.result;
          // プロジェクト ID からエイリアスを逆引き
          currentAlias = Object.keys(aliases).find(k => aliases[k] === currentProjectId)
                       || currentProjectId;
        }
      } catch (_) {}
    }

    // .env.* ファイル一覧と現在のアクティブ env を検出
    const envVariants = detectEnvVariants(p);
    const activeEnv   = detectActiveEnvFile(p, envVariants);

    res.writeHead(200);
    return res.end(JSON.stringify({
      aliases,          // { dev: 'my-app-dev', staging: '...', prod: '...' }
      currentAlias,     // 'staging' または null
      currentProjectId, // 'my-app-staging' または null
      envVariants,      // ['.env.dev', '.env.staging', '.env.prod']
      activeEnv,        // '.env.staging' または null
    }));
  }

  // -------------------------------------------------------
  // POST /api/firebaseenv/use  — firebase use <alias>
  // -------------------------------------------------------
  if (pathname === '/api/firebaseenv/use' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: projectPath, alias } = body;
    if (!projectPath || !alias) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and alias required' }));
    }
    // エイリアス名に危険な文字がないかチェック
    if (!/^[\w\-.:]+$/.test(alias)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid alias' }));
    }
    const out = await run('firebase', ['use', alias], projectPath, 10000);
    if (out === null) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: 'firebase use に失敗しました' }));
    }
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true, output: out }));
  }

  // -------------------------------------------------------
  // POST /api/firebaseenv/env-switch  — .env.* を .env にコピー
  // -------------------------------------------------------
  if (pathname === '/api/firebaseenv/env-switch' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: projectPath, file } = body;
    if (!projectPath || !file) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and file required' }));
    }

    // パストラバーサル防止
    const baseName = path.basename(file);
    if (!baseName.startsWith('.env.')) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid file name' }));
    }
    const src  = path.resolve(projectPath, baseName);
    const dest = path.resolve(projectPath, '.env');
    if (!src.startsWith(path.resolve(projectPath))) {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: 'Forbidden' }));
    }
    if (!fs.existsSync(src)) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'コピー元ファイルが見つかりません' }));
    }
    try {
      fs.copyFileSync(src, dest);
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleFirebaseEnv };
