const fs    = require('fs');
const path  = require('path');
const https = require('https');

// =====================================================================
// pubspec.yaml パーサー（ライブラリなし）
// =====================================================================

function parsePubspec(content) {
  const result = { name: '', dependencies: {}, devDependencies: {} };
  const lines  = content.split(/\r?\n/);

  let section = null; // 'dep' | 'dev' | null
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // トップレベルのキー判定（インデントなし）
    if (/^name:\s*(.+)/.test(trimmed)) {
      result.name = trimmed.replace(/^name:\s*/, '').trim();
      section = null;
    } else if (/^dependencies:/.test(trimmed)) {
      section = 'dep';
    } else if (/^dev_dependencies:/.test(trimmed)) {
      section = 'dev';
    } else if (/^\S/.test(trimmed) && !trimmed.startsWith('#')) {
      // 他のトップレベルキー
      section = null;
    } else if (section && /^  \S/.test(line)) {
      // インデント2のパッケージ行
      const pkgMatch = line.match(/^  ([a-zA-Z0-9_]+)\s*:\s*(.*)/);
      if (!pkgMatch) { i++; continue; }

      const pkgName = pkgMatch[1];
      const rest    = pkgMatch[2].trim();

      // sdk: flutter / sdk: dart → スキップ
      if (rest === '' || rest === 'null') {
        // ネストした定義（git/path/sdk）→ 次行を確認
        const next = lines[i + 1] || '';
        if (/^\s+sdk:/.test(next) || /^\s+git:/.test(next) || /^\s+path:/.test(next)) {
          // sdk/git/path 依存はスキップ
          i++;
          while (i < lines.length && /^    /.test(lines[i])) i++;
          continue;
        }
      }
      if (/^sdk:/.test(rest) || pkgName === 'flutter' || pkgName === 'dart') { i++; continue; }

      const version = normalizeVersion(rest);
      const target  = section === 'dep' ? result.dependencies : result.devDependencies;
      target[pkgName] = version;
    }

    i++;
  }

  return result;
}

/** "^2.0.0" ">=2.0.0 <3.0.0" "any" "2.0.0" → "2.0.0" | null */
function normalizeVersion(raw) {
  if (!raw || raw === 'any' || raw === 'null' || raw === '') return null;
  // 最初の数字.数字.数字 を抽出
  const m = raw.match(/(\d+\.\d+[\.\d]*)/);
  return m ? m[1] : null;
}

// =====================================================================
// pub.dev API
// =====================================================================

function fetchPackageInfo(pkgName) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'pub.dev',
      path:     `/api/packages/${pkgName}`,
      method:   'GET',
      headers:  { 'User-Agent': 'FlutterBoard/0.1' },
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data   = JSON.parse(body);
          const latest = data.latest?.version ?? null;
          resolve({ pkgName, latest });
        } catch {
          resolve({ pkgName, latest: null });
        }
      });
    });
    req.on('error', () => resolve({ pkgName, latest: null }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ pkgName, latest: null }); });
    req.end();
  });
}

// =====================================================================
// バージョン比較
// =====================================================================

function parseSemver(v) {
  if (!v) return null;
  const parts = v.split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

/** 'latest' | 'minor' | 'major' | 'unknown' */
function classifyUpdate(current, latest) {
  if (!current || !latest) return 'unknown';
  const c = parseSemver(current);
  const l = parseSemver(latest);
  if (!c || !l) return 'unknown';
  if (c.major === l.major && c.minor === l.minor && c.patch === l.patch) return 'latest';
  if (l.major > c.major) return 'major';
  return 'minor';
}

// =====================================================================
// ハンドラー
// =====================================================================

async function handlePubspec(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/pubspec/check?path=...
  if (pathname === '/api/pubspec/check' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');

    if (!projectPath || !fs.existsSync(pubspecPath)) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'pubspec.yaml not found' }));
    }

    const content = fs.readFileSync(pubspecPath, 'utf-8');
    const parsed  = parsePubspec(content);

    // 全パッケージのバージョン情報を並列取得
    const allPkgs = [
      ...Object.entries(parsed.dependencies).map(([n, v]) => ({ name: n, version: v, dev: false })),
      ...Object.entries(parsed.devDependencies).map(([n, v]) => ({ name: n, version: v, dev: true })),
    ];

    const infos = await Promise.all(allPkgs.map(p => fetchPackageInfo(p.name)));
    const infoMap = Object.fromEntries(infos.map(i => [i.pkgName, i.latest]));

    const packages = allPkgs.map(p => {
      const latest = infoMap[p.name] || null;
      return {
        name:    p.name,
        current: p.version,
        latest,
        status:  classifyUpdate(p.version, latest),
        dev:     p.dev,
      };
    });

    // MAJOR 更新を先頭に、次に minor、最新は末尾
    const order = { major: 0, minor: 1, unknown: 2, latest: 3 };
    packages.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

    res.writeHead(200);
    return res.end(JSON.stringify({ projectName: parsed.name, packages }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handlePubspec };
