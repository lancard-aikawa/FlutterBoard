'use strict';

// =====================================================================
// フォルダブラウザ
// =====================================================================

const pathInput        = document.getElementById('path-input');
const openBtn          = document.getElementById('open-btn');
const breadcrumb       = document.getElementById('breadcrumb');
const folderList       = document.getElementById('folder-list');
const historyList      = document.getElementById('history-list');
const currentLabel     = document.getElementById('current-project');
const projectPanel     = document.getElementById('project-panel');
const dashboard        = document.getElementById('dashboard');
const changeProjectBtn = document.getElementById('change-project-btn');

let currentProjectPath = '';

async function browse(dirPath) {
  const url = dirPath
    ? `/api/browse?path=${encodeURIComponent(dirPath)}`
    : '/api/browse';
  const res  = await fetch(url);
  const data = await res.json();

  pathInput.value = data.path || '';
  renderBreadcrumb(data.path || '');
  renderFolderList(data);
  renderHistory(data.history || []);
}

function renderBreadcrumb(fullPath) {
  breadcrumb.innerHTML = '';
  if (!fullPath) return;

  // Windows パス対応: C:\Repos\app → ['C:', 'Repos', 'app']
  const sep   = fullPath.includes('\\') ? '\\' : '/';
  const parts = fullPath.split(sep).filter(Boolean);
  let   accum = '';

  parts.forEach((part, i) => {
    accum += (i === 0 ? part : sep + part);

    const span = document.createElement('span');
    span.className   = 'bc-part';
    span.textContent = part;
    const capPath    = accum;
    span.onclick     = () => browse(capPath);
    breadcrumb.appendChild(span);

    if (i < parts.length - 1) {
      const s = document.createElement('span');
      s.className   = 'bc-sep';
      s.textContent = ` ${sep} `;
      breadcrumb.appendChild(s);
    }
  });
}

function renderFolderList(data) {
  folderList.innerHTML = '';

  if (data.parent !== null && data.parent !== undefined) {
    const li     = document.createElement('li');
    li.className = 'up';
    li.textContent = '📁 .. （上へ）';
    li.onclick   = () => browse(data.parent);
    folderList.appendChild(li);
  }

  if (!data.entries || data.entries.length === 0) {
    const li     = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'サブフォルダなし';
    folderList.appendChild(li);
    return;
  }

  data.entries.forEach(entry => {
    const li       = document.createElement('li');
    li.textContent = `📁 ${entry.name}`;
    li.onclick     = () => browse(entry.path);
    folderList.appendChild(li);
  });
}

function renderHistory(history) {
  historyList.innerHTML = '';
  if (history.length === 0) {
    historyList.innerHTML = '<li style="color:var(--muted);font-size:.8rem;padding:.3rem .5rem">履歴なし</li>';
    return;
  }
  history.forEach(item => {
    const li   = document.createElement('li');
    const date = new Date(item.lastOpened).toLocaleDateString('ja-JP');
    li.innerHTML = `
      <div>
        <div class="hist-name">📂 ${escHtml(item.name)}</div>
        <div class="hist-path">${escHtml(item.path)}</div>
      </div>
      <span class="hist-date">${date}</span>`;
    li.onclick = () => selectProject(item.path);
    historyList.appendChild(li);
  });
}

async function selectProject(projectPath) {
  const res  = await fetch(`/api/browse?path=${encodeURIComponent(projectPath)}&action=select`);
  const data = await res.json();
  if (data.error) { alert(data.error); return; }

  currentProjectPath = data.selected;
  currentLabel.textContent = data.selected;
  projectPanel.classList.add('hidden');
  dashboard.classList.remove('hidden');
  loadProjectInfo(data.selected);
  loadMdList(data.selected);
  loadEnvList(data.selected);
  loadGitStatus();
}

openBtn.onclick = () => {
  const p = pathInput.value.trim();
  if (p) selectProject(p);
};
pathInput.addEventListener('keydown', e => { if (e.key === 'Enter') openBtn.click(); });
changeProjectBtn.onclick = () => {
  dashboard.classList.add('hidden');
  projectPanel.classList.remove('hidden');
  browse('');
};

// =====================================================================
// タブ切り替え
// =====================================================================

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    if (tab.dataset.tab === 'git') loadGitStatus();
  });
});

// =====================================================================
// プロセス管理
// =====================================================================

const cmdInput    = document.getElementById('cmd-input');
const labelInput  = document.getElementById('label-input');
const runBtn      = document.getElementById('run-btn');
const processList = document.getElementById('process-list');
const logOutput   = document.getElementById('log-output');
const logTitle    = document.getElementById('log-title');
const logClear    = document.getElementById('log-clear');
const autoscroll  = document.getElementById('autoscroll');

// activeId: 現在ログを表示中のプロセスID
let activeId  = null;
let activeSSE = null;

// ---- プロセス起動 ----
runBtn.onclick = async () => {
  const rawCmd = cmdInput.value.trim();
  if (!rawCmd) return;

  const parts = rawCmd.split(/\s+/);
  const cmd   = parts[0];
  const args  = parts.slice(1);
  const label = labelInput.value.trim() || rawCmd;

  const res  = await fetch('/api/process/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, cmd, args, cwd: currentProjectPath }),
  });
  const data = await res.json();
  if (data.error) { alert(data.error); return; }

  cmdInput.value   = '';
  labelInput.value = '';
  refreshProcessList(data.id); // 起動直後に新プロセスを選択
};
cmdInput.addEventListener('keydown', e => { if (e.key === 'Enter') runBtn.click(); });

// ---- プロセス一覧を更新 ----
async function refreshProcessList(selectId) {
  const res  = await fetch('/api/process/list');
  const list = await res.json();

  processList.innerHTML = '';
  list.forEach(p => {
    const li = buildProcessItem(p);
    processList.appendChild(li);
  });

  // 指定IDがあればそれを選択、なければ activeId を維持
  const targetId = selectId ?? activeId;
  if (targetId !== null && list.find(p => p.id === targetId)) {
    selectProcess(targetId, list.find(p => p.id === targetId).label);
  }
}

function buildProcessItem(p) {
  const li = document.createElement('li');
  li.className = 'proc-item' + (p.id === activeId ? ' active' : '');
  li.dataset.id = p.id;

  const dotClass = p.running ? 'running' : (p.exitCode !== 0 ? 'error' : 'exited');
  const elapsed  = formatElapsed(p.startedAt);

  li.innerHTML = `
    <div class="proc-top">
      <span class="proc-dot ${dotClass}"></span>
      <span class="proc-label" title="${escHtml(p.label)}">${escHtml(p.label)}</span>
      <span class="proc-actions">
        ${p.running
          ? `<button class="btn-stop" data-id="${p.id}">■</button>`
          : `<button class="btn-remove" data-id="${p.id}">✕</button>`}
      </span>
    </div>
    <div class="proc-meta">${elapsed}</div>`;

  li.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    selectProcess(p.id, p.label);
  });

  li.querySelector('.btn-stop, .btn-remove').addEventListener('click', async e => {
    e.stopPropagation();
    const id  = parseInt(e.target.dataset.id);
    const api = p.running ? '/api/process/stop' : '/api/process/remove';
    await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (activeId === id && !p.running) {
      activeId  = null;
      activeSSE = null;
      logOutput.innerHTML = '<span class="log-muted">← プロセスを選択するとログが表示されます</span>';
      logTitle.textContent = 'ログを表示するプロセスを選択';
    }
    refreshProcessList(null);
  });

  return li;
}

// ---- プロセス選択 → SSE接続 ----
function selectProcess(id, label) {
  if (activeSSE) { activeSSE.close(); activeSSE = null; }

  activeId = id;
  logTitle.textContent = label;
  logOutput.innerHTML  = '';

  // アクティブ表示を更新
  document.querySelectorAll('.proc-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === id);
  });

  const sse = new EventSource(`/api/process/stream?id=${id}`);
  activeSSE = sse;

  sse.onmessage = e => {
    const { type, data } = JSON.parse(e.data);
    appendLog(type, data);
  };
  sse.onerror = () => {
    // プロセス終了後は SSE が切れる — 一覧を再取得
    sse.close();
    refreshProcessList(null);
  };
}

function appendLog(type, text) {
  const span       = document.createElement('span');
  span.className   = `log-${type}`;
  span.textContent = text;
  logOutput.appendChild(span);

  if (autoscroll.checked) {
    logOutput.scrollTop = logOutput.scrollHeight;
  }
}

logClear.onclick = () => { logOutput.innerHTML = ''; };

