'use strict';
/*
 * D3: リリースノート自動生成
 *
 * 最新タグ以降のコミットを取得し、Conventional Commits と
 * プロジェクト独自の prefix（T3: / R4: 等）を分類して Markdown を生成する。
 */

const { execFile } = require('child_process');
const path         = require('path');
const fs           = require('fs');

function runGit(args, cwd, timeout = 15000) {
  return new Promise(resolve => {
    execFile('git', args, { cwd, encoding: 'utf-8', timeout, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: stderr || err.message });
        resolve({ ok: true, out: stdout });
      });
  });
}

// Conventional Commits + プロジェクト独自 prefix の分類
function classifyCommit(subject) {
  const s = subject.trim();

  // 1) Conventional Commits
  const cc = s.match(/^(feat|feature|fix|bug|bugfix|perf|docs|refactor|style|test|chore|build|ci|revert)(\([^)]+\))?!?:\s*(.+)$/i);
  if (cc) {
    const type = cc[1].toLowerCase();
    const body = cc[3];
    if (type === 'feat' || type === 'feature')          return { category: 'feat',    body };
    if (type === 'fix' || type === 'bug' || type === 'bugfix') return { category: 'fix', body };
    if (type === 'perf')                                return { category: 'feat',    body, note: 'perf' };
    if (type === 'revert')                              return { category: 'other',   body };
    return { category: 'chore', body, type };
  }

  // 2) プロジェクト独自 prefix（T3: / R4: / G1: / S5: など大文字英字 + 数字 + コロン）
  const proj = s.match(/^([A-Z]+\d+):\s*(.+)$/);
  if (proj) {
    return { category: 'feat', body: proj[2], note: proj[1] };
  }

  // 3) その他
  return { category: 'other', body: s };
}

function generateMarkdown(commits, opts) {
  const feat  = [];
  const fix   = [];
  const other = [];

  for (const c of commits) {
    const { category, body, note } = classifyCommit(c.subject);
    const tagPrefix = note ? ` [${note}]` : '';
    const line = `- ${body}${tagPrefix}`;
    if (category === 'feat')       feat.push(line);
    else if (category === 'fix')   fix.push(line);
    else                            other.push(line);
  }

  const sections = [];
  const header = opts.from
    ? `## リリースノート（${opts.from} → ${opts.to || 'HEAD'}）`
    : `## リリースノート（${commits.length} 件のコミット）`;
  sections.push(header);
  sections.push('');

  if (feat.length > 0) {
    sections.push('### ✨ 新機能 / 改善');
    sections.push(...feat);
    sections.push('');
  }
  if (fix.length > 0) {
    sections.push('### 🐛 修正');
    sections.push(...fix);
    sections.push('');
  }
  if (other.length > 0 && opts.includeOther !== false) {
    sections.push('### 🔧 その他');
    sections.push(...other);
    sections.push('');
  }

  if (feat.length === 0 && fix.length === 0 && (other.length === 0 || opts.includeOther === false)) {
    sections.push('_対象コミットがありません。_');
  }

  return sections.join('\n').trim() + '\n';
}

// ---------------------------------------------------------------------
// ハンドラ群
// ---------------------------------------------------------------------

async function listTags(cwd) {
  const r = await runGit(['tag', '--sort=-creatordate'], cwd);
  if (!r.ok) return { tags: [], error: r.error };
  const tags = r.out.split('\n').map(s => s.trim()).filter(Boolean);
  return { tags };
}

async function collectCommits(cwd, fromTag) {
  // %H = full hash, %s = subject, %an = author name, %aI = ISO date
  // 区切り文字は制御文字で安全に分離
  const range = fromTag ? `${fromTag}..HEAD` : 'HEAD';
  const r = await runGit(
    ['log', range, '--no-merges', '--pretty=format:%H%x1f%s%x1f%an%x1f%aI'],
    cwd
  );
  if (!r.ok) return { commits: [], error: r.error };

  const commits = r.out.split('\n').filter(Boolean).map(line => {
    const [hash, subject, author, date] = line.split('\x1f');
    return { hash, subject, author, date };
  });
  return { commits };
}

async function handleReleaseNotes(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  const cwd = url.searchParams.get('path');
  if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    res.writeHead(400); return res.end(JSON.stringify({ error: 'git リポジトリではありません' }));
  }

  // GET /api/releasenotes/tags
  if (url.pathname === '/api/releasenotes/tags' && req.method === 'GET') {
    const r = await listTags(cwd);
    res.writeHead(200);
    return res.end(JSON.stringify(r));
  }

  // GET /api/releasenotes/generate?from=<tag>&includeOther=1
  if (url.pathname === '/api/releasenotes/generate' && req.method === 'GET') {
    const fromTag       = url.searchParams.get('from') || '';
    const includeOther  = url.searchParams.get('includeOther') !== '0';

    let effectiveFrom = fromTag;
    if (!effectiveFrom) {
      const tr = await listTags(cwd);
      if (tr.tags && tr.tags.length > 0) effectiveFrom = tr.tags[0];
    }

    const cr = await collectCommits(cwd, effectiveFrom || null);
    if (cr.error) {
      res.writeHead(500);
      return res.end(JSON.stringify({ error: cr.error }));
    }

    const markdown = generateMarkdown(cr.commits, {
      from: effectiveFrom || null,
      to: 'HEAD',
      includeOther,
    });

    res.writeHead(200);
    return res.end(JSON.stringify({
      from:     effectiveFrom || null,
      to:       'HEAD',
      count:    cr.commits.length,
      commits:  cr.commits,
      markdown,
    }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleReleaseNotes };
