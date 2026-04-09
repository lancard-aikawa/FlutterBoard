'use strict';
const fs    = require('fs');
const path  = require('path');
const https = require('https');

// =====================================================================
// OSV.dev API クライアント
// =====================================================================

function httpsPost(hostname, urlPath, body, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const data    = JSON.stringify(body);
    const options = {
      hostname,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout,
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('OSV API timeout')); });
    req.write(data);
    req.end();
  });
}

// =====================================================================
// pubspec.lock パーサー
// =====================================================================
// hosted パッケージのみ返す（git/path/sdk は除外）
function parsePubspecLock(content) {
  const pkgs  = [];
  const lines = content.split(/\r?\n/);
  let current = null;
  let inPkgs  = false;

  for (const line of lines) {
    if (line.trimEnd() === 'packages:') { inPkgs = true; continue; }
    if (!inPkgs) continue;
    if (line.trimEnd() === 'sdks:') break;

    const pkgM = line.match(/^  (\w[\w_-]*):\s*$/);
    if (pkgM) { current = { name: pkgM[1] }; pkgs.push(current); continue; }

    if (current) {
      const verM = line.match(/^\s+version:\s+"([^"]+)"/);
      if (verM) current.version = verM[1];
      const srcM = line.match(/^\s+source:\s+(\w+)/);
      if (srcM) current.source = srcM[1];
    }
  }

  return pkgs.filter(p => p.version && p.source === 'hosted');
}

// =====================================================================
// pubspec.yaml 簡易パーサー（lock が無い場合のフォールバック）
// =====================================================================
function parsePubspecYaml(content) {
  const pkgs    = [];
  const lines   = content.split(/\r?\n/);
  let inSection = false;

  for (const line of lines) {
    if (/^(dependencies|dev_dependencies):/.test(line)) { inSection = true; continue; }
    if (inSection && /^\S/.test(line) && !line.startsWith(' ')) { inSection = false; }
    if (!inSection) continue;

    const m = line.match(/^  ([\w_-]+):\s*[\^~>=<]*(\d[\d.]*)/);
    if (m) pkgs.push({ name: m[1], version: m[2].trim(), source: 'hosted' });
  }
  return pkgs;
}

// =====================================================================
// 重要度マッピング（CVSS スコア → ラベル）
// =====================================================================
function severityLabel(vulnObj) {
  // severity 配列から CVSS スコアを取得
  const severities = vulnObj.severity || [];
  for (const s of severities) {
    const score = parseFloat(s.score);
    if (!isNaN(score)) {
      if (score >= 9.0) return 'CRITICAL';
      if (score >= 7.0) return 'HIGH';
      if (score >= 4.0) return 'MEDIUM';
      return 'LOW';
    }
  }
  // database_specific などから severity 文字列を探す
  const db = vulnObj.database_specific?.severity || '';
  if (db) return db.toUpperCase();
  return 'UNKNOWN';
}

// CVE/GHSA の代表 URL
function vulnUrl(vulnObj) {
  const id = vulnObj.id || '';
  if (id.startsWith('GHSA-')) return `https://github.com/advisories/${id}`;
  if (id.startsWith('CVE-'))  return `https://www.cve.org/CVERecord?id=${id}`;
  return `https://osv.dev/vulnerability/${id}`;
}

// =====================================================================
// メイン: OSV.dev バッチ照会
// =====================================================================
async function checkOsv(projectPath) {
  // pubspec.lock を優先、なければ pubspec.yaml
  const lockFile = path.join(projectPath, 'pubspec.lock');
  const yamlFile = path.join(projectPath, 'pubspec.yaml');

  let packages = [];
  let sourceFile = '';

  if (fs.existsSync(lockFile)) {
    packages   = parsePubspecLock(fs.readFileSync(lockFile, 'utf-8'));
    sourceFile = 'pubspec.lock';
  } else if (fs.existsSync(yamlFile)) {
    packages   = parsePubspecYaml(fs.readFileSync(yamlFile, 'utf-8'));
    sourceFile = 'pubspec.yaml';
  } else {
    return { error: 'pubspec.yaml / pubspec.lock が見つかりません', results: [] };
  }

  if (packages.length === 0) {
    return { sourceFile, checkedCount: 0, results: [] };
  }

  // OSV.dev querybatch
  const queries = packages.map(p => ({
    package: { name: p.name, ecosystem: 'Pub' },
    version: p.version,
  }));

  let osvResp;
  try {
    osvResp = await httpsPost('api.osv.dev', '/v1/querybatch', { queries });
  } catch (e) {
    return { error: `OSV.dev API エラー: ${e.message}`, results: [] };
  }

  if (!osvResp?.results) {
    return { error: 'OSV.dev から予期しないレスポンス', results: [] };
  }

  // 結果をパッケージに紐づけ
  const results = [];
  for (let i = 0; i < packages.length; i++) {
    const pkg   = packages[i];
    const vulns = osvResp.results[i]?.vulns || [];
    if (vulns.length === 0) continue;

    for (const v of vulns) {
      results.push({
        package:  pkg.name,
        version:  pkg.version,
        id:       v.id,
        aliases:  (v.aliases || []).filter(a => a.startsWith('CVE-')),
        summary:  v.summary || v.details?.slice(0, 120) || '',
        severity: severityLabel(v),
        url:      vulnUrl(v),
      });
    }
  }

  // severity 順ソート
  const ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };
  results.sort((a, b) => (ORDER[a.severity] ?? 5) - (ORDER[b.severity] ?? 5));

  return {
    sourceFile,
    checkedCount: packages.length,
    totalVulns:   results.length,
    results,
  };
}

// =====================================================================
// HTTP ハンドラー
// =====================================================================
async function handleOsvCheck(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/api/osv/check' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    const result = await checkOsv(p);
    res.writeHead(200);
    return res.end(JSON.stringify(result));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleOsvCheck };
