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

function fetchPackageInfo(pkgName, currentVersion) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'pub.dev',
      path:     `/api/packages/${pkgName}`,
      method:   'GET',
      headers:  { 'User-Agent': 'FlutterBoard/0.1' },
    };
    const empty = { pkgName, latest: null, latestMinor: null, latestMajor: null, latestPublishedAt: null, currentPublishedAt: null, currentAgeInDays: null };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data              = JSON.parse(body);
          const latest            = data.latest?.version ?? null;
          const latestPublishedAt = data.latest?.published ?? null;

          // Find current version's publish date in the versions array
          let currentPublishedAt = null;
          if (currentVersion && Array.isArray(data.versions)) {
            const entry = data.versions.find(v => v.version === currentVersion);
            currentPublishedAt = entry?.published ?? null;
          }

          const currentAgeInDays = currentPublishedAt
            ? Math.floor((Date.now() - new Date(currentPublishedAt)) / 86400000)
            : null;

          // Compute latestMinor (same major) and latestMajor (higher major)
          const currentParsed = parseSemver(currentVersion);
          let latestMinor = null;
          let latestMajor = null;

          if (currentParsed && Array.isArray(data.versions)) {
            const sortedVersions = data.versions
              .map(v => v.version)
              .filter(v => v && !v.includes('-'))
              .sort((a, b) => {
                const pa = parseSemver(a), pb = parseSemver(b);
                if (pa.major !== pb.major) return pb.major - pa.major;
                if (pa.minor !== pb.minor) return pb.minor - pa.minor;
                return pb.patch - pa.patch;
              });

            for (const v of sortedVersions) {
              const pv = parseSemver(v);
              if (pv && pv.major === currentParsed.major && semverGt(pv, currentParsed)) {
                latestMinor = v;
                break;
              }
            }

            const latestParsed = parseSemver(latest);
            if (latestParsed && latestParsed.major > currentParsed.major) {
              latestMajor = latest;
            }
          }

          resolve({ pkgName, latest, latestMinor, latestMajor, latestPublishedAt, currentPublishedAt, currentAgeInDays });
        } catch {
          resolve(empty);
        }
      });
    });
    req.on('error', () => resolve(empty));
    req.setTimeout(8000, () => { req.destroy(); resolve(empty); });
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

function semverGt(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
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

const CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours
const pubspecCache   = new Map(); // key: projectPath → { result, cachedAt }

async function handlePubspec(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/pubspec/check?path=...
  if (pathname === '/api/pubspec/check' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    const force       = url.searchParams.get('force') === '1';
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');

    if (!projectPath || !path.isAbsolute(projectPath)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid path' }));
    }
    if (!fs.existsSync(pubspecPath)) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'pubspec.yaml not found' }));
    }

    // キャッシュヒット確認
    if (!force) {
      const cached = pubspecCache.get(projectPath);
      if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        res.writeHead(200);
        return res.end(JSON.stringify({ ...cached.result, cached: true, cachedAt: cached.cachedAt }));
      }
    }

    const content = fs.readFileSync(pubspecPath, 'utf-8');
    const parsed  = parsePubspec(content);

    // 全パッケージのバージョン情報を並列取得
    const allPkgs = [
      ...Object.entries(parsed.dependencies).map(([n, v]) => ({ name: n, version: v, dev: false })),
      ...Object.entries(parsed.devDependencies).map(([n, v]) => ({ name: n, version: v, dev: true })),
    ];

    const infos   = await Promise.all(allPkgs.map(p => fetchPackageInfo(p.name, p.version)));
    const infoMap = Object.fromEntries(infos.map(i => [i.pkgName, i]));

    const packages = allPkgs.map(p => {
      const info        = infoMap[p.name] || {};
      const latest      = info.latest      || null;
      const latestMinor = info.latestMinor || null;
      const latestMajor = info.latestMajor || null;

      let status = classifyUpdate(p.version, latest);
      if (latestMinor && latestMajor) status = 'both';

      return {
        name:               p.name,
        current:            p.version,
        latest,
        latestMinor,
        latestMajor,
        status,
        dev:                p.dev,
        currentPublishedAt: info.currentPublishedAt ?? null,
        latestPublishedAt:  info.latestPublishedAt  ?? null,
        currentAgeInDays:   info.currentAgeInDays   ?? null,
        provenance:         null,
      };
    });

    const order = { both: 0, major: 1, minor: 2, unknown: 3, latest: 4 };
    packages.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

    const cachedAt = Date.now();
    const result   = { projectName: parsed.name, packages };
    pubspecCache.set(projectPath, { result, cachedAt });

    res.writeHead(200);
    return res.end(JSON.stringify({ ...result, cached: false, cachedAt }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handlePubspec };