// =====================================================================
// コマンドランナー（フェーズ3）
// =====================================================================

let projectInfo = null;

async function loadProjectInfo(projectPath) {
  const res  = await fetch(`/api/project/info?path=${encodeURIComponent(projectPath)}`);
  projectInfo = await res.json();

  // npm プロジェクト名
  const nameEl = document.getElementById('npm-project-name');
  nameEl.textContent = projectInfo.hasNodePkg ? `(${projectInfo.name})` : '';

  renderNpmScripts();
}

function renderNpmScripts() {
  const grid      = document.getElementById('npm-grid');
  const pinnedDiv = document.getElementById('npm-pinned');
  const pinnedGrid= document.getElementById('pinned-grid');

  if (!projectInfo || !projectInfo.hasNodePkg) {
    grid.innerHTML = '<span class="cmd-empty">package.json が見つかりません</span>';
    pinnedDiv.classList.add('hidden');
    return;
  }

  const scripts = projectInfo.npmScripts;
  const pinned  = projectInfo.pinnedScripts || [];

  // ピン留めエリア
  pinnedGrid.innerHTML = '';
  if (pinned.length > 0) {
    pinnedDiv.classList.remove('hidden');
    pinned.forEach(name => {
      pinnedGrid.appendChild(buildNpmBtn(name, scripts[name] || name, pinned, true));
    });
  } else {
    pinnedDiv.classList.add('hidden');
  }

  // 全スクリプト
  grid.innerHTML = '';
  const entries = Object.entries(scripts);
  if (entries.length === 0) {
    grid.innerHTML = '<span class="cmd-empty">scripts なし</span>';
    return;
  }
  entries.forEach(([name]) => {
    grid.appendChild(buildNpmBtn(name, `npm run ${name}`, pinned, false));
  });
}

function buildNpmBtn(name, cmd, pinned, isPinnedSection) {
  const btn = document.createElement('button');
  btn.className = 'cmd-btn' + (pinned.includes(name) && !isPinnedSection ? ' pinned' : '');

  const isPinned = pinned.includes(name);
  btn.innerHTML = `${escHtml(name)}<span class="pin-icon" title="${isPinned ? 'ピン解除' : 'ピン留め'}">${isPinned ? '★' : '☆'}</span>`;

  // コマンド実行（ラベル部分クリック）
  btn.addEventListener('click', e => {
    if (e.target.classList.contains('pin-icon')) return;
    runCommand(cmd, name);
    // ログタブに切り替え
    document.querySelector('.tab[data-tab="logs"]').click();
  });

  // ピン留めトグル
  btn.querySelector('.pin-icon').addEventListener('click', async e => {
    e.stopPropagation();
    const isPinned = pinned.includes(name);
    const api = isPinned ? '/api/project/unpin' : '/api/project/pin';
    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentProjectPath, script: name }),
    });
    const data = await res.json();
    projectInfo.pinnedScripts = data.pins;
    renderNpmScripts();
  });

  return btn;
}

// プリセットコマンドボタン（Flutter / Firebase）
document.querySelectorAll('.cmd-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('click', () => {
    runCommand(btn.dataset.cmd, btn.dataset.label);
    document.querySelector('.tab[data-tab="logs"]').click();
  });
});

async function runCommand(cmd, label) {
  const parts = cmd.split(/\s+/);
  const res = await fetch('/api/process/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: label || cmd,
      cmd:   parts[0],
      args:  parts.slice(1),
      cwd:   currentProjectPath,
    }),
  });
  const data = await res.json();
  if (data.error) { alert(data.error); return; }
  refreshProcessList(data.id);
}

// =====================================================================
// ドキュメントビューア（フェーズ4）
// =====================================================================

const docsFileList  = document.getElementById('docs-file-list');
const docsBody      = document.getElementById('docs-body');
const docsBreadcrumb= document.getElementById('docs-breadcrumb');

let currentDocFile = null;

// marked.js + highlight.js の設定（CDN 読み込み後に実行）
function setupMarked() {
  if (typeof marked === 'undefined') return;
  marked.setOptions({
    highlight: (code, lang) => {
      if (typeof hljs === 'undefined') return code;
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
    gfm:    true,
    breaks: false,
  });
}

async function loadMdList(projectPath) {
  const res  = await fetch(`/api/md/list?path=${encodeURIComponent(projectPath)}`);
  const data = await res.json();
  renderMdFileList(data.files || []);

  // README.md を自動表示
  const readme = (data.files || []).find(f => f.name.toLowerCase() === 'readme.md');
  if (readme) loadMdFile(readme.relPath, readme.name);
}

function renderMdFileList(files) {
  docsFileList.innerHTML = '';

  // ディレクトリごとにグループ化
  const groups = {};
  files.forEach(f => {
    const parts = f.relPath.replace(/\\/g, '/').split('/');
    const dir   = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(f);
  });

  Object.entries(groups).forEach(([dir, groupFiles]) => {
    if (dir) {
      const sep = document.createElement('li');
      sep.className   = 'docs-dir';
      sep.textContent = `📁 ${dir}`;
      docsFileList.appendChild(sep);
    }
    groupFiles.forEach(f => {
      const li = document.createElement('li');
      li.textContent   = `📄 ${f.name}`;
      li.title         = f.relPath;
      li.dataset.rel   = f.relPath;
      li.classList.toggle('active', f.relPath === currentDocFile);
      li.onclick = () => loadMdFile(f.relPath, f.name);
      docsFileList.appendChild(li);
    });
  });
}

async function loadMdFile(relPath, name) {
  currentDocFile = relPath;

  // サイドバーのアクティブ表示更新
  document.querySelectorAll('#docs-file-list li[data-rel]').forEach(li => {
    li.classList.toggle('active', li.dataset.rel === relPath);
  });

  docsBreadcrumb.textContent = relPath.replace(/\\/g, ' / ');
  docsBody.innerHTML = '<span class="log-muted">読み込み中...</span>';

  const res  = await fetch(
    `/api/md/file?path=${encodeURIComponent(currentProjectPath)}&file=${encodeURIComponent(relPath)}`
  );
  const data = await res.json();
  if (data.error) {
    docsBody.innerHTML = `<span class="log-stderr">エラー: ${escHtml(data.error)}</span>`;
    return;
  }

  setupMarked();
  const html = typeof marked !== 'undefined'
    ? marked.parse(data.content)
    : `<pre>${escHtml(data.content)}</pre>`;

  docsBody.innerHTML = html;

  // Markdown 内リンクをインターセプト（.md リンクはビューア内で開く）
  docsBody.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href && !href.startsWith('http') && href.endsWith('.md')) {
      a.addEventListener('click', e => {
        e.preventDefault();
        // 相対パスを現在ファイルのディレクトリから解決
        const base    = relPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
        const target  = base ? `${base}/${href}` : href;
        loadMdFile(target, href.split('/').pop());
      });
    }
  });

  // highlight.js で再描画
  if (typeof hljs !== 'undefined') {
    docsBody.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
  }
}

// =====================================================================
// 依存チェック（フェーズ5）
// =====================================================================

const depsProjectName = document.getElementById('deps-project-name');
const depsStatus      = document.getElementById('deps-status');
const depsTbody       = document.getElementById('deps-tbody');
const depsRefreshBtn  = document.getElementById('deps-refresh-btn');
const depsPubgetBtn   = document.getElementById('deps-pubget-btn');
const depsUpgradeBtn  = document.getElementById('deps-upgrade-btn');

depsRefreshBtn.onclick = () => checkDeps();
depsPubgetBtn.onclick  = () => { runCommand('flutter pub get', 'pub get'); document.querySelector('.tab[data-tab="logs"]').click(); };
depsUpgradeBtn.onclick = () => { runCommand('flutter pub upgrade', 'pub upgrade'); document.querySelector('.tab[data-tab="logs"]').click(); };

async function checkDeps() {
  if (!currentProjectPath) { alert('プロジェクトを選択してください'); return; }

  depsStatus.textContent = '⏳ pub.dev に問い合わせ中...';
  depsTbody.innerHTML = `<tr><td colspan="5" class="deps-empty">読み込み中...</td></tr>`;
  depsRefreshBtn.disabled = true;

  try {
    const res  = await fetch(`/api/pubspec/check?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();

    if (data.error) {
      depsStatus.textContent = `⚠ ${data.error}`;
      depsTbody.innerHTML = `<tr><td colspan="5" class="deps-empty">${escHtml(data.error)}</td></tr>`;
      return;
    }

    depsProjectName.textContent = data.projectName ? `${data.projectName}` : '';
    renderDepsTable(data.packages);

    const major = data.packages.filter(p => p.status === 'major').length;
    const minor = data.packages.filter(p => p.status === 'minor').length;
    const total = data.packages.length;
    depsStatus.textContent =
      `✓ ${total}件チェック完了 — MAJOR: ${major}件  minor: ${minor}件`;
  } catch (e) {
    depsStatus.textContent = `エラー: ${e.message}`;
  } finally {
    depsRefreshBtn.disabled = false;
  }
}

function renderDepsTable(packages) {
  depsTbody.innerHTML = '';
  if (!packages || packages.length === 0) {
    depsTbody.innerHTML = `<tr><td colspan="5" class="deps-empty">パッケージなし</td></tr>`;
    return;
  }

  packages.forEach(p => {
    const tr = document.createElement('tr');

    const statusLabel = {
      latest:  '✓ 最新',
      minor:   '↑ minor',
      major:   '⚠ MAJOR',
      unknown: '— 不明',
    }[p.status] || '—';

    const badgeClass = `badge badge-${p.status}`;
    const current = p.current ?? '—';
    const latest  = p.latest  ?? '—';
    const arrow   = (p.status !== 'latest' && p.latest) ? `→ ${escHtml(latest)}` : escHtml(latest);

    tr.innerHTML = `
      <td>${escHtml(p.name)}</td>
      <td>${escHtml(current)}</td>
      <td>${arrow}</td>
      <td><span class="${badgeClass}">${statusLabel}</span></td>
      <td>${p.dev ? '<span class="badge badge-dev">dev</span>' : ''}</td>`;
    depsTbody.appendChild(tr);
  });
}

// =====================================================================
// 環境変数マネージャー（フェーズ6）
// =====================================================================

const envFileList  = document.getElementById('env-file-list');
const envFileLabel = document.getElementById('env-file-label');
const envTbody     = document.getElementById('env-tbody');
const revealToggle = document.getElementById('reveal-toggle');

let currentEnvFile    = null;
let currentEnvEntries = [];

async function loadEnvList(projectPath) {
  const res  = await fetch(`/api/env/list?path=${encodeURIComponent(projectPath)}`);
  const data = await res.json();
  renderEnvFileList(data.files || []);
}

function renderEnvFileList(files) {
  envFileList.innerHTML = '';
  if (files.length === 0) {
    const li = document.createElement('li');
    li.className   = 'env-none';
    li.textContent = '.env ファイルなし';
    envFileList.appendChild(li);
    return;
  }
  files.forEach(name => {
    const li = document.createElement('li');
    li.textContent = name;
    li.classList.toggle('active', name === currentEnvFile);
    li.onclick = () => loadEnvFile(name);
    envFileList.appendChild(li);
  });
}

async function loadEnvFile(fileName) {
  currentEnvFile = fileName;
  document.querySelectorAll('#env-file-list li').forEach(li => {
    li.classList.toggle('active', li.textContent === fileName);
  });

  envFileLabel.textContent = fileName;
  envTbody.innerHTML = `<tr><td colspan="3" class="deps-empty">読み込み中...</td></tr>`;

  const res  = await fetch(
    `/api/env/file?path=${encodeURIComponent(currentProjectPath)}&file=${encodeURIComponent(fileName)}`
  );
  const data = await res.json();
  if (data.error) {
    envTbody.innerHTML = `<tr><td colspan="3" class="deps-empty">${escHtml(data.error)}</td></tr>`;
    return;
  }
  currentEnvEntries = data.entries;
  renderEnvTable();
}

function renderEnvTable() {
  envTbody.innerHTML = '';
  const reveal = revealToggle.checked;

  if (currentEnvEntries.length === 0) {
    envTbody.innerHTML = `<tr><td colspan="3" class="deps-empty">エントリなし</td></tr>`;
    return;
  }

  currentEnvEntries.forEach(({ key, value, sensitive }) => {
    const tr = document.createElement('tr');
    const displayValue = (sensitive && !reveal)
      ? `<span class="env-value-masked">••••••••</span>`
      : `<span class="env-value-plain">${escHtml(value)}</span>`;
    const badge = sensitive
      ? `<span class="env-sensitive-badge">機密</span>`
      : '';

    tr.innerHTML = `
      <td class="env-key">${escHtml(key)}</td>
      <td>${displayValue}</td>
      <td>${badge}</td>`;
    envTbody.appendChild(tr);
  });
}

revealToggle.addEventListener('change', renderEnvTable);

// =====================================================================
// Git ステータス（フェーズ7）
// =====================================================================

const gitBranch       = document.getElementById('git-branch');
const gitSummary      = document.getElementById('git-summary');
const gitStashList    = document.getElementById('git-stash-list');
const gitChangesList  = document.getElementById('git-changes-list');
const gitChangesCount = document.getElementById('git-changes-count');
const gitLogList      = document.getElementById('git-log-list');
const gitRefreshBtn   = document.getElementById('git-refresh-btn');

gitRefreshBtn.onclick = () => loadGitStatus();

async function loadGitStatus() {
  if (!currentProjectPath) return;

  gitBranch.textContent    = '読み込み中...';
  gitSummary.innerHTML     = '';
  gitChangesList.innerHTML = '';
  gitLogList.innerHTML     = '';

  const res  = await fetch(`/api/git/status?path=${encodeURIComponent(currentProjectPath)}`);
  const data = await res.json();

  if (!data.isGit) {
    gitBranch.textContent = '（git リポジトリではありません）';
    gitBranch.style.color = 'var(--muted)';
    return;
  }
  gitBranch.style.color = '';

  // ブランチ
  gitBranch.textContent = `⎇ ${data.branch}`;

  // サマリー
  gitSummary.innerHTML = `
    <div class="git-summary-row">
      <span>ステージ済み</span>
      <span class="count count-staged">${data.summary.staged}</span>
    </div>
    <div class="git-summary-row">
      <span>未ステージ</span>
      <span class="count count-unstaged">${data.summary.unstaged}</span>
    </div>
    <div class="git-summary-row">
      <span>未追跡</span>
      <span class="count count-untrack">${data.summary.untracked}</span>
    </div>`;

  // スタッシュ
  gitStashList.innerHTML = '';
  if (data.stashes.length === 0) {
    gitStashList.innerHTML = '<li class="git-no-stash">なし</li>';
  } else {
    data.stashes.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      li.title = s;
      gitStashList.appendChild(li);
    });
  }

  // 変更ファイル
  gitChangesCount.textContent = data.changes.length ? `${data.changes.length}件` : '';
  gitChangesList.innerHTML = '';
  if (data.changes.length === 0) {
    gitChangesList.innerHTML = '<li class="git-empty">変更なし（クリーン）</li>';
  } else {
    data.changes.forEach(c => {
      const cssCls = { modified:'gs-modified', added:'gs-added', deleted:'gs-deleted',
                       renamed:'gs-renamed', untracked:'gs-untracked' }[c.status] || 'gs-other';
      const label  = { modified:'M', added:'A', deleted:'D', renamed:'R', untracked:'?' }[c.status] || '?';
      const dot    = c.staged ? '<span class="git-staged-dot" title="ステージ済み"></span>' : '';
      const li     = document.createElement('li');
      li.innerHTML = `
        <span class="git-status-badge ${cssCls}">${label}</span>
        ${dot}
        <span>${escHtml(c.file)}</span>`;
      gitChangesList.appendChild(li);
    });
  }

  // コミット履歴
  gitLogList.innerHTML = '';
  if (data.commits.length === 0) {
    gitLogList.innerHTML = '<li class="git-empty">コミットなし</li>';
  } else {
    data.commits.forEach(c => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="git-hash">${escHtml(c.short)}</span>
        <span class="git-subject" title="${escHtml(c.subject)}">${escHtml(c.subject)}</span>
        <span class="git-date">${escHtml(c.relDate)}</span>`;
      gitLogList.appendChild(li);
    });
  }
}

// =====================================================================
// ユーティリティ
// =====================================================================

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatElapsed(startedAt) {
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  if (sec < 60)   return `${sec}秒前に起動`;
  if (sec < 3600) return `${Math.floor(sec / 60)}分前に起動`;
  return `${Math.floor(sec / 3600)}時間前に起動`;
}

// プロセス一覧を定期更新（起動時間の表示を更新するため）
setInterval(() => {
  if (!dashboard.classList.contains('hidden')) refreshProcessList(null);
}, 10000);

// =====================================================================
// 初期ロード
// =====================================================================
browse('');
