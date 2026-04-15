'use strict';
const { handleIssues }  = require('./githubIssues');
const { handlePr }      = require('./githubPr');
const { handleActions } = require('./githubActions');
const { checkGhAvailable, checkIsGithub } = require('./githubClient');

// gh 可用性キャッシュ（再起動までキャッシュ）
let ghAvailableCache = null;

async function handleGithub(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/github/status?path=<dir>
  // gh の可用性 + GitHub リモートかどうかを返す
  if (pathname === '/api/github/status' && req.method === 'GET') {
    const cwd = url.searchParams.get('path');
    if (ghAvailableCache === null) {
      ghAvailableCache = await checkGhAvailable();
    }
    const ghAvailable = ghAvailableCache;
    const isGithub = cwd ? await checkIsGithub(cwd) : false;
    res.writeHead(200);
    return res.end(JSON.stringify({ ghAvailable, isGithub }));
  }

  if (pathname.startsWith('/api/github/issues')) return handleIssues(req, res, url);
  if (pathname.startsWith('/api/github/pr'))     return handlePr(req, res, url);
  if (pathname.startsWith('/api/github/actions')) return handleActions(req, res, url);

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleGithub };
