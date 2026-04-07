const fs   = require('fs');
const path = require('path');

/**
 * プロジェクト内の .md ファイルを収集する
 * - ルート直下
 * - docs/ 以下（再帰）
 * - .git / node_modules は除外
 */
function collectMdFiles(projectPath) {
  const results = [];

  function walk(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }

    entries.forEach(e => {
      const skip = ['node_modules', '.git', '.dart_tool', 'build', '.flutter-plugins'];
      if (e.isDirectory()) {
        if (!skip.includes(e.name)) walk(path.join(dir, e.name), path.join(rel, e.name));
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        results.push({
          name:    e.name,
          relPath: path.join(rel, e.name), // 表示用相対パス
          absPath: path.join(dir, e.name),
        });
      }
    });
  }

  // ルート直下のみ（サブディレクトリは docs/ だけ再帰）
  const rootEntries = fs.readdirSync(projectPath, { withFileTypes: true });
  rootEntries.forEach(e => {
    if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      results.push({ name: e.name, relPath: e.name, absPath: path.join(projectPath, e.name) });
    }
    if (e.isDirectory() && e.name.toLowerCase() === 'docs') {
      walk(path.join(projectPath, e.name), e.name);
    }
  });

  // README.md を先頭に
  const readmeIdx = results.findIndex(f => f.name.toLowerCase() === 'readme.md' && !f.relPath.includes(path.sep));
  if (readmeIdx > 0) {
    const [readme] = results.splice(readmeIdx, 1);
    results.unshift(readme);
  }

  return results;
}

function handleMarkdown(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/md/list?path=...
  if (pathname === '/api/md/list' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p || !fs.existsSync(p)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid path' }));
    }
    const files = collectMdFiles(p);
    res.writeHead(200);
    return res.end(JSON.stringify({ files }));
  }

  // GET /api/md/file?path=...&file=...  (file は相対パス)
  if (pathname === '/api/md/file' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    const relFile     = url.searchParams.get('file');

    if (!projectPath || !relFile) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and file required' }));
    }

    const absFile = path.resolve(path.join(projectPath, relFile));

    // パストラバーサル防止
    if (!absFile.startsWith(path.resolve(projectPath))) {
      res.writeHead(403);
      return res.end(JSON.stringify({ error: 'Forbidden' }));
    }

    let content;
    try { content = fs.readFileSync(absFile, 'utf-8'); } catch (_) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'File not found' }));
    }

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    return res.end(JSON.stringify({ relPath: relFile, content }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleMarkdown };
