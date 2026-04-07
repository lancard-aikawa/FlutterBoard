const { handleBrowse }      = require('./folderBrowser');
const { handleProcess }     = require('./processManager');
const { handleProjectInfo } = require('./projectInfo');
const { handleMarkdown }    = require('./markdownHandler');
const { handlePubspec }     = require('./pubspecChecker');
const { handleNpm }         = require('./npmChecker');
const { handleEnv }         = require('./envManager');
const { handleGit }         = require('./gitStatus');

function handleApi(req, res, url) {
  const pathname = url.pathname;

  // CORS（ローカルのみ）
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3210');

  if (pathname === '/api/browse') {
    return handleBrowse(req, res, url);
  }

  if (pathname.startsWith('/api/process')) {
    return handleProcess(req, res, url);
  }

  if (pathname.startsWith('/api/project')) {
    return handleProjectInfo(req, res, url);
  }

  if (pathname.startsWith('/api/md')) {
    return handleMarkdown(req, res, url);
  }

  if (pathname.startsWith('/api/pubspec')) {
    return handlePubspec(req, res, url);
  }

  if (pathname.startsWith('/api/npm')) {
    return handleNpm(req, res, url);
  }

  if (pathname.startsWith('/api/env')) {
    return handleEnv(req, res, url);
  }

  if (pathname.startsWith('/api/git')) {
    return handleGit(req, res, url);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleApi };
