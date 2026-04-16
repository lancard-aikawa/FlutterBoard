'use strict';
const fs         = require('fs');
const path       = require('path');
const { execFile } = require('child_process');

// pubspec.lock の内容からパッケージ名→バージョンの Map を生成
function parseLockVersions(content) {
  const versions = {};
  let currentPkg = null;
  for (const line of content.split('\n')) {
    const pkgMatch = line.match(/^  (\S+):$/);
    if (pkgMatch) { currentPkg = pkgMatch[1]; continue; }
    const verMatch = line.match(/^    version: "([^"]+)"/);
    if (verMatch && currentPkg) {
      versions[currentPkg] = verMatch[1];
      currentPkg = null;
    }
  }
  return versions;
}

// セマバーの変更種別を判定
function classifyChange(oldVer, newVer) {
  const parse = v => (v || '0.0.0').replace(/[^\d.]/g, '').split('.').map(Number);
  const [oMaj, oMin] = parse(oldVer);
  const [nMaj, nMin] = parse(newVer);
  if (nMaj !== oMaj) return 'MAJOR';
  if (nMin !== oMin) return 'minor';
  return 'patch';
}

async function handleLockDiff(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/lock-diff?path=<dir>&base=HEAD
  if (pathname === '/api/lock-diff' && req.method === 'GET') {
    const cwd  = url.searchParams.get('path');
    const base = url.searchParams.get('base') || 'HEAD';
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    const lockFile = path.join(cwd, 'pubspec.lock');
    if (!fs.existsSync(lockFile)) {
      res.writeHead(200);
      return res.end(JSON.stringify({ error: 'pubspec.lock が見つかりません' }));
    }

    // HEAD の pubspec.lock を取得
    const oldContent = await new Promise(resolve => {
      execFile('git', ['show', `${base}:pubspec.lock`],
        { cwd, encoding: 'utf-8', timeout: 8000 },
        (err, stdout) => resolve(err ? null : stdout));
    });

    // HEAD に pubspec.lock がない場合は「全パッケージが新規追加」として扱う
    const effectiveOld = oldContent === null ? '' : oldContent;

    const newContent = fs.readFileSync(lockFile, 'utf-8');
    const oldVers    = parseLockVersions(effectiveOld);
    const newVers    = parseLockVersions(newContent);

    const allPkgs = new Set([...Object.keys(oldVers), ...Object.keys(newVers)]);
    const changes = [];

    for (const pkg of [...allPkgs].sort()) {
      const oldV = oldVers[pkg];
      const newV = newVers[pkg];
      if (oldV === newV) continue;

      if (!oldV) {
        changes.push({ pkg, oldV: null, newV, kind: 'added' });
      } else if (!newV) {
        changes.push({ pkg, oldV, newV: null, kind: 'removed' });
      } else {
        changes.push({ pkg, oldV, newV, kind: classifyChange(oldV, newV) });
      }
    }

    res.writeHead(200);
    return res.end(JSON.stringify({ changes, base }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleLockDiff };
