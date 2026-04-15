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

function currentBranch(cwd) {
  return new Promise(resolve => {
    execFile('git', ['branch', '--show-current'], { cwd, encoding: 'utf-8', shell: process.platform === 'win32' },
      (err, stdout) => resolve(err ? '' : stdout.trim()));
  });
}

async function handlePr(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/github/pr/status?path=<dir>
  if (pathname === '/api/github/pr/status' && req.method === 'GET') {
    const cwd = url.searchParams.get('path');
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const [prResult, branches, branch] = await Promise.all([
      run(['pr', 'list', '--state', 'open', '--json', 'number,title,state,url,statusCheckRollup,baseRefName,headRefName'], cwd),
      listBranches(cwd),
      currentBranch(cwd),
    ]);
    res.writeHead(prResult.ok ? 200 : 500);
    return res.end(JSON.stringify({ ...prResult, branches, currentBranch: branch }));
  }

  // GET /api/github/pr/commits?path=<dir>  直前のコミット一覧（PR 本文の自動挿入用）
  if (pathname === '/api/github/pr/commits' && req.method === 'GET') {
    const cwd = url.searchParams.get('path');
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    // デフォルトブランチを検出（origin/HEAD → origin/main → origin/master の順で試みる）
    const defaultBase = await new Promise(resolve => {
      execFile('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'],
        { cwd, encoding: 'utf-8', shell: false },
        (err, stdout) => {
          if (!err && stdout.trim()) return resolve(stdout.trim());
          execFile('git', ['rev-parse', '--verify', 'origin/main'],
            { cwd, encoding: 'utf-8', shell: false },
            (e2) => resolve(e2 ? 'origin/master' : 'origin/main'));
        });
    });

    // merge-base を基点にすることで、main が先に進んでいても正確なコミット範囲を取得
    const mergeBase = await new Promise(resolve => {
      execFile('git', ['merge-base', 'HEAD', defaultBase],
        { cwd, encoding: 'utf-8', shell: false },
        (err, stdout) => resolve(err ? null : stdout.trim()));
    });

    const rangeStart = mergeBase || defaultBase;

    // コミット数を確認
    const countStr = await new Promise(resolve => {
      execFile('git', ['rev-list', '--count', `${rangeStart}..HEAD`],
        { cwd, encoding: 'utf-8', shell: false },
        (err, stdout) => resolve(err ? '0' : stdout.trim()));
    });
    const count = parseInt(countStr, 10) || 0;

    // 1コミット → フルメッセージ / 複数 → 件名一覧
    const out = await new Promise(resolve => {
      const args = count === 1
        ? ['log', '-1', '--format=%B', 'HEAD']
        : ['log', `${rangeStart}..HEAD`, '--oneline', '--no-decorate'];
      execFile('git', args, { cwd, encoding: 'utf-8', shell: false },
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
