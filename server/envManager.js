const fs   = require('fs');
const path = require('path');

// 検索対象の .env ファイル名パターン
const ENV_PATTERNS = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.staging',
  '.env.production',
  '.env.test',
];

// マスク対象キーのパターン
const SENSITIVE_RE = /password|secret|key|token|api_key|private|credential|auth|cert|passwd|pwd/i;

// =====================================================================
// .env パーサー
// =====================================================================

function parseEnvFile(content) {
  const entries = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key   = line.slice(0, eq).trim();
    let   value = line.slice(eq + 1).trim();

    // クォート除去
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    entries.push({ key, value, sensitive: SENSITIVE_RE.test(key) });
  }
  return entries;
}

// =====================================================================
// .env ファイル一覧取得
// =====================================================================

function detectEnvFiles(projectPath) {
  const found = [];

  // 既知パターンをチェック
  ENV_PATTERNS.forEach(name => {
    const abs = path.join(projectPath, name);
    if (fs.existsSync(abs)) found.push(name);
  });

  // その他の .env.* ファイルを補足
  try {
    fs.readdirSync(projectPath).forEach(name => {
      if (name.startsWith('.env.') && !found.includes(name)) {
        found.push(name);
      }
    });
  } catch (_) {}

  return found;
}

// =====================================================================
// ハンドラー
// =====================================================================

function handleEnv(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/env/list?path=...
  if (pathname === '/api/env/list' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    if (!projectPath) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path required' }));
    }
    const files = detectEnvFiles(projectPath);
    res.writeHead(200);
    return res.end(JSON.stringify({ files }));
  }

  // GET /api/env/file?path=...&file=...
  if (pathname === '/api/env/file' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    const fileName    = url.searchParams.get('file');

    if (!projectPath || !fileName) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and file required' }));
    }

    // ファイル名の安全チェック（パストラバーサル防止）
    const baseName = path.basename(fileName);
    if (!baseName.startsWith('.env') || baseName.includes('/') || baseName.includes('\\')) {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: 'Forbidden' }));
    }

    const absFile = path.join(projectPath, baseName);
    if (!absFile.startsWith(path.resolve(projectPath))) {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: 'Forbidden' }));
    }

    let content;
    try { content = fs.readFileSync(absFile, 'utf-8'); } catch (_) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'File not found' }));
    }

    const entries = parseEnvFile(content);
    res.writeHead(200);
    return res.end(JSON.stringify({ file: baseName, entries }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleEnv };
