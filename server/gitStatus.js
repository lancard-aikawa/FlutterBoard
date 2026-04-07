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

  // GET /api/git/status?path=...
  if (pathname === '/api/git/status' && req.method === 'GET') {
    const cwd = url.searchParams.get('path');
    if (!cwd) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'path required' }));
    }

    // 並列取得
    const [branch, porcelain, logRaw, stashRaw] = await Promise.all([
      git(['branch', '--show-current'], cwd),
      git(['status', '--porcelain'], cwd),
      git(['log', '--format=%H|%h|%s|%an|%ar', '-15'], cwd),
      git(['stash', 'list', '--format=%gd: %s'], cwd),
    ]);

    if (branch === null && porcelain === null) {
      // git リポジトリでない
      res.writeHead(200);
      return res.end(JSON.stringify({ isGit: false }));
    }

    const changes = parsePorcelain(porcelain);
    const commits = parseLog(logRaw);
    const stashes = stashRaw ? stashRaw.split('\n').filter(Boolean) : [];

    const summary = {
      staged:    changes.filter(c => c.staged).length,
      unstaged:  changes.filter(c => !c.staged && c.status !== 'untracked').length,
      untracked: changes.filter(c => c.status === 'untracked').length,
    };

    res.writeHead(200);
    return res.end(JSON.stringify({
      isGit: true,
      branch: branch || '(detached HEAD)',
      changes,
      summary,
      commits,
      stashes,
    }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleGit };
