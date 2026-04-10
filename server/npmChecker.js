const fs    = require('fs');
const path  = require('path');
const https = require('https');

// =====================================================================
// npm registry API
// =====================================================================

function fetchNpmInfo(pkgName, currentVersion) {
  return new Promise((resolve) => {
    // Scoped packages: @scope/pkg → @scope%2Fpkg
    const encodedName = pkgName.replace(/^@/, '%40').replace(/\//, '%2F');
    const empty = { pkgName, latest: null, currentPublishedAt: null, latestPublishedAt: null, currentAgeInDays: null, provenance: null };

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

          const latestPublishedAt  = latest          ? (time[latest]         ?? null) : null;
          const currentPublishedAt = currentVersion  ? (time[currentVersion] ?? null) : null;

          const currentAgeInDays = currentPublishedAt
            ? Math.floor((Date.now() - new Date(currentPublishedAt)) / 86400000)
            : null;

          // Provenance: npm publishes dist.attestations for packages using --provenance
          const versionData = currentVersion ? (data.versions?.[currentVersion] ?? null) : null;
          const provenance  = versionData !== null ? !!(versionData?.dist?.attestations) : null;

          // Compute latestMinor (same major) and latestMajor (higher major)
          const currentParsed = parseSemver(currentVersion);
          let latestMinor = null;
          let latestMajor = null;

          if (currentParsed) {
            // All stable versions sorted by semver descending
            const sortedVersions = Object.keys(data.versions || {})
              .filter(v => !v.includes('-'))
              .sort((a, b) => {
                const pa = parseSemver(a), pb = parseSemver(b);
                if (pa.major !== pb.major) return pb.major - pa.major;
                if (pa.minor !== pb.minor) return pb.minor - pa.minor;
                return pb.patch - pa.patch;
              });

            // Highest version with same major that is newer than current
            for (const v of sortedVersions) {
              const pv = parseSemver(v);
              if (pv && pv.major === currentParsed.major && semverGt(pv, currentParsed)) {
                latestMinor = v;
                break;
              }
            }

            // Latest overall is a major bump?
            const latestParsed = parseSemver(latest);
            if (latestParsed && latestParsed.major > currentParsed.major) {
              latestMajor = latest;
            }
          }

          resolve({ pkgName, latest, latestMinor, latestMajor,
                    currentPublishedAt, latestPublishedAt, currentAgeInDays, provenance });
        } catch {
          resolve(empty);
        }
      });
    });

    req.on('error', () => resolve(empty));
    req.setTimeout(10000, () => { req.destroy(); resolve(empty); });
    req.end();
  });
}

// =====================================================================
// semver helpers (duplicated here to keep modules self-contained)
// =====================================================================

function parseSemver(v) {
  if (!v) return null;
  const clean = v.replace(/^[^\d]*/, '');
  const parts = clean.split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function semverGt(a, b) {
  // returns true if semver a > b
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

function normalizeVersion(raw) {
  if (!raw || raw === '*' || raw === 'latest' || raw === '') return null;
  const m = raw.match(/(\d+\.\d+[\.\d]*)/);
  return m ? m[1] : null;
}

// =====================================================================
// Package search
// =====================================================================

function fetchNpmSearch(query) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'registry.npmjs.org',
      path:     `/-/v1/search?text=${encodeURIComponent(query)}&size=10`,
      method:   'GET',
      headers:  { 'User-Agent': 'FlutterBoard/0.1', 'Accept': 'application/json' },
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve((data.objects || []).map(o => ({
            name:        o.package.name,
            version:     o.package.version,
            description: o.package.description || '',
            npmUrl:      o.package.links?.npm || `https://www.npmjs.com/package/${o.package.name}`,
          })));
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// =====================================================================
// Version detail (all versions with age + provenance)
// =====================================================================

function fetchNpmVersions(pkgName) {
  return new Promise((resolve) => {
    const encodedName = pkgName.replace(/^@/, '%40').replace(/\//, '%2F');
    const empty = { name: pkgName, description: '', latest: null, versions: [], npmUrl: '' };

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
          const time   = data.time   || {};
          const latest = data['dist-tags']?.latest ?? null;

          // Sort versions by publish date descending, keep recent 20
          const versions = Object.keys(data.versions || {})
            .filter(v => time[v] && !v.includes('-'))   // skip pre-release
            .sort((a, b) => new Date(time[b]) - new Date(time[a]))
            .slice(0, 20)
            .map(v => {
              const publishedAt  = time[v] || null;
              const ageInDays    = publishedAt
                ? Math.floor((Date.now() - new Date(publishedAt)) / 86400000)
                : null;
              const provenance   = !!(data.versions[v]?.dist?.attestations);
              return { version: v, publishedAt, ageInDays, provenance, isLatest: v === latest };
            });

          resolve({
            name:        pkgName,
            description: data.description || '',
            latest,
            versions,
            npmUrl:      `https://www.npmjs.com/package/${pkgName}`,
          });
        } catch { resolve(empty); }
      });
    });
    req.on('error', () => resolve(empty));
    req.setTimeout(15000, () => { req.destroy(); resolve(empty); });
    req.end();
  });
}

// =====================================================================
// Write dependency to package.json
// =====================================================================

function writePackageJson(projectPath, pkgName, version, dev) {
  const pkgJsonPath = path.join(projectPath, 'package.json');
  let pkg = {};
  if (fs.existsSync(pkgJsonPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')); } catch {}
  }
  const key    = dev ? 'devDependencies' : 'dependencies';
  pkg[key]     = pkg[key] || {};
  pkg[key][pkgName] = `^${version}`;
  pkg[key]     = Object.fromEntries(Object.entries(pkg[key]).sort());
  fs.mkdirSync(path.dirname(pkgJsonPath), { recursive: true });
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

// =====================================================================
// Handler
// =====================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const npmCheckCache = new Map(); // key: projectPath → { result, cachedAt }

async function handleNpm(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  // GET /api/npm/search?q=<query>
  if (url.pathname === '/api/npm/search' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) { res.writeHead(400); return res.end(JSON.stringify({ error: 'q is required' })); }
    const results = await fetchNpmSearch(q);
    res.writeHead(200);
    return res.end(JSON.stringify({ results }));
  }

  // GET /api/npm/detail?name=<pkg>
  if (url.pathname === '/api/npm/detail' && req.method === 'GET') {
    const name = (url.searchParams.get('name') || '').trim();
    if (!name) { res.writeHead(400); return res.end(JSON.stringify({ error: 'name is required' })); }
    const detail = await fetchNpmVersions(name);
    res.writeHead(200);
    return res.end(JSON.stringify(detail));
  }

  // POST /api/npm/write  { projectPath, name, version, dev }
  if (url.pathname === '/api/npm/write' && req.method === 'POST') {
    return readBody(req, body => {
      try {
        const { projectPath, name, version, dev } = JSON.parse(body);
        if (!projectPath || !name || !version) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'projectPath, name, version required' }));
        }
        writePackageJson(projectPath, name, version, !!dev);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  }

  // GET /api/npm/list?path=...  ルート + 1階層下の package.json を列挙
  if (url.pathname === '/api/npm/list' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    if (!projectPath || !path.isAbsolute(projectPath)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid path' }));
    }
    const dirs = [];
    try {
      if (fs.existsSync(path.join(projectPath, 'package.json'))) {
        dirs.push({ label: '.', dir: projectPath });
      }
      for (const entry of fs.readdirSync(projectPath, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const sub = path.join(projectPath, entry.name);
        if (fs.existsSync(path.join(sub, 'package.json'))) {
          dirs.push({ label: entry.name, dir: sub });
        }
      }
    } catch {}
    res.writeHead(200);
    return res.end(JSON.stringify({ dirs }));
  }

  if (url.pathname === '/api/npm/check' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    const force       = url.searchParams.get('force') === '1';

    if (!projectPath || !path.isAbsolute(projectPath)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid path' }));
    }
    const pkgJsonPath = path.join(path.normalize(projectPath), 'package.json');

    if (!fs.existsSync(pkgJsonPath)) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'package.json not found' }));
    }

    // キャッシュヒット確認
    if (!force) {
      const cached = npmCheckCache.get(projectPath);
      if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        res.writeHead(200);
        return res.end(JSON.stringify({ ...cached.result, cached: true, cachedAt: cached.cachedAt }));
      }
    }

    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } catch {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Failed to parse package.json' }));
    }

    const allPkgs = [
      ...Object.entries(pkg.dependencies    || {}).map(([n, v]) => ({ name: n, version: normalizeVersion(v), dev: false })),
      ...Object.entries(pkg.devDependencies || {}).map(([n, v]) => ({ name: n, version: normalizeVersion(v), dev: true  })),
    ];

    if (allPkgs.length === 0) {
      res.writeHead(200);
      return res.end(JSON.stringify({ projectName: pkg.name || '', packages: [], cached: false, cachedAt: Date.now() }));
    }

    const infos   = await Promise.all(allPkgs.map(p => fetchNpmInfo(p.name, p.version)));
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
        provenance:         info.provenance          ?? null,
      };
    });

    const order = { both: 0, major: 1, minor: 2, unknown: 3, latest: 4 };
    packages.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

    const cachedAt = Date.now();
    const result   = { projectName: pkg.name || '', packages };
    npmCheckCache.set(projectPath, { result, cachedAt });

    res.writeHead(200);
    return res.end(JSON.stringify({ ...result, cached: false, cachedAt }));
  }

  // GET /api/npm/audit?path=...
  if (url.pathname === '/api/npm/audit' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    if (!projectPath || !path.isAbsolute(projectPath)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid path' }));
    }
    if (!fs.existsSync(path.join(projectPath, 'package.json'))) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'package.json not found' }));
    }

    const result = await runAudit(projectPath);
    res.writeHead(200);
    return res.end(JSON.stringify(result));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

