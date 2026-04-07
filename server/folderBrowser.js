const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadHistory, saveHistory } = require('./history');

// Windows のドライブ一覧を取得
function getWindowsDrives() {
  const drives = [];
  for (let i = 65; i <= 90; i++) {
    const drive = String.fromCharCode(i) + ':\\';
    try {
      fs.accessSync(drive);
      drives.push({ name: drive, type: 'drive', path: drive });
    } catch (_) {}
  }
  return drives;
}

function handleBrowse(req, res, url) {
  const reqPath = url.searchParams.get('path');
  const action  = url.searchParams.get('action'); // 'select' でプロジェクト確定

  res.setHeader('Content-Type', 'application/json');

  // プロジェクト選択確定
  if (action === 'select' && reqPath) {
    const normalized = path.normalize(reqPath);
    if (!fs.existsSync(normalized) || !fs.statSync(normalized).isDirectory()) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid path' }));
    }
    saveHistory(normalized);
    res.writeHead(200);
    return res.end(JSON.stringify({ selected: normalized }));
  }

  // ルート: ドライブ一覧 (Windows) or ホーム (その他)
  if (!reqPath) {
    if (os.platform() === 'win32') {
      res.writeHead(200);
      return res.end(JSON.stringify({ path: '', entries: getWindowsDrives() }));
    } else {
      return handleBrowse(req, res, new URL(`?path=${os.homedir()}`, url));
    }
  }

  const normalized = path.normalize(reqPath);

  // パストラバーサル的な不正パスを簡易チェック
  if (normalized.includes('..')) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'Invalid path' }));
  }

  let entries;
  try {
    entries = fs.readdirSync(normalized, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        type: 'dir',
        path: path.join(normalized, e.name),
      }));
  } catch (err) {
    res.writeHead(403);
    return res.end(JSON.stringify({ error: 'Cannot read directory' }));
  }

  const parent = path.dirname(normalized) !== normalized ? path.dirname(normalized) : null;

  res.writeHead(200);
  res.end(JSON.stringify({
    path: normalized,
    parent,
    entries,
    history: loadHistory(),
  }));
}

module.exports = { handleBrowse };
