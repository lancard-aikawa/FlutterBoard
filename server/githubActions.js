'use strict';
const { run } = require('./githubClient');

async function handleActions(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/github/actions/runs?path=<dir>
  if (pathname === '/api/github/actions/runs' && req.method === 'GET') {
    const cwd = url.searchParams.get('path');
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const result = await run(
      ['run', 'list', '--limit', '5', '--json', 'status,conclusion,name,workflowName,url,createdAt,headBranch'],
      cwd
    );
    res.writeHead(result.ok ? 200 : 500);
    return res.end(JSON.stringify(result));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleActions };
