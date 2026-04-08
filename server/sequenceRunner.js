'use strict';
const fs   = require('fs');
const path = require('path');

function getSeqFile(projectPath) {
  const safe = projectPath.replace(/[:\\/]/g, '_');
  return path.join(__dirname, '..', 'config', `seq_${safe}.json`);
}

function loadSeqs(projectPath) {
  try { return JSON.parse(fs.readFileSync(getSeqFile(projectPath), 'utf-8')); }
  catch (_) { return []; }
}

function saveSeqs(projectPath, seqs) {
  const file = getSeqFile(projectPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(seqs, null, 2), 'utf-8');
}

function handleSequence(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/sequence/list?path=...
  if (pathname === '/api/sequence/list' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    res.writeHead(200);
    return res.end(JSON.stringify(loadSeqs(p)));
  }

  // POST /api/sequence/save  { path, sequences }
  if (pathname === '/api/sequence/save' && req.method === 'POST') {
    return readBody(req, body => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
      const { path: p, sequences } = parsed;
      if (!p || !Array.isArray(sequences)) {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'path and sequences required' }));
      }
      saveSeqs(p, sequences);
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    });
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

const MAX_BODY = 1 * 1024 * 1024;
function readBody(req, cb) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY) req.destroy();
  });
  req.on('end', () => cb(body));
}

module.exports = { handleSequence };
