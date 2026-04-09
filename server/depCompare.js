'use strict';
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { loadHistory } = require('./history');

// =====================================================================
// git ユーティリティ
// =====================================================================

function git(args, cwd) {
  return new Promise(resolve => {
    execFile('git', args, { cwd, encoding: 'utf-8', timeout: 8000 },
      (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

// =====================================================================
// pubspec.yaml 簡易パーサー（依存バージョン取得のみ）
// =====================================================================

function parsePubspec(content) {
  const result = { name: '', dependencies: {}, devDependencies: {} };
  const lines  = content.split(/\r?\n/);
  let section  = null;

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const trimmed = line.trimEnd();

    if (/^name:\s*(.+)/.test(trimmed)) {
      result.name = trimmed.replace(/^name:\s*/, '').trim();
      section = null;
    } else if (/^dependencies:/.test(trimmed)) {
      section = 'dep';
    } else if (/^dev_dependencies:/.test(trimmed)) {
      section = 'dev';
    } else if (/^\S/.test(trimmed) && !trimmed.startsWith('#')) {
      section = null;
    } else if (section && /^  \S/.test(line)) {
      const m = line.match(/^  ([a-zA-Z0-9_]+)\s*:\s*(.*)/);
      if (!m) continue;
      const [, pkgName, rest] = m;
      if (/^sdk:/.test(rest.trim()) || pkgName === 'flutter' || pkgName === 'dart') continue;
      // sdk/git/path ネスト → スキップ
      const next = lines[i + 1] || '';
      if ((rest.trim() === '' || rest.trim() === 'null') &&
          (/^\s+sdk:/.test(next) || /^\s+git:/.test(next) || /^\s+path:/.test(next))) {
        while (i + 1 < lines.length && /^    /.test(lines[i + 1])) i++;
        continue;
      }
      const version = normVer(rest.trim());
      (section === 'dep' ? result.dependencies : result.devDependencies)[pkgName] = version;
    }
  }
  return result;
}

// =====================================================================
// package.json 簡易パーサー
// =====================================================================

function parsePackageJson(content) {
  const pkg = JSON.parse(content);
  const norm = (deps) =>
    Object.fromEntries(Object.entries(deps || {}).map(([k, v]) => [k, normVer(v)]));
  return {
    name:            pkg.name || '',
    dependencies:    norm(pkg.dependencies),
    devDependencies: norm(pkg.devDependencies),
  };
}

// =====================================================================
// semver ヘルパー
// =====================================================================

function normVer(raw) {
  if (!raw || raw === 'any' || raw === '*' || raw === 'latest') return null;
  const m = raw.match(/(\d+\.\d+[\.\d]*)/);
  return m ? m[1] : null;
}

function parseSemver(v) {
  if (!v) return null;
  const parts = v.replace(/^[^\d]*/, '').split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function semverCompare(a, b) {
  // -1: a<b, 0: a==b, 1: a>b
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

// =====================================================================
// 依存比較コア
// =====================================================================

function compareDeps(current, target) {
  const allNames = new Set([
    ...Object.keys(current.dependencies),
    ...Object.keys(current.devDependencies),
    ...Object.keys(target.dependencies),
    ...Object.keys(target.devDependencies),
  ]);

  const rows = [];
  for (const name of [...allNames].sort()) {
    const curVer = current.dependencies[name] ?? current.devDependencies[name] ?? null;
    const tgtVer = target.dependencies[name]  ?? target.devDependencies[name]  ?? null;
    const dev    = !!(current.devDependencies[name] || target.devDependencies[name]);

    let status;
    if (!tgtVer && curVer)       status = 'added';
    else if (tgtVer && !curVer)  status = 'removed';
    else if (curVer === tgtVer)  status = 'same';
    else {
      const cmp = semverCompare(curVer, tgtVer);
      status = cmp > 0 ? 'newer' : cmp < 0 ? 'older' : 'changed';
    }

    rows.push({ name, current: curVer, target: tgtVer, status, dev });
  }
  return rows;
}

// =====================================================================
// ハンドラー
// =====================================================================

async function handleDepCompare(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/depcompare/branches?path=...
  if (pathname === '/api/depcompare/branches' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    const out = await git(
      ['branch', '-a', '--format=%(refname:short)', '--sort=-committerdate'],
      p
    );
    const branches = out
      ? [...new Set(
          out.split('\n')
             .map(b => b.trim().replace(/^origin\//, ''))
             .filter(b => b && b !== 'HEAD')
        )]
      : [];

    res.writeHead(200);
    return res.end(JSON.stringify({ branches }));
  }

  // GET /api/depcompare/history
  if (pathname === '/api/depcompare/history' && req.method === 'GET') {
    const history = loadHistory();
    res.writeHead(200);
    return res.end(JSON.stringify({ history }));
  }

  // GET /api/depcompare/compare?path=...&type=pubspec|npm&branch=...&otherPath=...
  if (pathname === '/api/depcompare/compare' && req.method === 'GET') {
    const p         = url.searchParams.get('path');
    const type      = url.searchParams.get('type');   // 'pubspec' | 'npm'
    const branch    = url.searchParams.get('branch'); // ブランチ指定
    const otherPath = url.searchParams.get('otherPath'); // 別プロジェクト指定

    if (!p || !type) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and type required' }));
    }
    if (!branch && !otherPath) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'branch or otherPath required' }));
    }

    const filename = type === 'npm' ? 'package.json' : 'pubspec.yaml';
    const parse    = type === 'npm' ? parsePackageJson : parsePubspec;

    // 現在のプロジェクトのファイルを読む
    let currentParsed;
    try {
      const content = fs.readFileSync(path.join(p, filename), 'utf-8');
      currentParsed = parse(content);
    } catch {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: `${filename} が見つかりません` }));
    }

    // 比較対象ファイルを取得
    let targetContent = null;
    let targetLabel   = '';

    if (branch) {
      targetContent = await git(['show', `${branch}:${filename}`], p);
      targetLabel   = branch;
      if (!targetContent) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: `${branch} に ${filename} が見つかりません` }));
      }
    } else {
      // 別プロジェクト
      try {
        targetContent = fs.readFileSync(path.join(otherPath, filename), 'utf-8');
        targetLabel   = path.basename(otherPath);
      } catch {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: `${otherPath} に ${filename} が見つかりません` }));
      }
    }

    let targetParsed;
    try {
      targetParsed = parse(targetContent);
    } catch {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: `${filename} のパースに失敗しました` }));
    }

    const diff = compareDeps(currentParsed, targetParsed);

    res.writeHead(200);
    return res.end(JSON.stringify({
      currentName: currentParsed.name || path.basename(p),
      targetName:  targetParsed.name  || targetLabel,
      targetLabel,
      diff,
    }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleDepCompare };
