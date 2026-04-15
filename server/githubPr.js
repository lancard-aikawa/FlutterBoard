'use strict';
const { run } = require('./githubClient');
const { execFile } = require('child_process');

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

// ローカルブランチ一覧（PR 作成フォームの base 選択用）
function listBranches(cwd) {
  return new Promise(resolve => {
    execFile('git', ['branch', '--format=%(refname:short)'], { cwd, encoding: 'utf-8', shell: process.platform === 'win32' },
      (err, stdout) => resolve(err ? [] : stdout.trim().split('\n').filter(Boolean)));
  });
}

async function handlePr(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/github/pr/status?path=<dir>
  if (pathname === '/api/github/pr/status' && req.method === 'GET') {
    const cwd = url.searchParams.get('path');
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const [prResult, branches] = await Promise.all([
      run(['pr', 'status', '--json', 'number,title,state,url,statusCheckRollup,baseRefName,headRefName'], cwd),
      listBranches(cwd),
    ]);
    res.writeHead(prResult.ok ? 200 : 500);
    return res.end(JSON.stringify({ ...prResult, branches }));
  }

  // GET /api/github/pr/commits?path=<dir>  直前のコミット一覧（PR 本文の自動挿入用）
  if (pathname === '/api/github/pr/commits' && req.method === 'GET') {
    const cwd = url.searchParams.get('path');
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const result = await run(['log', 'HEAD...origin/HEAD', '--oneline', '--no-decorate'], cwd);
    // gh log は gh コマンドではなく git コマンドなので直接呼ぶ
    const out = await new Promise(resolve => {
      execFile('git', ['log', 'origin/HEAD..HEAD', '--oneline', '--no-decorate'],
        { cwd, encoding: 'utf-8', shell: process.platform === 'win32' },
        (err, stdout) => resolve(err ? '' : stdout.trim()));
    });
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true, data: out }));
  }

  // POST /api/github/pr/create  { path, title, base?, body? }
  if (pathname === '/api/github/pr/create' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.path || !body.title) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and title required' }));
    }
    const args = ['pr', 'create', '--title', body.title, '--body', body.body || ''];
    if (body.base) args.push('--base', body.base);
    const result = await run(args, body.path);
    res.writeHead(result.ok ? 200 : 500);
    return res.end(JSON.stringify(result));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handlePr };
