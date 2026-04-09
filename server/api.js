const { handleBrowse }      = require('./folderBrowser');
const { handleProcess }     = require('./processManager');
const { handleProjectInfo } = require('./projectInfo');
const { handleMarkdown }    = require('./markdownHandler');
const { handlePubspec }     = require('./pubspecChecker');
const { handleNpm }         = require('./npmChecker');
const { handleCdn }         = require('./cdnChecker');
const { handleEnv }         = require('./envManager');
const { handleGit }         = require('./gitStatus');
const { handleDevTools }    = require('./devtoolsManager');
const { handleSequence }    = require('./sequenceRunner');
const { handleContext }     = require('./contextProvider');
const { handleFirebaseEnv } = require('./firebaseEnv');
const { handleDepCompare }      = require('./depCompare');
const { handleFlutterAnalyze }  = require('./flutterAnalyze');
const { handleOsvCheck }        = require('./osvCheck');

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

  if (pathname.startsWith('/api/cdn')) {
    return handleCdn(req, res, url);
  }

  if (pathname.startsWith('/api/env')) {
    return handleEnv(req, res, url);
  }

  if (pathname.startsWith('/api/git')) {
    return handleGit(req, res, url);
  }

  if (pathname.startsWith('/api/devtools')) {
    return handleDevTools(req, res, url);
  }

  if (pathname.startsWith('/api/sequence')) {
    return handleSequence(req, res, url);
  }

  if (pathname.startsWith('/api/context')) {
    return handleContext(req, res, url);
  }

  if (pathname.startsWith('/api/firebaseenv')) {
    return handleFirebaseEnv(req, res, url);
  }

  if (pathname.startsWith('/api/depcompare')) {
    return handleDepCompare(req, res, url);
  }

  if (pathname.startsWith('/api/analyze')) {
    return handleFlutterAnalyze(req, res, url);
  }

  if (pathname.startsWith('/api/osv')) {
    return handleOsvCheck(req, res, url);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleApi };
