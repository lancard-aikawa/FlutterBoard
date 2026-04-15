'use strict';
const { run } = require('./githubClient');

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

async function handleIssues(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/github/issues/list?path=<dir>
  if (pathname === '/api/github/issues/list' && req.method === 'GET') {
    const cwd = url.searchParams.get('path');
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const result = await run(
      ['issue', 'list', '--limit', '10', '--json', 'number,title,state,url'],
      cwd
    );
    res.writeHead(result.ok ? 200 : 500);
    return res.end(JSON.stringify(result));
  }

  // POST /api/github/issues/create  { path, title, body? }
  if (pathname === '/api/github/issues/create' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.path || !body.title) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and title required' }));
    }
    const args = ['issue', 'create', '--title', body.title, '--body', body.body || ''];
    const result = await run(args, body.path);
    res.writeHead(result.ok ? 200 : 500);
    return res.end(JSON.stringify(result));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleIssues };
