'use strict';
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ── キャッシュ ────────────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'config');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function getCacheFile(projectPath, type) {
  const safe = projectPath.replace(/[:\\/]/g, '_');
  return path.join(CACHE_DIR, `tree_${safe}_${type}.json`);
}

function loadCache(projectPath, type) {
  try {
    const file = getCacheFile(projectPath, type);
    const c    = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (Date.now() - c.cachedAt < CACHE_TTL) return c;
  } catch {}
  return null;
}

function saveCache(projectPath, type, data) {
  const file = getCacheFile(projectPath, type);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ cachedAt: Date.now(), data }), 'utf-8');
}

// ── プロセス実行 ──────────────────────────────────────────────────────────────
function run(cmd, args, cwd, timeout = 30000) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd, encoding: 'utf-8', shell: process.platform === 'win32', timeout },
      (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

// ── Flutter pub deps ──────────────────────────────────────────────────────────
async function getFlutterTree(projectPath) {
  const raw = await run('flutter', ['pub', 'deps', '--json'], projectPath);
  if (!raw) return null;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }

  const packages = parsed.packages || [];
  const nodeMap  = {};
  packages.forEach(pkg => {
    nodeMap[pkg.name] = {
      name:    pkg.name,
      version: pkg.version || '',
      kind:    pkg.kind || 'transitive',
      deps:    pkg.dependencies || [],
    };
  });

  return { root: parsed.root, nodes: nodeMap };
}

// ── npm ls ────────────────────────────────────────────────────────────────────
async function getNpmTree(projectPath) {
  const raw = await run('npm', ['ls', '--json', '--depth=Infinity'], projectPath);
  if (!raw) return null;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }

  const nodeMap = {};

  function flatten(name, obj, kind) {
    const key = `${name}@${obj.version || ''}`;
    if (nodeMap[key]) return key;
    const deps = Object.keys(obj.dependencies || {});
    nodeMap[key] = {
      name,
      version: obj.version || '',
      kind,
      deps: deps.map(d => `${d}@${(obj.dependencies[d] || {}).version || ''}`),
    };
    deps.forEach(d => flatten(d, obj.dependencies[d] || {}, 'transitive'));
    return key;
  }

  const rootKey   = `${parsed.name || 'root'}@${parsed.version || ''}`;
  const directDeps = Object.keys(parsed.dependencies || {});

  nodeMap[rootKey] = {
    name:    parsed.name || 'root',
    version: parsed.version || '',
    kind:    'root',
    deps:    directDeps.map(d => `${d}@${(parsed.dependencies[d] || {}).version || ''}`),
  };

  directDeps.forEach(d => flatten(d, parsed.dependencies[d] || {}, 'direct'));

  return { root: rootKey, nodes: nodeMap };
}

// ── ハンドラ ──────────────────────────────────────────────────────────────────
async function handleDepsTree(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  const p     = url.searchParams.get('path');
  const type  = url.searchParams.get('type') || 'flutter';
  const force = url.searchParams.get('force') === '1';

  if (!p) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'path required' }));
  }

  if (url.pathname === '/api/deps-tree' && req.method === 'GET') {
    // キャッシュ確認
    if (!force) {
      const cached = loadCache(p, type);
      if (cached) {
        res.writeHead(200);
        return res.end(JSON.stringify({ ...cached.data, cached: true, cachedAt: cached.cachedAt }));
      }
    }

    const tree = type === 'npm' ? await getNpmTree(p) : await getFlutterTree(p);
    if (!tree) {
      res.writeHead(200);
      return res.end(JSON.stringify({ error: 'ツリー取得に失敗しました。flutter pub get / npm install を先に実行してください。' }));
    }

    saveCache(p, type, tree);
    res.writeHead(200);
    return res.end(JSON.stringify({ ...tree, cached: false, cachedAt: Date.now() }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleDepsTree };
