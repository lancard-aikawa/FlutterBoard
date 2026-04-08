const fs   = require('fs');
const path = require('path');

/**
 * プロジェクトフォルダを解析して情報を返す
 */
function getProjectInfo(projectPath) {
  const info = {
    path:          projectPath,
    name:          path.basename(projectPath),
    hasFlutter:    false,
    hasFirebase:   false,
    hasNodePkg:    false,
    npmScripts:    {},   // { scriptName: command }
    firebaseCmd:   null, // package.json から検出した Firebase 起動コマンド
    pinnedScripts: loadPinned(projectPath),
  };

  // pubspec.yaml があれば Flutter プロジェクト
  info.hasFlutter = fs.existsSync(path.join(projectPath, 'pubspec.yaml'));

  // firebase.json があれば Firebase プロジェクト
  info.hasFirebase = fs.existsSync(path.join(projectPath, 'firebase.json'));

  // package.json を読む
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      info.hasNodePkg  = true;
      info.npmScripts  = pkg.scripts || {};

      // Firebase 起動コマンドを scripts から自動検出
      const firebaseKey = Object.keys(info.npmScripts).find(k =>
        /firebase|emulator/i.test(k) || /firebase/.test(info.npmScripts[k])
      );
      if (firebaseKey) {
        info.firebaseCmd = { key: firebaseKey, cmd: info.npmScripts[firebaseKey] };
      }
    } catch (_) {}
  }

  return info;
}

// ピン留めスクリプトを config/pins_{hash}.json に保存
function getPinsFile(projectPath) {
  const safe = projectPath.replace(/[:\\\/]/g, '_');
  return path.join(__dirname, '..', 'config', `pins_${safe}.json`);
}

function loadPinned(projectPath) {
  try {
    return JSON.parse(fs.readFileSync(getPinsFile(projectPath), 'utf-8'));
  } catch (_) { return []; }
}

function savePinned(projectPath, pins) {
  const file = getPinsFile(projectPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(pins), 'utf-8');
}

function handleProjectInfo(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/project/info
  if (pathname === '/api/project/info' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p || !fs.existsSync(p)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid path' }));
    }
    res.writeHead(200);
    return res.end(JSON.stringify(getProjectInfo(p)));
  }

  // POST /api/project/pin  { path, script }
  if (pathname === '/api/project/pin' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
      const { path: p, script } = parsed;
      const pins = loadPinned(p);
      if (!pins.includes(script)) pins.push(script);
      savePinned(p, pins);
      res.writeHead(200);
      res.end(JSON.stringify({ pins }));
    });
  }

  // POST /api/project/unpin  { path, script }
  if (pathname === '/api/project/unpin' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
      const { path: p, script } = parsed;
      const pins = loadPinned(p).filter(s => s !== script);
      savePinned(p, pins);
      res.writeHead(200);
      res.end(JSON.stringify({ pins }));
    });
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
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

module.exports = { handleProjectInfo };