// npm audit --json は脆弱性があると exit code 非0 を返すため、
// stdout を取得するために spawn でストリームを直接読む
function runAudit(projectPath) {
  const { spawn } = require('child_process');
  return new Promise(resolve => {
    const empty = { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0, fixAvailable: false };
    const isWin = process.platform === 'win32';
    const child = spawn(
      isWin ? 'npm.cmd' : 'npm',
      ['audit', '--json'],
      { cwd: projectPath, shell: isWin, timeout: 30000 }
    );

    let raw = '';
    child.stdout.on('data', chunk => { raw += chunk; });
    // npm audit が stderr に何か出力しても無視
    child.stderr.on('data', () => {});

    child.on('error', () => resolve({ ...empty, error: 'npm が見つかりません' }));
    child.on('close', () => {
      if (!raw) { resolve({ ...empty, error: 'npm audit の出力がありません' }); return; }
      try {
        const json = JSON.parse(raw);
        // npm audit v7+ は metadata.vulnerabilities に集計がある
        const meta = json.metadata?.vulnerabilities || {};
        const counts = {
          critical: meta.critical || 0,
          high:     meta.high     || 0,
          moderate: meta.moderate || 0,
          low:      meta.low      || 0,
          info:     meta.info     || 0,
          total:    meta.total    || 0,
        };

        // 脆弱性ごとの詳細を抽出
        // severity 順でソート: critical > high > moderate > low > info
        const SEVERITY_ORDER = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
        const vulns = json.vulnerabilities || {};
        const details = Object.values(vulns)
          .map(v => {
            // via[] はアドバイザリオブジェクト or パッケージ名文字列の混在
            let title = null, url = null;
            const viaNames = [];
            for (const item of (v.via || [])) {
              if (typeof item === 'object' && item.title) {
                if (!title) { title = item.title; url = item.url || null; }
              } else if (typeof item === 'string') {
                viaNames.push(item);
              }
            }
            return {
              name:         v.name,
              severity:     v.severity,
              isDirect:     v.isDirect,
              range:        v.range   || null,
              title,
              url,
              via:          viaNames,
              fixAvailable: v.fixAvailable,
            };
          })
          .sort((a, b) =>
            (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
          );

        resolve({ ...counts, details });
      } catch {
        resolve({ ...empty, error: 'JSON パースに失敗しました' });
      }
    });
  });
}

const MAX_BODY = 1 * 1024 * 1024; // 1MB
function readBody(req, cb) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY) req.destroy();
  });
  req.on('end', () => cb(body));
}

module.exports = { handleNpm };
