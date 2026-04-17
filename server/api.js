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
const { handleRoutine }    = require('./routineRunner');
const { handleContext }     = require('./contextProvider');
const { handleFirebaseEnv } = require('./firebaseEnv');
const { handleDepCompare }      = require('./depCompare');
const { handleFlutterAnalyze }  = require('./flutterAnalyze');
const { handleOsvCheck }        = require('./osvCheck');
const { handleDepsTree }        = require('./depsTree');
const { handlePortMonitor }     = require('./portMonitor');
const { handleFvmInfo }         = require('./fvmInfo');
const { handleBuildSize }       = require('./buildSize');
const { handleEmuSnapshot }     = require('./emuSnapshot');
const { handleGithub }          = require('./github');
const { handleBuildRunner }     = require('./buildRunner');
const { handleLockDiff }        = require('./lockDiff');
const { handleCmdHistory }      = require('./cmdHistory');
const { handleTestRunner }     = require('./testRunner');

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

  if (pathname.startsWith('/api/github')) {
    return handleGithub(req, res, url);
  }

  if (pathname.startsWith('/api/git')) {
    return handleGit(req, res, url);
  }

  if (pathname.startsWith('/api/devtools')) {
    return handleDevTools(req, res, url);
  }

  if (pathname.startsWith('/api/routine')) {
    return handleRoutine(req, res, url);
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

  if (pathname.startsWith('/api/deps-tree')) {
    return handleDepsTree(req, res, url);
  }

  if (pathname.startsWith('/api/ports')) {
    return handlePortMonitor(req, res, url);
  }

  if (pathname.startsWith('/api/fvm')) {
    return handleFvmInfo(req, res, url);
  }

  if (pathname.startsWith('/api/buildsize')) {
    return handleBuildSize(req, res, url);
  }

  if (pathname.startsWith('/api/emusnapshot')) {
    return handleEmuSnapshot(req, res, url);
  }

  if (pathname.startsWith('/api/build-runner')) {
    return handleBuildRunner(req, res, url);
  }

  if (pathname.startsWith('/api/lock-diff')) {
    return handleLockDiff(req, res, url);
  }

  if (pathname.startsWith('/api/history')) {
    return handleCmdHistory(req, res, url);
  }

  if (pathname.startsWith('/api/test')) {
    return handleTestRunner(req, res, url);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleApi };
