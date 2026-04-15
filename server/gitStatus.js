const { execFile } = require('child_process');

// =====================================================================
// git コマンド実行ユーティリティ
// =====================================================================

function git(args, cwd) {
  return new Promise(resolve => {
    execFile('git', args, { cwd, encoding: 'utf-8', timeout: 8000 }, (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout.trim());
    });
  });
}

function gitDetail(args, cwd) {
  return new Promise(resolve => {
    execFile('git', args, { cwd, encoding: 'utf-8', timeout: 15000 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, stderr: (stderr || err.message || '').trim() });
      else     resolve({ ok: true,  stdout: stdout.trim() });
    });
  });
}

// =====================================================================
// git status パーサー（--porcelain 形式）
// =====================================================================
// 例: "M  src/main.dart"  " M lib/app.dart"  "?? newfile.dart"
const STATUS_LABEL = {
  'M': 'modified',
  'A': 'added',
  'D': 'deleted',
  'R': 'renamed',
  'C': 'copied',
  'U': 'unmerged',
  '?': 'untracked',
  '!': 'ignored',
};

function parsePorcelain(output) {
  if (!output) return [];
  return output.split('\n').filter(Boolean).map(line => {
    const x    = line[0]; // staged
    const y    = line[1]; // unstaged
    const file = line.slice(3);
    const staged   = x !== ' ' && x !== '?';
    const unstaged = y !== ' ';
    const code     = (x === '?' ? '?' : (staged ? x : y));
    return {
      file,
      status:   STATUS_LABEL[code] || code,
      staged,
      unstaged,
    };
  });
}

// =====================================================================
// git log パーサー
// =====================================================================
// --format="%H|%h|%s|%an|%ar" で区切り文字列として取得
function parseLog(output) {
  if (!output) return [];
  return output.split('\n').filter(Boolean).map(line => {
    const [hash, short, subject, author, relDate] = line.split('|');
    return { hash, short, subject, author, relDate };
  });
}

// =====================================================================
// ハンドラー
// =====================================================================

async function handleGit(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/git/status?path=...&logOffset=0&logLimit=20
  if (pathname === '/api/git/status' && req.method === 'GET') {
    const cwd       = url.searchParams.get('path');
    const logOffset = parseInt(url.searchParams.get('logOffset') || '0', 10);
    const logLimit  = parseInt(url.searchParams.get('logLimit')  || '20', 10);
    if (!cwd) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path required' }));
    }

    // 並列取得
    const [branch, porcelain, logRaw, stashRaw, totalRaw, aheadBehindRaw] = await Promise.all([
      git(['branch', '--show-current'], cwd),
      git(['status', '--porcelain'], cwd),
      git(['log', `--format=%H|%h|%s|%an|%ar`, `--skip=${logOffset}`, `-${logLimit}`], cwd),
      git(['stash', 'list', '--format=%gd: %s'], cwd),
      git(['rev-list', '--count', 'HEAD'], cwd),
      git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], cwd),
    ]);

    if (branch === null && porcelain === null) {
      res.writeHead(200);
      return res.end(JSON.stringify({ isGit: false }));
    }

    const changes      = parsePorcelain(porcelain);
    const commits      = parseLog(logRaw);
    const stashes      = stashRaw ? stashRaw.split('\n').filter(Boolean) : [];
    const totalCommits = totalRaw ? parseInt(totalRaw, 10) : 0;

    // ahead/behind: "N\tM" → ahead=N, behind=M（リモートなし時は null）
    let ahead = null, behind = null;
    if (aheadBehindRaw) {
      const [a, b] = aheadBehindRaw.trim().split(/\s+/).map(Number);
      if (!isNaN(a) && !isNaN(b)) { ahead = a; behind = b; }
    }

    const summary = {
      staged:    changes.filter(c => c.staged).length,
      unstaged:  changes.filter(c => !c.staged && c.status !== 'untracked').length,
      untracked: changes.filter(c => c.status === 'untracked').length,
    };

    res.writeHead(200);
    return res.end(JSON.stringify({
      isGit: true,
      branch: branch || '(detached HEAD)',
      ahead,
      behind,
      changes,
      summary,
      commits,
      totalCommits,
      logOffset,
      logLimit,
      stashes,
    }));
  }

  // GET /api/git/commit?path=...&hash=...
  if (pathname === '/api/git/commit' && req.method === 'GET') {
    const cwd  = url.searchParams.get('path');
    const hash = url.searchParams.get('hash');
    if (!cwd || !hash) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and hash required' }));
    }
    if (!/^[0-9a-f]{4,64}$/i.test(hash)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Invalid hash format' }));
    }

    const [detail, statRaw] = await Promise.all([
      git(['show', '--format=%H%n%an%n%ae%n%ad%n%B', '--no-patch', hash], cwd),
      git(['show', '--stat', '--format=', hash], cwd),
    ]);

    if (!detail) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'Commit not found' }));
    }

    const lines   = detail.split('\n');
    const fullHash = lines[0] || hash;
    const author   = lines[1] || '';
    const email    = lines[2] || '';
    const date     = lines[3] || '';
    const body     = lines.slice(4).join('\n').trim();

    // stat の最終行: "N files changed, X insertions(+), Y deletions(-)"
    const statLines  = statRaw ? statRaw.split('\n').filter(Boolean) : [];
    const statSummary = statLines.length ? statLines[statLines.length - 1].trim() : '';
    const fileStats   = statLines.slice(0, -1).map(l => l.trim());

    res.writeHead(200);
    return res.end(JSON.stringify({ fullHash, author, email, date, body, statSummary, fileStats }));
  }

  // GET /api/git/diff?path=...&file=...&staged=0
  if (pathname === '/api/git/diff' && req.method === 'GET') {
    const cwd    = url.searchParams.get('path');
    const file   = url.searchParams.get('file');
    const staged = url.searchParams.get('staged') === '1';
    if (!cwd || !file) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and file required' }));
    }

    // staged: git diff --cached, unstaged: git diff, untracked: git diff /dev/null
    let diffArgs;
    if (staged) {
      diffArgs = ['diff', '--cached', '--', file];
    } else {
      diffArgs = ['diff', 'HEAD', '--', file];
    }

    const diffOut = await git(diffArgs, cwd);
    res.writeHead(200);
    return res.end(JSON.stringify({ diff: diffOut || '' }));
  }

  // POST /api/git/stage  { path, file? }  — file 省略時は git add -A
  if (pathname === '/api/git/stage' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: cwd, file } = body;
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const args = file ? ['add', '--', file] : ['add', '-A'];
    const out  = await git(args, cwd);
    res.writeHead(out === null ? 500 : 200);
    return res.end(JSON.stringify(out === null ? { error: 'git add failed' } : { ok: true }));
  }

  // POST /api/git/unstage  { path, file? }
  if (pathname === '/api/git/unstage' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: cwd, file } = body;
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const args = file ? ['restore', '--staged', '--', file] : ['restore', '--staged', '.'];
    const out  = await git(args, cwd);
    res.writeHead(out === null ? 500 : 200);
    return res.end(JSON.stringify(out === null ? { error: 'git restore failed' } : { ok: true }));
  }

  // POST /api/git/do-commit  { path, message }
  if (pathname === '/api/git/do-commit' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: cwd, message } = body;
    if (!cwd || !message?.trim()) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path and message required' }));
    }
    const out = await git(['commit', '-m', message.trim()], cwd);
    res.writeHead(out === null ? 500 : 200);
    return res.end(JSON.stringify(out === null ? { error: 'git commit failed' } : { ok: true, output: out }));
  }

  // POST /api/git/push  { path }
  if (pathname === '/api/git/push' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: cwd } = body;
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const out = await git(['push'], cwd);
    res.writeHead(out === null ? 500 : 200);
    return res.end(JSON.stringify(out === null ? { error: 'git push failed' } : { ok: true, output: out }));
  }

  // POST /api/git/pull  { path }
  if (pathname === '/api/git/pull' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: cwd } = body;
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const out = await git(['pull'], cwd);
    res.writeHead(out === null ? 500 : 200);
    return res.end(JSON.stringify(out === null ? { error: 'git pull failed' } : { ok: true, output: out }));
  }

  // POST /api/git/checkout  { path, branch }
  if (pathname === '/api/git/checkout' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: cwd, branch } = body;
    if (!cwd || !branch) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path and branch required' })); }
    const r = await gitDetail(['checkout', branch], cwd);
    res.writeHead(r.ok ? 200 : 500);
    return res.end(JSON.stringify(r.ok ? { ok: true } : { error: r.stderr }));
  }

  // POST /api/git/merge  { path, branch }
  if (pathname === '/api/git/merge' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: cwd, branch } = body;
    if (!cwd || !branch) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path and branch required' })); }
    const r = await gitDetail(['merge', branch], cwd);
    res.writeHead(r.ok ? 200 : 500);
    return res.end(JSON.stringify(r.ok ? { ok: true } : { error: r.stderr }));
  }

  // POST /api/git/stash-pop  { path, ref }
  if (pathname === '/api/git/stash-pop' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: cwd, ref } = body;
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const args = ref ? ['stash', 'pop', ref] : ['stash', 'pop'];
    const r = await gitDetail(args, cwd);
    res.writeHead(r.ok ? 200 : 500);
    return res.end(JSON.stringify(r.ok ? { ok: true } : { error: r.stderr }));
  }

  // POST /api/git/stash-apply  { path, ref }
  if (pathname === '/api/git/stash-apply' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: cwd, ref } = body;
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const args = ref ? ['stash', 'apply', ref] : ['stash', 'apply'];
    const r = await gitDetail(args, cwd);
    res.writeHead(r.ok ? 200 : 500);
    return res.end(JSON.stringify(r.ok ? { ok: true } : { error: r.stderr }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

module.exports = { handleGit };
