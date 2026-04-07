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
const logSave     = document.getElementById('log-save');
const logFilter   = document.getElementById('log-filter');
const autoscroll  = document.getElementById('autoscroll');
const autoreload  = document.getElementById('autoreload');
const stdinBar    = document.getElementById('stdin-bar');
const stdinInput  = document.getElementById('stdin-input');
const stdinSend   = document.getElementById('stdin-send');

let activeId    = null;
let activeSSE   = null;
let logBuffer   = [];

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
  refreshProcessList(data.id);
};
cmdInput.addEventListener('keydown', e => { if (e.key === 'Enter') runBtn.click(); });

// ---- プロセス一覧を更新（最短 500ms 間隔のスロットル） ----
const REFRESH_MIN_MS = 500;
let _refreshLastAt  = 0;
let _refreshTimer   = null;
let _refreshPending = null; // 保留中の selectId

function refreshProcessList(selectId) {
  // 保留中のリクエストがあれば selectId を上書き（最新を優先）
  if (_refreshTimer) {
    // null means "list-only update" — don't overwrite a real pending selectId
    _refreshPending = selectId ?? _refreshPending;
    return;
  }
  const elapsed = Date.now() - _refreshLastAt;
  if (elapsed >= REFRESH_MIN_MS) {
    // 前回から十分経過 → 即実行
    _doRefresh(selectId);
  } else {
    // 間隔が短すぎる → 残り時間後に実行
    _refreshPending = selectId;
    _refreshTimer = setTimeout(() => {
      _refreshTimer = null;
      const sid = _refreshPending;
      _refreshPending = null;
      _doRefresh(sid);
    }, REFRESH_MIN_MS - elapsed);
  }
}

async function _doRefresh(selectId) {
  _refreshLastAt = Date.now();
  const res  = await fetch('/api/process/list');
  const list = await res.json();

  processList.innerHTML = '';
  list.forEach(p => processList.appendChild(buildProcessItem(p)));

  // selectId=null means "update list UI only" — do NOT re-open SSE via selectProcess
  if (selectId != null) {
    const target = list.find(p => p.id === selectId);
    if (target) selectProcess(target.id, target.label, target.running);
  }
}

function buildProcessItem(p) {
  const li = document.createElement('li');
  li.className  = 'proc-item' + (p.id === activeId ? ' active' : '');
  li.dataset.id = p.id;

  const dotClass  = p.running ? 'running' : (p.exitCode !== 0 ? 'error' : 'exited');
  const elapsed   = formatElapsed(p.startedAt);
  const ptyBadge  = p.pty ? '<span class="pty-badge">PTY</span>' : '';

  li.innerHTML = `
    <div class="proc-top">
      <span class="proc-dot ${dotClass}"></span>
      <span class="proc-label" title="${escHtml(p.label)}">${escHtml(p.label)}${ptyBadge}</span>
      <span class="proc-actions">
        ${p.running
          ? `<button class="btn-stop">■</button>`
          : `<button class="btn-remove">✕</button>`}
      </span>
    </div>
    <div class="proc-meta">${elapsed}</div>`;

  li.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    selectProcess(p.id, p.label, p.running);
  });

  li.querySelector('.btn-stop, .btn-remove').addEventListener('click', async e => {
    e.stopPropagation();
    const id  = p.id;  // closure value — e.target が親要素になる場合を避ける
    const api = p.running ? '/api/process/stop' : '/api/process/remove';
    await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (activeId === id) {
      if (activeSSE) { activeSSE.close(); activeSSE = null; }  // SSE を明示的に閉じる
      activeId = null; logBuffer = [];
      logOutput.innerHTML  = '<span class="log-muted">Select a process to view logs</span>';
      logTitle.textContent = 'Select a process to view logs';
      logTitle.classList.remove('exited');
      stdinBar.classList.add('hidden');
    }
    refreshProcessList(null);
  });

  return li;
}

// ---- プロセス選択 → SSE接続 ----
function selectProcess(id, label, running) {
  if (activeSSE) { activeSSE.close(); activeSSE = null; }

  activeId  = id;
  logBuffer = [];
  logOutput.innerHTML = '';
  logTitle.textContent = label;
  logTitle.classList.remove('exited');
  logFilter.value = '';
  logFilter.classList.remove('active');

  document.querySelectorAll('.proc-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === id);
  });

  // stdin バーは実行中のみ表示
  stdinBar.classList.toggle('hidden', !running);

  const sse = new EventSource(`/api/process/stream?id=${id}`);
  activeSSE = sse;
  let exited = false; // 二重発火防止フラグ

  sse.onmessage = e => {
    const { type, data } = JSON.parse(e.data);
    logBuffer.push({ type, data });
    appendLogEntry(type, data);

    if (type === 'exit') {
      exited = true;
      autoscroll.checked = false;
      autoreload.checked = false;
      logTitle.classList.add('exited');
      stdinBar.classList.add('hidden');
      // stdin バーが隠れたら activeId はそのまま（ログは引き続き閲覧可）
      sse.close();
      activeSSE = null;
      refreshProcessList(null);  // ドット色・ボタンを exited に更新
    }
  };
  sse.onerror = () => {
    if (exited) return;  // exit イベント処理済み → 二重更新防止
    // プロセスが即終了して SSE が 404 を返した場合もここに来る
    sse.close();
    activeSSE = null;
    // サーバー側の最新状態を取得して UI を同期
    refreshProcessList(null);
  };
}

// ---- ログ表示 ----
function appendLogEntry(type, text) {
  const keyword = logFilter.value.trim().toLowerCase();
  const span    = document.createElement('span');
  span.className   = `log-${type}`;
  span.textContent = text;

  if (keyword && !text.toLowerCase().includes(keyword)) {
    span.classList.add('log-filtered-hidden');
  }

  logOutput.appendChild(span);
  if (autoscroll.checked) logOutput.scrollTop = logOutput.scrollHeight;
}

// ---- フィルター ----
logFilter.addEventListener('input', () => {
  const keyword = logFilter.value.trim().toLowerCase();
  logFilter.classList.toggle('active', keyword.length > 0);

  logOutput.querySelectorAll('span[class^="log-"]').forEach(span => {
    const hidden = keyword && !span.textContent.toLowerCase().includes(keyword);
    span.classList.toggle('log-filtered-hidden', hidden);
  });
});

// ---- ログ保存 ----
logSave.onclick = () => {
  if (activeId !== null) {
    // サーバー側バッファからダウンロード（タイムスタンプ付き）
    window.open(`/api/process/log?id=${activeId}`, '_blank');
  }
};

// ---- ログクリア ----
logClear.onclick = () => { logOutput.innerHTML = ''; logBuffer = []; };

// ---- stdin ----

// "\x03" のような文字列リテラルを実際の制御文字に変換
function parseCtrlChar(str) {
  return str.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

// Ctrl+C ボタン
document.querySelector('.stdin-ctrl-btn').addEventListener('click', () => {
  sendStdin(parseCtrlChar('\x03'));
});

// Ctrl セレクト + Send
document.getElementById('stdin-ctrl-send').addEventListener('click', () => {
  const val = document.getElementById('stdin-ctrl-select').value;
  if (val) sendStdin(parseCtrlChar(val));
});

// クイックキー
document.querySelectorAll('.stdin-key').forEach(btn => {
  btn.addEventListener('click', () => sendStdin(btn.dataset.key + '\n'));
});

// 自由入力
stdinSend.onclick = () => { sendStdin(stdinInput.value); stdinInput.value = ''; };
stdinInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { sendStdin(stdinInput.value); stdinInput.value = ''; }
});

async function sendStdin(text) {
  if (activeId === null || !text) return;
  const res  = await fetch('/api/process/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: activeId, text }),
  });
  const data = await res.json();
  if (!data.ok) console.warn('stdin write failed:', data.error);
}

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
  const pinnedGrid= document.getElementById('pinned-grid');

  if (!projectInfo || !projectInfo.hasNodePkg) {
    grid.innerHTML = '<span class="cmd-empty">package.json が見つかりません</span>';
    document.getElementById('npm-pinned-row').style.display = 'none';
    return;
  }

  const scripts = projectInfo.npmScripts;
  const pinned  = projectInfo.pinnedScripts || [];

  // ピン留めエリア
  pinnedGrid.innerHTML = '';
  const pinnedRow = document.getElementById('npm-pinned-row');
  if (pinned.length > 0) {
    pinnedRow.style.display = '';
    pinned.forEach(name => {
      pinnedGrid.appendChild(buildNpmBtn(name, scripts[name] || name, pinned, true));
    });
  } else {
    pinnedRow.style.display = 'none';
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
// 依存チェック（フェーズ5 + サプライチェーンセキュリティ）
// =====================================================================

const depsProjectName  = document.getElementById('deps-project-name');
const depsStatus       = document.getElementById('deps-status');
const depsTbody        = document.getElementById('deps-tbody');
const depsRefreshBtn   = document.getElementById('deps-refresh-btn');
const depsPubgetBtn    = document.getElementById('deps-pubget-btn');
const depsUpgradeBtn   = document.getElementById('deps-upgrade-btn');
const depsThreshold    = document.getElementById('deps-threshold');
const depsThProvenance = document.getElementById('deps-th-provenance');
const depsThCheck      = document.getElementById('deps-th-check');
const depsCheckAll     = document.getElementById('deps-check-all');
const depsNpmActions   = document.getElementById('deps-npm-actions');

// Persist threshold in localStorage
depsThreshold.value = localStorage.getItem('deps-threshold') || '7';
depsThreshold.addEventListener('change', () => {
  localStorage.setItem('deps-threshold', depsThreshold.value);
});

// Source toggle: pubspec | npm
let depsSource = 'pubspec';
document.querySelectorAll('.deps-src-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.deps-src-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    depsSource = btn.dataset.src;
    // npm ソース選択時はすぐに npm 専用 UI を表示（checkDeps を待たない）
    const isNpm = depsSource === 'npm';
    depsThProvenance.classList.toggle('hidden', !isNpm);
    depsThCheck.classList.toggle('hidden', !isNpm);
    depsNpmActions.classList.toggle('hidden', !isNpm);
    // プロジェクト選択済みなら自動でチェック実行
    if (currentProjectPath) checkDeps();
  });
});

depsRefreshBtn.onclick = () => checkDeps();
depsPubgetBtn.onclick  = () => { runCommand('flutter pub get', 'pub get'); document.querySelector('.tab[data-tab="logs"]').click(); };
depsUpgradeBtn.onclick = () => { runCommand('flutter pub upgrade', 'pub upgrade'); document.querySelector('.tab[data-tab="logs"]').click(); };

// Header checkbox: select / deselect all
depsCheckAll.addEventListener('change', () => {
  document.querySelectorAll('.deps-pkg-check').forEach(cb => { cb.checked = depsCheckAll.checked; });
});

// Select trusted packages only (provenance true AND age >= threshold)
document.getElementById('deps-select-trusted').addEventListener('click', () => {
  const threshold = parseInt(depsThreshold.value, 10) || 7;
  document.querySelectorAll('.deps-pkg-check').forEach(cb => {
    const tr = cb.closest('tr');
    cb.checked = tr.dataset.trust === 'full';
  });
  depsCheckAll.checked = false;
});

document.getElementById('deps-select-all').addEventListener('click', () => {
  document.querySelectorAll('.deps-pkg-check').forEach(cb => { cb.checked = true; });
  depsCheckAll.checked = true;
});
document.getElementById('deps-deselect-all').addEventListener('click', () => {
  document.querySelectorAll('.deps-pkg-check').forEach(cb => { cb.checked = false; });
  depsCheckAll.checked = false;
});

document.getElementById('deps-install-btn').addEventListener('click', () => {
  const checked = [...document.querySelectorAll('.deps-pkg-check:checked')];
  if (checked.length === 0) { alert('インストールするパッケージを選択してください'); return; }
  const args = checked
    .map(cb => cb.dataset.version ? `${cb.dataset.name}@${cb.dataset.version}` : cb.dataset.name)
    .join(' ');
  runCommand(`npm install ${args}`, 'npm install trusted');
  document.querySelector('.tab[data-tab="logs"]').click();
});

async function checkDeps() {
  if (!currentProjectPath) { alert('プロジェクトを選択してください'); return; }

  const isNpm = depsSource === 'npm';
  depsStatus.textContent = isNpm ? '⏳ npm registry に問い合わせ中...' : '⏳ pub.dev に問い合わせ中...';
  depsTbody.innerHTML = `<tr><td colspan="8" class="deps-empty">読み込み中...</td></tr>`;
  depsRefreshBtn.disabled = true;

  // Show/hide npm-only UI
  depsThProvenance.classList.toggle('hidden', !isNpm);
  depsThCheck.classList.toggle('hidden', !isNpm);
  depsNpmActions.classList.toggle('hidden', !isNpm);
  depsCheckAll.checked = false;

  const endpoint = isNpm
    ? `/api/npm/check?path=${encodeURIComponent(currentProjectPath)}`
    : `/api/pubspec/check?path=${encodeURIComponent(currentProjectPath)}`;

  try {
    const res  = await fetch(endpoint);
    const data = await res.json();

    if (data.error) {
      depsStatus.textContent = `⚠ ${data.error}`;
      depsTbody.innerHTML = `<tr><td colspan="8" class="deps-empty">${escHtml(data.error)}</td></tr>`;
      return;
    }

    depsProjectName.textContent = data.projectName || '';
    renderDepsTable(data.packages, isNpm);

    const threshold = parseInt(depsThreshold.value, 10) || 7;
    const major  = data.packages.filter(p => p.status === 'major').length;
    const minor  = data.packages.filter(p => p.status === 'minor').length;
    const young  = data.packages.filter(p => p.currentAgeInDays !== null && p.currentAgeInDays < threshold).length;
    const noSig  = isNpm ? data.packages.filter(p => p.provenance === false).length : 0;
    const total  = data.packages.length;

    let summary = `✓ ${total}件チェック完了 — MAJOR: ${major}件  minor: ${minor}件`;
    if (young > 0) summary += `  ⚠ 新着 ${threshold}日未満: ${young}件`;
    if (noSig > 0) summary += `  ⚠ Provenance なし: ${noSig}件`;
    depsStatus.textContent = summary;
  } catch (e) {
    depsStatus.textContent = `エラー: ${e.message}`;
  } finally {
    depsRefreshBtn.disabled = false;
  }
}

/** Returns 'full' | 'partial' | 'none' based on provenance + age */
function trustLevel(p, threshold) {
  const ageOk  = p.currentAgeInDays !== null && p.currentAgeInDays >= threshold;
  const provOk = p.provenance === true;
  const ageKnown  = p.currentAgeInDays !== null;
  const provKnown = p.provenance !== null;
  if (!ageKnown && !provKnown) return 'unknown';
  if (provOk && (ageOk || !ageKnown)) return 'full';
  if (provOk || ageOk) return 'partial';
  return 'none';
}

function renderDepsTable(packages, showProvenance) {
  depsTbody.innerHTML = '';
  if (!packages || packages.length === 0) {
    depsTbody.innerHTML = `<tr><td colspan="8" class="deps-empty">パッケージなし</td></tr>`;
    return;
  }

  const threshold = parseInt(depsThreshold.value, 10) || 7;

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

    // Age cell
    let ageHtml = '—';
    if (p.currentAgeInDays !== null) {
      const young = p.currentAgeInDays < threshold;
      ageHtml = young
        ? `<span class="badge badge-young" title="${p.currentAgeInDays}日 — ${threshold}日しきい値未満">⚠ ${p.currentAgeInDays}日</span>`
        : `${p.currentAgeInDays}日`;
    }

    // Published date (short)
    const pubDate = p.currentPublishedAt
      ? new Date(p.currentPublishedAt).toLocaleDateString('ja-JP')
      : '—';

    // Provenance cell (npm only)
    let provHtml = '';
    if (showProvenance) {
      if (p.provenance === true)  provHtml = `<span class="badge badge-prov-yes" title="SLSA provenance あり">✓ SLSA</span>`;
      else if (p.provenance === false) provHtml = `<span class="badge badge-prov-no" title="Provenance なし">✗</span>`;
      else provHtml = '—';
    }

    // Trust level for row coloring (npm only)
    const trust = showProvenance ? trustLevel(p, threshold) : 'unknown';
    tr.dataset.trust = trust;
    if (showProvenance) tr.classList.add(`trust-${trust}`);

    // Checkbox cell (npm only — hidden for pubspec via th hidden)
    const checkHtml = showProvenance
      ? `<td class="deps-check-cell"><input type="checkbox" class="deps-pkg-check"
           data-name="${escHtml(p.name)}"
           data-version="${escHtml(p.current ?? '')}"></td>`
      : `<td class="hidden"></td>`;

    tr.innerHTML = `
      ${checkHtml}
      <td>${escHtml(p.name)}</td>
      <td>${escHtml(current)}</td>
      <td>${arrow}</td>
      <td><span class="${badgeClass}">${statusLabel}</span></td>
      <td class="deps-date">${pubDate}</td>
      <td>${ageHtml}</td>
      <td class="${showProvenance ? '' : 'hidden'}">${provHtml}</td>
      <td>${p.dev ? '<span class="badge badge-dev">dev</span>' : ''}</td>`;
    depsTbody.appendChild(tr);
  });
}

// =====================================================================
// パッケージ追加パネル
// =====================================================================

const npmAddPanel      = document.getElementById('npm-add-panel');
const npmAddToggle     = document.getElementById('npm-add-toggle');
const npmAddClose      = document.getElementById('npm-add-close');
const npmSearchInput   = document.getElementById('npm-search-input');
const npmSearchBtn     = document.getElementById('npm-search-btn');
const npmSearchStatus  = document.getElementById('npm-search-status');
const npmSearchResults = document.getElementById('npm-search-results');
const npmDetailCol     = document.getElementById('npm-detail-col');
const npmDetailName    = document.getElementById('npm-detail-name');
const npmDetailDesc    = document.getElementById('npm-detail-desc');
const npmDetailLink    = document.getElementById('npm-detail-link');
const npmVersionTbody  = document.getElementById('npm-version-tbody');
const npmSelectedLabel = document.getElementById('npm-selected-label');
const npmDepType       = document.getElementById('npm-dep-type');
const npmWriteBtn      = document.getElementById('npm-write-btn');
const npmInstallRun    = document.getElementById('npm-install-run');

let npmSelectedPkg     = null;  // { name, version }

npmAddToggle.addEventListener('click', () => {
  npmAddPanel.classList.toggle('hidden');
  if (!npmAddPanel.classList.contains('hidden')) npmSearchInput.focus();
});
npmAddClose.addEventListener('click', () => npmAddPanel.classList.add('hidden'));

// 検索
async function npmSearch() {
  const q = npmSearchInput.value.trim();
  if (!q) return;
  npmSearchStatus.textContent = '⏳ 検索中...';
  npmSearchResults.innerHTML  = '';
  npmDetailCol.classList.add('hidden');
  npmSelectedPkg = null;
  updateNpmActionBar();

  const res  = await fetch(`/api/npm/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    npmSearchStatus.textContent = '結果なし';
    return;
  }
  npmSearchStatus.textContent = `${data.results.length} 件`;
  data.results.forEach(pkg => {
    const li = document.createElement('li');
    li.className = 'npm-result-item';
    li.innerHTML = `
      <span class="npm-result-name">${escHtml(pkg.name)}</span>
      <span class="npm-result-ver">${escHtml(pkg.version)}</span>
      <span class="npm-result-desc">${escHtml(pkg.description)}</span>`;
    li.addEventListener('click', () => {
      document.querySelectorAll('.npm-result-item').forEach(el => el.classList.remove('active'));
      li.classList.add('active');
      loadNpmDetail(pkg.name);
    });
    npmSearchResults.appendChild(li);
  });
}

npmSearchBtn.addEventListener('click', npmSearch);
npmSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') npmSearch(); });

// バージョン詳細
async function loadNpmDetail(pkgName) {
  npmDetailCol.classList.remove('hidden');
  npmDetailName.textContent = pkgName;
  npmDetailDesc.textContent = '';
  npmDetailLink.href        = `https://www.npmjs.com/package/${pkgName}`;
  npmVersionTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:.8rem;color:var(--muted)">⏳ 取得中...</td></tr>';
  npmSelectedPkg = null;
  updateNpmActionBar();

  const res  = await fetch(`/api/npm/detail?name=${encodeURIComponent(pkgName)}`);
  const data = await res.json();

  npmDetailDesc.textContent = data.description || '';
  npmVersionTbody.innerHTML = '';

  const threshold = parseInt(depsThreshold.value, 10) || 7;

  if (!data.versions || data.versions.length === 0) {
    npmVersionTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:.8rem;color:var(--muted)">バージョン情報なし</td></tr>';
    return;
  }

  data.versions.forEach(v => {
    const tr  = document.createElement('tr');
    const age = v.ageInDays;
    const young = age !== null && age < threshold;

    const ageHtml = age === null ? '—'
      : young ? `<span class="badge badge-young">⚠ ${age}日</span>`
      : `${age}日`;

    const provHtml = v.provenance
      ? `<span class="badge badge-prov-yes">✓ SLSA</span>`
      : `<span class="badge badge-prov-no">✗</span>`;

    const latestBadge = v.isLatest ? ' <span class="badge badge-latest" style="font-size:.65rem">latest</span>' : '';
    const pubDate = v.publishedAt ? new Date(v.publishedAt).toLocaleDateString('ja-JP') : '—';

    // Trust for row color
    const trust = v.provenance && !young ? 'full' : (!young || v.provenance) ? 'partial' : 'none';
    tr.classList.add(`trust-${trust}`);

    tr.innerHTML = `
      <td class="npm-ver-radio"><input type="radio" name="npm-ver-pick" value="${escHtml(v.version)}"></td>
      <td>${escHtml(v.version)}${latestBadge}</td>
      <td class="deps-date">${pubDate}</td>
      <td>${ageHtml}</td>
      <td>${provHtml}</td>`;

    tr.querySelector('input[type=radio]').addEventListener('change', () => {
      npmSelectedPkg = { name: pkgName, version: v.version };
      updateNpmActionBar();
    });
    // row click selects radio
    tr.addEventListener('click', () => tr.querySelector('input').click());

    npmVersionTbody.appendChild(tr);
  });
}

function updateNpmActionBar() {
  const sel = npmSelectedPkg;
  if (sel) {
    npmSelectedLabel.textContent = `${sel.name}@${sel.version}`;
    npmWriteBtn.disabled   = false;
    npmInstallRun.disabled = false;
  } else {
    npmSelectedLabel.textContent = '← バージョンを選択';
    npmWriteBtn.disabled   = true;
    npmInstallRun.disabled = true;
  }
}

// package.json に追記
npmWriteBtn.addEventListener('click', async () => {
  if (!npmSelectedPkg) return;
  if (!currentProjectPath) { alert('プロジェクトを選択してください'); return; }

  const dev = npmDepType.value === 'dev';
  const res  = await fetch('/api/npm/write', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      projectPath: currentProjectPath,
      name:    npmSelectedPkg.name,
      version: npmSelectedPkg.version,
      dev,
    }),
  });
  const data = await res.json();
  if (data.ok) {
    npmWriteBtn.textContent = '✓ 追記しました';
    setTimeout(() => { npmWriteBtn.textContent = 'package.json に追記'; }, 2000);
    // 一覧を自動更新
    checkDeps();
  } else {
    alert('書き込みエラー: ' + data.error);
  }
});

// npm install 実行
npmInstallRun.addEventListener('click', () => {
  if (!npmSelectedPkg) return;
  const dev  = npmDepType.value === 'dev' ? ' --save-dev' : '';
  const cmd  = `npm install ${npmSelectedPkg.name}@${npmSelectedPkg.version}${dev}`;
  runCommand(cmd, `install ${npmSelectedPkg.name}`);
  document.querySelector('.tab[data-tab="logs"]').click();
});

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

// プロセス一覧を定期更新（自動更新チェック時のみ）
setInterval(() => {
  if (!dashboard.classList.contains('hidden') && autoreload.checked) {
    refreshProcessList(null);
  }
}, 10000);

// =====================================================================
// 初期ロード
// =====================================================================
browse('');
