'use strict';
/*
 * D1: Pre-flight チェック
 *
 * テストリリース提出前に抜けがちな初歩的ミスを静的ファイル解析で検出する。
 * すべてローカルファイル読み取りのみで完結し、外部コマンド・API 呼び出しなし。
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------
// 個別チェック実装
// 各関数は { id, label, status, value, detail } を返す
// status: 'ok' | 'warn' | 'error' | 'info'
// ---------------------------------------------------------------------

function checkPubspecVersion(projectPath) {
  const id    = 'version.pubspec';
  const label = 'pubspec.yaml version';
  const file  = path.join(projectPath, 'pubspec.yaml');
  if (!fs.existsSync(file)) {
    return { id, label, status: 'error', value: null, detail: 'pubspec.yaml が見つかりません' };
  }
  const text = fs.readFileSync(file, 'utf-8');
  const m    = text.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)(?:\+([0-9]+))?/m);
  if (!m) {
    return { id, label, status: 'warn', value: null, detail: 'version フィールドが見つかりません' };
  }
  return {
    id, label, status: 'info',
    value: m[2] ? `${m[1]}+${m[2]}` : m[1],
    versionName: m[1],
    versionCode: m[2] ? parseInt(m[2], 10) : null,
  };
}

function checkAndroidGradle(projectPath) {
  const id    = 'version.androidGradle';
  const label = 'Android build.gradle';
  const kts   = path.join(projectPath, 'android', 'app', 'build.gradle.kts');
  const gvy   = path.join(projectPath, 'android', 'app', 'build.gradle');
  const file  = fs.existsSync(kts) ? kts : (fs.existsSync(gvy) ? gvy : null);
  if (!file) {
    return { id, label, status: 'info', value: null, detail: 'android/app/build.gradle[.kts] が見つかりません（Android ビルド未対応プロジェクト）' };
  }
  const text = fs.readFileSync(file, 'utf-8');

  // versionCode / versionName を抽出（リテラルまたは間接参照）
  // Groovy: versionCode 123  /  Kotlin: versionCode = 123  /  Flutter: versionCode flutter.versionCode
  const vc = text.match(/versionCode\s*=?\s*(flutter\.versionCode|[0-9]+)/);
  const vn = text.match(/versionName\s*=?\s*(flutter\.versionName|"([^"]+)")/);

  const versionCodeVal = vc ? (vc[1] === 'flutter.versionCode' ? '(pubspec 経由)' : vc[1]) : null;
  const versionNameVal = vn ? (vn[1] === 'flutter.versionName' ? '(pubspec 経由)' : (vn[2] || null)) : null;

  return {
    id, label, status: 'info',
    value: `versionCode=${versionCodeVal || '?'} / versionName=${versionNameVal || '?'}`,
    versionCode: vc && vc[1] !== 'flutter.versionCode' ? parseInt(vc[1], 10) : null,
    versionName: vn && vn[1] !== 'flutter.versionName' ? vn[2] : null,
    fromFlutter: (vc && vc[1] === 'flutter.versionCode') || (vn && vn[1] === 'flutter.versionName'),
    source: path.basename(file),
  };
}

function checkIosPlist(projectPath) {
  const id    = 'version.iosPlist';
  const label = 'iOS Info.plist';
  const file  = path.join(projectPath, 'ios', 'Runner', 'Info.plist');
  if (!fs.existsSync(file)) {
    return { id, label, status: 'info', value: null, detail: 'ios/Runner/Info.plist が見つかりません（iOS ビルド未対応プロジェクト）' };
  }
  const text = fs.readFileSync(file, 'utf-8');
  const cfv  = text.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/);
  const cfsv = text.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);

  const vcRaw = cfv ? cfv[1].trim() : null;
  const vnRaw = cfsv ? cfsv[1].trim() : null;

  // $(FLUTTER_BUILD_NUMBER) などのプレースホルダは pubspec 由来
  const isPlaceholder = s => !!s && /^\$\(/.test(s);

  return {
    id, label, status: 'info',
    value: `CFBundleVersion=${vcRaw || '?'} / Short=${vnRaw || '?'}`,
    versionCode: vcRaw && !isPlaceholder(vcRaw) ? parseInt(vcRaw, 10) : null,
    versionName: vnRaw && !isPlaceholder(vnRaw) ? vnRaw : null,
    fromFlutter: isPlaceholder(vcRaw) || isPlaceholder(vnRaw),
  };
}

function checkVersionConsistency(pub, andr, ios) {
  const id    = 'version.consistency';
  const label = 'バージョン整合性（pubspec / Android / iOS）';

  // リテラル値だけで比較する（Flutter 経由はすべて pubspec と同期されるため除外）
  const literals = {
    pubspec: { code: pub.versionCode, name: pub.versionName },
    android: { code: andr.versionCode, name: andr.versionName },
    ios:     { code: ios.versionCode,  name: ios.versionName },
  };
  const mismatches = [];
  const codes = [literals.pubspec.code, literals.android.code, literals.ios.code].filter(v => v !== null && v !== undefined);
  const names = [literals.pubspec.name, literals.android.name, literals.ios.name].filter(v => v);

  if (codes.length > 1 && new Set(codes).size > 1) {
    mismatches.push(`versionCode 不一致: pubspec=${literals.pubspec.code} / android=${literals.android.code} / ios=${literals.ios.code}`);
  }
  if (names.length > 1 && new Set(names).size > 1) {
    mismatches.push(`versionName 不一致: pubspec=${literals.pubspec.name} / android=${literals.android.name} / ios=${literals.ios.name}`);
  }

  if (mismatches.length === 0) {
    const allFromFlutter = andr.fromFlutter && ios.fromFlutter;
    return {
      id, label, status: 'ok',
      value: allFromFlutter ? 'Android/iOS ともに pubspec 由来（Flutter 標準構成）' : '整合性 OK',
    };
  }
  return { id, label, status: 'warn', value: '不一致あり', detail: mismatches.join('\n') };
}

function checkAndroidSigning(projectPath) {
  const id    = 'signing.release';
  const label = 'Android release 署名設定';
  const kts   = path.join(projectPath, 'android', 'app', 'build.gradle.kts');
  const gvy   = path.join(projectPath, 'android', 'app', 'build.gradle');
  const file  = fs.existsSync(kts) ? kts : (fs.existsSync(gvy) ? gvy : null);
  if (!file) {
    return { id, label, status: 'info', value: null, detail: 'build.gradle[.kts] が見つかりません' };
  }
  const text = fs.readFileSync(file, 'utf-8');

  // release { ... } ブロック内の signingConfig を検出
  const releaseBlock = text.match(/release\s*\{([\s\S]*?)\n\s*\}/);
  if (!releaseBlock) {
    return { id, label, status: 'warn', value: null, detail: 'buildTypes.release ブロックが見つかりません' };
  }
  const block = releaseBlock[1];

  // debug 署名が使われていないか（Flutter scaffold のプレースホルダ定番）
  if (/signingConfig\s*=?\s*signingConfigs\.(?:getByName\()?["]?debug["]?\)?/.test(block)) {
    return {
      id, label, status: 'error',
      value: 'debug 署名のまま',
      detail: 'release ビルドが debug 鍵で署名されます。signingConfigs.release を用意して差し替えてください。',
    };
  }

  if (/signingConfig\s*=?\s*signingConfigs\.(?:getByName\()?["]?release["]?\)?/.test(block)) {
    return { id, label, status: 'ok', value: 'signingConfigs.release 使用' };
  }

  return { id, label, status: 'warn', value: '判定できず', detail: 'release ブロック内に signingConfig の明示的な指定が見当たりません。build.gradle を確認してください。' };
}

function checkApplicationId(projectPath) {
  const id    = 'app.applicationId';
  const label = 'applicationId';
  const kts   = path.join(projectPath, 'android', 'app', 'build.gradle.kts');
  const gvy   = path.join(projectPath, 'android', 'app', 'build.gradle');
  const file  = fs.existsSync(kts) ? kts : (fs.existsSync(gvy) ? gvy : null);
  if (!file) return { id, label, status: 'info', value: null, detail: 'build.gradle[.kts] が見つかりません' };

  const text = fs.readFileSync(file, 'utf-8');
  const m    = text.match(/applicationId\s*=?\s*"([^"]+)"/);
  if (!m) return { id, label, status: 'warn', value: null, detail: 'applicationId が見つかりません' };

  const appId = m[1];
  // com.example.* はテンプレート残しの可能性が高い
  if (appId.startsWith('com.example.')) {
    return {
      id, label, status: 'warn', value: appId,
      detail: 'テンプレート既定の com.example.* のままです。本番用パッケージ ID に変更してください。',
    };
  }
  return { id, label, status: 'info', value: appId };
}

function countPrintStatements(projectPath) {
  const id    = 'debug.prints';
  const label = 'print / debugPrint 残存';
  const libDir = path.join(projectPath, 'lib');
  if (!fs.existsSync(libDir)) {
    return { id, label, status: 'info', value: null, detail: 'lib/ ディレクトリが見つかりません' };
  }

  const hits = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.dart')) continue;
      let text; try { text = fs.readFileSync(full, 'utf-8'); } catch { continue; }
      text.split('\n').forEach((line, i) => {
        // コメント行はスキップ（簡易判定: 行頭が // なら飛ばす）
        if (/^\s*\/\//.test(line)) return;
        if (/\b(print|debugPrint)\s*\(/.test(line)) {
          hits.push({ file: path.relative(projectPath, full).replace(/\\/g, '/'), line: i + 1, text: line.trim() });
        }
      });
    }
  }
  walk(libDir);

  if (hits.length === 0) {
    return { id, label, status: 'ok', value: '0 件' };
  }
  return {
    id, label, status: 'warn',
    value: `${hits.length} 件の出現`,
    detail: hits.slice(0, 20).map(h => `${h.file}:${h.line}  ${h.text}`).join('\n') + (hits.length > 20 ? `\n… 他 ${hits.length - 20} 件` : ''),
    count: hits.length,
  };
}

// ---------------------------------------------------------------------
// オーケストレーション
// ---------------------------------------------------------------------

function runAllChecks(projectPath) {
  const pub  = checkPubspecVersion(projectPath);
  const andr = checkAndroidGradle(projectPath);
  const ios  = checkIosPlist(projectPath);
  const cons = checkVersionConsistency(pub, andr, ios);
  const sig  = checkAndroidSigning(projectPath);
  const app  = checkApplicationId(projectPath);
  const prn  = countPrintStatements(projectPath);

  return {
    project: projectPath,
    runAt:   new Date().toISOString(),
    checks:  [pub, andr, ios, cons, sig, app, prn],
  };
}

// ---------------------------------------------------------------------
// HTTP ハンドラ
// ---------------------------------------------------------------------

async function handlePreflight(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/api/preflight/check' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end(JSON.stringify({ error: 'project not found' })); }

    try {
      const result = runAllChecks(p);
      res.writeHead(200);
      return res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: String(e) }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handlePreflight };
