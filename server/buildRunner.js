'use strict';
const fs   = require('fs');
const path = require('path');

// lib/ 以下を再帰的に走査して .g.dart / .freezed.dart を収集
function scanGeneratedFiles(dir) {
  const results = [];
  function walk(current) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile() && (e.name.endsWith('.g.dart') || e.name.endsWith('.freezed.dart'))) {
        const stat = fs.statSync(full);
        results.push({ file: full, mtime: stat.mtimeMs });
      }
    }
  }
  walk(dir);
  return results;
}

async function handleBuildRunner(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/build-runner/files?path=<dir>
  if (pathname === '/api/build-runner/files' && req.method === 'GET') {
    const projectPath = url.searchParams.get('path');
    if (!projectPath) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    const libDir = path.join(projectPath, 'lib');
    if (!fs.existsSync(libDir)) {
      res.writeHead(200);
      return res.end(JSON.stringify({ files: [] }));
    }

    const files = scanGeneratedFiles(libDir).map(f => ({
      file:  path.relative(projectPath, f.file).replace(/\\/g, '/'),
      mtime: f.mtime,
    }));
    files.sort((a, b) => a.file.localeCompare(b.file));

    res.writeHead(200);
    return res.end(JSON.stringify({ files }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleBuildRunner };
