'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// =====================================================================
// HTML ファイルスキャン
// =====================================================================

/** プロジェクト内の .html ファイルを深さ2まで収集（node_modules 除外） */
function findHtmlFiles(dir, depth) {
  if (depth > 2) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.endsWith('.html')) {
        results.push(full);
      } else if (e.isDirectory() && depth < 2) {
        results.push(...findHtmlFiles(full, depth + 1));
      }
    }
  } catch {}
  return results;
}

// =====================================================================
// CDN URL パーサー
// =====================================================================

const CDN_PATTERNS = [
  // cdnjs: /ajax/libs/{pkg}/{version}/...
  {
    re:  /cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/([^/]+)\//g,
    map: (m) => ({ pkgName: m[1], versionRaw: m[2], cdn: 'cdnjs' }),
  },
  // jsdelivr npm: /npm/{pkg}@{version}/ or /npm/{pkg}/
  {
    re:  /cdn\.jsdelivr\.net\/npm\/(@[^/@]+\/[^/@]+|[^/@]+)(?:@([^/]+))?(?:\/|$)/g,
    map: (m) => ({ pkgName: m[1], versionRaw: m[2] || null, cdn: 'jsdelivr' }),
  },
  // unpkg: /{pkg}@{version}/ or /{pkg}/
  {
    re:  /unpkg\.com\/(@[^/@]+\/[^/@]+|[^/@]+)(?:@([^/]+))?(?:\/|$)/g,
    map: (m) => ({ pkgName: m[1], versionRaw: m[2] || null, cdn: 'unpkg' }),
  },
];

/** HTML テキストからCDNエントリを抽出
 *  返り値: [{ pkgName, versionRaw, cdn, url }]
 */
function extractCdnEntries(html) {
  // src="..." href="..." from "..." の文字列からURLを集める
  const urlRe = /(?:src|href|from)\s*=?\s*["'`](https?:\/\/[^"'`\s]+)["'`]/g;
  const urls  = [];
  let m;
  while ((m = urlRe.exec(html)) !== null) urls.push(m[1]);

  const results = [];
  for (const url of urls) {
    for (const { re, map } of CDN_PATTERNS) {
      re.lastIndex = 0;
      const match = re.exec(url);
      if (match) {
        results.push({ ...map(match), url });
        break; // 1 URL につき 1 マッチ
      }
    }
  }
  return results;
}

/** CDN URL のバージョン文字列を semver ライクに正規化
 *  "11"       → { display: "11", semver: "11.0.0", pinMajor: true }
 *  "11.9.0"   → { display: "11.9.0", semver: "11.9.0", pinMajor: false }
 *  null       → { display: null, semver: null, pinMajor: false }
 */
function normalizeCdnVersion(raw) {
  if (!raw) return { display: null, semver: null, pinMajor: false };
  const clean = raw.replace(/^[^0-9]*/, '');
  if (/^\d+$/.test(clean)) {
    return { display: raw, semver: `${clean}.0.0`, pinMajor: true };
  }
  const m = clean.match(/^(\d+\.\d+[\.\d]*)/);
  const semver = m ? m[1] : null;
  return { display: raw, semver, pinMajor: false };
}

// =====================================================================
// npm registry（npmChecker と同じロジック、自己完結で保持）
// =====================================================================

function parseSemver(v) {
  if (!v) return null;
  const clean = v.replace(/^[^\d]*/, '');
  const parts = clean.split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function semverGt(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch > b.patch;
}

function classifyUpdate(current, latest) {
  if (!current || !latest) return 'unknown';
  const c = parseSemver(current);
  const l = parseSemver(latest);
  if (!c || !l) return 'unknown';
  if (c.major === l.major && c.minor === l.minor && c.patch === l.patch) return 'latest';
  if (l.major > c.major) return 'major';
  return 'minor';
}

function fetchNpmInfo(pkgName, currentSemver) {
  return new Promise((resolve) => {
    const encodedName = pkgName.replace(/^@/, '%40').replace(/\//, '%2F');
    const empty = { pkgName, latest: null, latestMinor: null, latestMajor: null,
                    latestPublishedAt: null, currentPublishedAt: null, currentAgeInDays: null };

    const options = {
      hostname: 'registry.npmjs.org',
      path:     `/${encodedName}`,
      method:   'GET',
      headers:  { 'User-Agent': 'FlutterBoard/0.1', 'Accept': 'application/json' },
    };
    const req = https.request(options, res => {
      if (res.statusCode !== 200) { resolve(empty); return; }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data   = JSON.parse(body);
          const latest = data['dist-tags']?.latest ?? null;
          const time   = data.time || {};

          const latestPublishedAt  = latest         ? (time[latest]         ?? null) : null;
          const currentPublishedAt = currentSemver  ? (time[currentSemver]  ?? null) : null;
          const currentAgeInDays   = currentPublishedAt
            ? Math.floor((Date.now() - new Date(currentPublishedAt)) / 86400000)
            : null;

          const currentParsed = parseSemver(currentSemver);
          let latestMinor = null;
          let latestMajor = null;

          if (currentParsed) {
            const sortedVersions = Object.keys(data.versions || {})
              .filter(v => !v.includes('-'))
              .sort((a, b) => {
                const pa = parseSemver(a), pb = parseSemver(b);
                if (pa.major !== pb.major) return pb.major - pa.major;
                if (pa.minor !== pb.minor) return pb.minor - pa.minor;
                return pb.patch - pa.patch;
              });
            for (const v of sortedVersions) {
              const pv = parseSemver(v);
              if (pv && pv.major === currentParsed.major && semverGt(pv, currentParsed)) {
                latestMinor = v; break;
              }
            }
            const latestParsed = parseSemver(latest);
            if (latestParsed && latestParsed.major > currentParsed.major) latestMajor = latest;
          }

          resolve({ pkgName, latest, latestMinor, latestMajor,
                    latestPublishedAt, currentPublishedAt, currentAgeInDays });
        } catch { resolve(empty); }
      });
    });
    req.on('error', () => resolve(empty));
    req.setTimeout(10000, () => { req.destroy(); resolve(empty); });
    req.end();
  });
}

// =====================================================================
// ハンドラー
// =====================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cdnCache     = new Map(); // key: projectPath → { result, cachedAt }

async function handleCdn(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname !== '/api/cdn/check' || req.method !== 'GET') {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  const projectPath = url.searchParams.get('path');
  const force       = url.searchParams.get('force') === '1';

  if (!projectPath || !path.isAbsolute(projectPath)) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'Invalid path' }));
  }

  if (!fs.existsSync(projectPath)) {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'Project path not found' }));
  }

  // キャッシュ確認
  if (!force) {
    const cached = cdnCache.get(projectPath);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      res.writeHead(200);
      return res.end(JSON.stringify({ ...cached.result, cached: true, cachedAt: cached.cachedAt }));
    }
  }

  // HTML ファイルをスキャン
  const htmlFiles = findHtmlFiles(projectPath, 0);
  if (htmlFiles.length === 0) {
    const result = { packages: [] };
    res.writeHead(200);
    return res.end(JSON.stringify({ ...result, cached: false, cachedAt: Date.now() }));
  }

  // 全 HTML から CDN エントリ収集（pkgName+cdn でデdup）
  const seen    = new Map(); // key: `${cdn}:${pkgName}` → entry
  for (const htmlPath of htmlFiles) {
    const relFile = path.relative(projectPath, htmlPath).replace(/\\/g, '/');
    let html;
    try { html = fs.readFileSync(htmlPath, 'utf-8'); } catch { continue; }

    const entries = extractCdnEntries(html);
    for (const e of entries) {
      const key = `${e.cdn}:${e.pkgName}`;
      if (!seen.has(key)) {
        seen.set(key, { ...e, file: relFile });
      }
    }
  }

  const cdnEntries = [...seen.values()];
  if (cdnEntries.length === 0) {
    const result = { packages: [] };
    const cachedAt = Date.now();
    cdnCache.set(projectPath, { result, cachedAt });
    res.writeHead(200);
    return res.end(JSON.stringify({ ...result, cached: false, cachedAt }));
  }

  // npm registry へ並列問い合わせ
  const infos   = await Promise.all(
    cdnEntries.map(e => {
      const { semver } = normalizeCdnVersion(e.versionRaw);
      return fetchNpmInfo(e.pkgName, semver);
    })
  );
  const infoMap = Object.fromEntries(infos.map(i => [i.pkgName, i]));

  const packages = cdnEntries.map(e => {
    const { display, semver, pinMajor } = normalizeCdnVersion(e.versionRaw);
    const info        = infoMap[e.pkgName] || {};
    const latest      = info.latest      || null;
    const latestMinor = pinMajor ? null : (info.latestMinor || null); // major pin は minor 自動なので表示しない
    const latestMajor = info.latestMajor || null;

    let status = classifyUpdate(semver, latest);
    if (latestMinor && latestMajor) status = 'both';

    return {
      name:               e.pkgName,
      current:            display,          // 表示用（"11" や "11.9.0"）
      semver,                               // 比較用
      pinMajor,
      latest,
      latestMinor,
      latestMajor,
      status,
      cdn:                e.cdn,
      file:               e.file,
      url:                e.url,
      dev:                false,
      currentPublishedAt: info.currentPublishedAt ?? null,
      latestPublishedAt:  info.latestPublishedAt  ?? null,
      currentAgeInDays:   info.currentAgeInDays   ?? null,
      provenance:         null,
    };
  });

  const order = { both: 0, major: 1, minor: 2, unknown: 3, latest: 4 };
  packages.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

  const cachedAt = Date.now();
  const result   = { packages };
  cdnCache.set(projectPath, { result, cachedAt });

  res.writeHead(200);
  res.end(JSON.stringify({ ...result, cached: false, cachedAt }));
}

module.exports = { handleCdn };
