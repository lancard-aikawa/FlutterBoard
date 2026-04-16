'use strict';
/* global marked, hljs */ // CDN globals (marked.js, highlight.js)
// currentProjectPath, currentNpmDir, escHtml, formatElapsed → app-core.js

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
  currentNpmDir      = null;
  currentLabel.textContent = data.selected;
  projectPanel.classList.add('hidden');
  dashboard.classList.remove('hidden');

  // deps タブをリセット（前のプロジェクトのデータをクリア）
  depsTbody.innerHTML = `<tr><td colspan="9" class="deps-empty">「更新チェック」を押してください</td></tr>`;
  depsStatus.textContent = '';
  depsProjectName.textContent = '';

  loadProjectInfo(data.selected);
  loadRoutines(data.selected);
  loadMdList(data.selected);
  loadEnvList(data.selected);
  loadGitStatus();
  loadFirebaseEnvStatus(data.selected);
  loadFvmInfo(data.selected);
  if (typeof window.ghCheckAfterProjectLoad === 'function') window.ghCheckAfterProjectLoad();
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
    if (tab.dataset.tab === 'git') { loadGitStatus(); loadGitContext(); }
  });
});

// コマンドタブ内サブタブ
document.querySelectorAll('.cmd-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.cmd-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.cmd-tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`cmd-panel-${tab.dataset.cmdTab}`).classList.remove('hidden');
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
const stdinBar      = document.getElementById('stdin-bar');
const stdinInput    = document.getElementById('stdin-input');
const stdinSend     = document.getElementById('stdin-send');
const devtoolsBar       = document.getElementById('devtools-bar');
const devtoolsLink      = document.getElementById('devtools-link');
const devtoolsLaunchBtn = document.getElementById('devtools-launch-btn');
const vmServiceLink     = document.getElementById('vmservice-link');
const vmBar             = document.getElementById('vm-bar');
const vmBarUrl          = document.getElementById('vm-bar-url');
const vmBarDetach       = document.getElementById('vm-bar-detach');
const logArea           = document.getElementById('log-area');
const vmUrlInput        = document.getElementById('vm-url-input');
const vmAttachBtn       = document.getElementById('vm-attach-btn');
const vmScanBtn         = document.getElementById('vm-scan-btn');
const vmScanResults     = document.getElementById('vm-scan-results');
const vmScanSelect      = document.getElementById('vm-scan-select');

// URL detection (mirrors server-side patterns)
const DEVTOOLS_URL_RE   = /https?:\/\/[\w.:-]+\?uri=\S+/;
const VM_SERVICE_URL_RE = /https?:\/\/[\w.:-]+\/[\w+/=%-]+=\//;

let activeId         = null;
let activeSSE        = null;
let activeDevToolsUrl  = null;
let activeVmServiceUrl = null;
let logBuffer   = [];

// ---- DevTools バー ----
function renderDevToolsBar() {
  const hasDt = !!activeDevToolsUrl;
  const hasVm = !!activeVmServiceUrl;
  devtoolsBar.classList.toggle('hidden', !hasDt && !hasVm);

  // DevTools URL が既知 → 「開く」リンク表示
  devtoolsLink.classList.toggle('hidden', !hasDt);
  if (hasDt) devtoolsLink.href = activeDevToolsUrl;

  // VM URL のみ → 「起動」ボタン表示（DevTools URL が判明したら消える）
  devtoolsLaunchBtn.classList.toggle('hidden', hasDt || !hasVm);
  if (hasDt || !hasVm) {
    devtoolsLaunchBtn.textContent = 'DevTools を起動';
    devtoolsLaunchBtn.disabled    = false;
  }

  // VM Service リンクは常に（あれば）表示
  vmServiceLink.classList.toggle('hidden', !hasVm);
  if (hasVm) vmServiceLink.href = activeVmServiceUrl;
}

devtoolsLaunchBtn.addEventListener('click', async () => {
  if (!activeVmServiceUrl) return;
  devtoolsLaunchBtn.textContent = '起動中...';
  devtoolsLaunchBtn.disabled    = true;

  try {
    const res  = await fetch(`/api/devtools/start?vmUri=${encodeURIComponent(activeVmServiceUrl)}`);
    const data = await res.json();
    if (data.url) {
      activeDevToolsUrl = data.url;
      renderDevToolsBar();
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } else {
      devtoolsLaunchBtn.textContent = `⚠ ${data.error || '起動失敗'}`;
      devtoolsLaunchBtn.disabled    = false;
    }
  } catch {
    devtoolsLaunchBtn.textContent = '⚠ 通信エラー';
    devtoolsLaunchBtn.disabled    = false;
  }
});

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
    if (target) selectProcess(target.id, target.label, target.running, target.devToolsUrl || null, target.vmServiceUrl || null, target.vm || false);
  }
}

function buildProcessItem(p) {
  const li = document.createElement('li');
  li.className  = 'proc-item' + (p.id === activeId ? ' active' : '');
  li.dataset.id = p.id;

  const dotClass  = p.running ? 'running' : (p.exitCode !== 0 ? 'error' : 'exited');
  const elapsed   = formatElapsed(p.startedAt);
  const ptyBadge  = p.pty ? '<span class="pty-badge">PTY</span>' : '';
  const vmBadge   = p.vm  ? '<span class="vm-badge">VM</span>'   : '';

  li.innerHTML = `
    <div class="proc-top">
      <span class="proc-dot ${dotClass}"></span>
      <span class="proc-label" title="${escHtml(p.label)}">${escHtml(p.label)}${ptyBadge}${vmBadge}</span>
      <span class="proc-actions">
        ${p.running
          ? (p.vm ? `<button class="btn-stop btn-disconnect" title="VM Service から切断（flutter run 本体は停止しない）">⏏</button>`
                  : `<button class="btn-stop" title="プロセスを停止">■</button>`)
          : `<button class="btn-remove" title="一覧から削除">✕</button>`}
      </span>
    </div>
    <div class="proc-meta">${elapsed}</div>`;

  li.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    selectProcess(p.id, p.label, p.running, p.devToolsUrl || null, p.vmServiceUrl || null, p.vm || false);
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
    if (p.running) {
      if (activeId === id) {
        // SSE は閉じない — プロセス終了後に exit イベントが届いてから UI を更新する
        // 停止処理中は stdin 入力だけ無効化しておく
        stdinBar.classList.add('hidden');
      }
      // 終了が遅れた場合のフォールバック: 数回プロセス一覧を再取得
      // （SSE が既に閉じられているケースや非アクティブプロセス向け）
      [1500, 3000, 5000].forEach(delay => {
        setTimeout(() => refreshProcessList(null), delay);
      });
    } else {
      // remove ボタン（停止済みプロセスの削除）: 即座にリスト更新
      if (activeId === id) {
        if (activeSSE) { activeSSE.close(); activeSSE = null; }
        activeId = null; logBuffer = [];
        logOutput.innerHTML  = '<span class="log-muted">Select a process to view logs</span>';
        logTitle.textContent = 'Select a process to view logs';
        logTitle.classList.remove('exited');
        stdinBar.classList.add('hidden');
      }
      refreshProcessList(null);
    }
  });

  return li;
}

// ---- プロセス選択 → SSE接続 ----
function selectProcess(id, label, running, devToolsUrl = null, vmServiceUrl = null, isVm = false) {
  // S4: combined view が開いていたら閉じる
  if (typeof combinedActive !== 'undefined' && combinedActive) exitCombinedView();

  if (activeSSE) { activeSSE.close(); activeSSE = null; }

  activeId  = id;
  logBuffer = [];
  logOutput.innerHTML = '';
  logSections    = [];
  currentSection = null;
  logTitle.textContent = label;
  logTitle.classList.remove('exited');
  logFilter.value = '';
  logFilter.classList.remove('active');
  activeLevels.clear();
  document.querySelectorAll('.log-level-btn').forEach(b => b.classList.remove('active'));

  // DevTools バーを初期化（既知 URL があればすぐ表示）
  activeDevToolsUrl  = devToolsUrl;
  activeVmServiceUrl = vmServiceUrl;
  renderDevToolsBar();

  // VM バーと vm-mode クラスの切り替え
  if (isVm && vmServiceUrl) {
    vmBarUrl.textContent = vmServiceUrl;
    vmBar.classList.remove('hidden');
    logArea.classList.add('vm-mode');
  } else {
    vmBar.classList.add('hidden');
    logArea.classList.remove('vm-mode');
  }

  document.querySelectorAll('.proc-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === id);
  });

  // stdin バーは実行中かつ VM でない場合のみ表示
  stdinBar.classList.toggle('hidden', !running || isVm);

  const sse = new EventSource(`/api/process/stream?id=${id}`);
  activeSSE = sse;
  let exited = false; // 二重発火防止フラグ

  sse.onmessage = e => {
    const { type, data, ts } = JSON.parse(e.data);
    logBuffer.push({ type, data, ts });
    appendLogEntry(type, data, ts);

    // DevTools / VM Service URL をリアルタイム検出
    if (data && (type === 'stdout' || type === 'stderr')) {
      let updated = false;
      if (!activeDevToolsUrl) {
        const m = data.match(DEVTOOLS_URL_RE);
        if (m) { activeDevToolsUrl = m[0].trim(); updated = true; }
      }
      if (!activeVmServiceUrl) {
        const m = data.match(VM_SERVICE_URL_RE);
        if (m) { activeVmServiceUrl = m[0].trim(); updated = true; }
      }
      if (updated) renderDevToolsBar();
    }

    if (type === 'exit') {
      exited = true;
      autoscroll.checked = false;
      autoreload.checked = false;
      logTitle.classList.add('exited');
      stdinBar.classList.add('hidden');
      // グループ化中なら現在セクションの「ライブ」を消す
      if (currentSection) { currentSection.isLive = false; renderSectionHeader(currentSection); }
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

// ---- グループ化設定 ----
const logGroupToggle = document.getElementById('log-group-toggle');
const logGroupMarker = document.getElementById('log-group-marker');

logGroupToggle.checked = localStorage.getItem('log-group-enabled') === '1';
logGroupMarker.value   = localStorage.getItem('log-group-marker') || '[FB:SCREEN]';
logGroupMarker.classList.toggle('hidden', !logGroupToggle.checked);

logGroupToggle.addEventListener('change', () => {
  const on = logGroupToggle.checked;
  localStorage.setItem('log-group-enabled', on ? '1' : '0');
  logGroupMarker.classList.toggle('hidden', !on);
  rebuildLogView();
});
logGroupMarker.addEventListener('change', () => {
  localStorage.setItem('log-group-marker', logGroupMarker.value.trim() || '[FB:SCREEN]');
  rebuildLogView();
});

function isGroupingEnabled() {
  return logGroupToggle.checked && logGroupMarker.value.trim().length > 0;
}
function getMarker() {
  return logGroupMarker.value.trim() || '[FB:SCREEN]';
}

// グループ化セクション状態
let logSections    = [];
let currentSection = null;

// バッファ全体を再描画（グループ化ON/OFF切り替え時）
function rebuildLogView() {
  logOutput.innerHTML = '';
  logSections    = [];
  currentSection = null;
  logBuffer.forEach(({ type, data, ts }) => appendLogEntry(type, data, ts));
}

// ---- ログ表示（エントリポイント） ----
function appendLogEntry(type, text, ts = Date.now()) {
  if (isGroupingEnabled() && (type === 'stdout' || type === 'stderr')) {
    appendLogEntryGrouped(type, text, ts);
  } else {
    appendLogEntryFlat(type, text);
  }
}

function appendLogEntryFlat(type, text) {
  const span = document.createElement('span');
  span.className   = `log-${type}`;
  span.textContent = text;
  if (!matchesTextFilter(text) || !matchesLevelFilter(text)) span.classList.add('log-filtered-hidden');
  logOutput.appendChild(span);
  if (autoscroll.checked) logOutput.scrollTop = logOutput.scrollHeight;
}

// ---- グループ化モード ----
function appendLogEntryGrouped(type, text, ts) {
  const marker = getMarker();
  if (text.includes(marker)) {
    // マーカー行 → 新しいセクションを開始（行自体はコンテンツに含めない）
    const idx  = text.indexOf(marker);
    const rest = text.slice(idx + marker.length).replace(/\n[\s\S]*/, '').trim();
    createLogSection(rest || '—', ts);
    return;
  }
  // セクションがなければ「起動」セクションを自動生成
  if (!currentSection) createLogSection(null, ts);
  appendToSection(type, text);
}

function createLogSection(name, ts) {
  // 直前のセクションをライブ終了 & 折り畳み
  if (currentSection) {
    currentSection.isLive = false;
    renderSectionHeader(currentSection);
    foldSection(currentSection);
  }

  const section = { name: name || '起動', isUnnamed: !name, timestamp: ts,
                    lineCount: 0, isLive: true, folded: false,
                    el: null, contentEl: null, countEl: null, liveEl: null, toggleEl: null };

  const el      = document.createElement('div');
  el.className  = 'log-section';

  const header  = document.createElement('div');
  header.className = 'log-section-header';

  const toggle  = document.createElement('span');
  toggle.className = 'log-section-toggle';
  toggle.textContent = '▼';
  section.toggleEl = toggle;

  const time    = document.createElement('span');
  time.className = 'log-section-time';
  time.textContent = `[${fmtTime(ts)}]`;

  const nameEl  = document.createElement('span');
  nameEl.className = 'log-section-name';
  nameEl.textContent = section.name;

  const countEl = document.createElement('span');
  countEl.className = 'log-section-count';
  countEl.textContent = '0行';
  section.countEl = countEl;

  const liveEl  = document.createElement('span');
  liveEl.className = 'log-section-live';
  liveEl.textContent = '● ライブ';
  section.liveEl = liveEl;

  header.append(toggle, time, nameEl, countEl, liveEl);
  header.onclick = () => section.folded ? unfoldSection(section) : foldSection(section);

  const content = document.createElement('div');
  content.className = 'log-section-content';
  section.contentEl = content;
  section.el = el;

  el.append(header, content);
  logSections.push(section);
  currentSection = section;
  logOutput.appendChild(el);
  if (autoscroll.checked) logOutput.scrollTop = logOutput.scrollHeight;
  return section;
}

function appendToSection(type, text) {
  if (!currentSection) return;
  const span = document.createElement('span');
  span.className   = `log-${type}`;
  span.textContent = text;
  if (!matchesTextFilter(text) || !matchesLevelFilter(text)) span.classList.add('log-filtered-hidden');
  currentSection.contentEl.appendChild(span);
  currentSection.lineCount++;
  currentSection.countEl.textContent = `${currentSection.lineCount}行`;
  if (autoscroll.checked) logOutput.scrollTop = logOutput.scrollHeight;
}

function foldSection(section) {
  section.folded = true;
  section.contentEl.classList.add('log-section-folded');
  section.toggleEl.textContent = '▶';
}
function unfoldSection(section) {
  section.folded = false;
  section.contentEl.classList.remove('log-section-folded');
  section.toggleEl.textContent = '▼';
}
function renderSectionHeader(section) {
  section.liveEl.textContent = section.isLive ? '● ライブ' : '';
}
function fmtTime(ts) {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
}

// ---- フィルター（正規表現 + レベル） ----
const logRegexBtn  = document.getElementById('log-regex-btn');
let logRegexMode   = false;
let activeLevels   = new Set(); // 空 = 全表示

const LEVEL_RE = {
  error: /\b(error|E\/flutter|FATAL|exception|AssertionError)\b/i,
  warn:  /\b(warn|W\/flutter|warning|DEPRECATED)\b/i,
  info:  /\b(info|I\/flutter)\b/i,
};

logRegexBtn.onclick = () => {
  logRegexMode = !logRegexMode;
  logRegexBtn.classList.toggle('active', logRegexMode);
  applyLogFilter();
};

document.querySelectorAll('.log-level-btn').forEach(btn => {
  btn.onclick = () => {
    btn.classList.toggle('active');
    const level = btn.dataset.level;
    if (btn.classList.contains('active')) activeLevels.add(level);
    else activeLevels.delete(level);
    applyLogFilter();
  };
});

function matchesTextFilter(text) {
  const raw = logFilter.value.trim();
  if (!raw) return true;
  if (logRegexMode) {
    try { return new RegExp(raw, 'i').test(text); }
    catch { return true; } // 無効な正規表現は全表示
  }
  return text.toLowerCase().includes(raw.toLowerCase());
}

function matchesLevelFilter(text) {
  if (activeLevels.size === 0) return true;
  for (const level of activeLevels) {
    if (LEVEL_RE[level].test(text)) return true;
  }
  return false;
}

function applyLogFilter() {
  logFilter.classList.toggle('active', logFilter.value.trim().length > 0);
  logOutput.querySelectorAll('span[class^="log-"]').forEach(span => {
    const hidden = !matchesTextFilter(span.textContent) || !matchesLevelFilter(span.textContent);
    span.classList.toggle('log-filtered-hidden', hidden);
  });
}

logFilter.addEventListener('input', applyLogFilter);

// ---- ログ保存 ----
logSave.onclick = () => {
  if (activeId !== null) {
    // サーバー側バッファからダウンロード（タイムスタンプ付き）
    window.open(`/api/process/log?id=${activeId}`, '_blank');
  }
};

// ---- ログクリア ----
logClear.onclick = () => { logOutput.innerHTML = ''; logBuffer = []; };

// ---- VM Service attach ----

vmAttachBtn.addEventListener('click', attachVM);
vmUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') attachVM(); });

async function attachVM() {
  const vmUrl = vmUrlInput.value.trim();
  if (!vmUrl) return;
  vmAttachBtn.disabled = true;
  vmAttachBtn.textContent = '接続中...';
  try {
    const res  = await fetch('/api/process/attach-vm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ label: `VM:${vmUrl}`, vmUrl }),
    });
    const data = await res.json();
    if (data.ok) {
      vmUrlInput.value = '';
      refreshProcessList(data.id);  // 新しいプロセスを選択状態で表示
    } else {
      alert(`VM Service 接続エラー: ${data.error}`);
    }
  } catch (e) {
    alert(`接続失敗: ${e.message}`);
  } finally {
    vmAttachBtn.disabled = false;
    vmAttachBtn.textContent = '📡 Attach';
  }
}

// VM Service 切断ボタン
vmBarDetach.addEventListener('click', async () => {
  if (activeId === null) return;
  await fetch('/api/process/stop', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id: activeId }),
  });
  stdinBar.classList.add('hidden');
  [500, 1500].forEach(d => setTimeout(() => refreshProcessList(null), d));
});

// V3: VM Service スキャンボタン
vmScanBtn.addEventListener('click', async () => {
  vmScanBtn.disabled = true;
  vmScanBtn.textContent = '⏳';
  vmScanResults.classList.add('hidden');
  try {
    const res  = await fetch('/api/process/scan-vm');
    const data = await res.json();
    if (data.length === 0) {
      alert('実行中の Dart VM Service が見つかりませんでした');
    } else if (data.length === 1) {
      vmUrlInput.value = data[0].uri;
    } else {
      vmScanSelect.innerHTML = '<option value="" disabled selected>検出された VM Service を選択...</option>';
      data.forEach(d => {
        const opt = document.createElement('option');
        opt.value       = d.uri;
        opt.textContent = `${d.name} — ${d.uri}`;
        vmScanSelect.appendChild(opt);
      });
      vmScanResults.classList.remove('hidden');
    }
  } catch (e) {
    alert(`スキャンエラー: ${e.message}`);
  } finally {
    vmScanBtn.disabled = false;
    vmScanBtn.textContent = '🔍';
  }
});

vmScanSelect.addEventListener('change', () => {
  if (vmScanSelect.value) {
    vmUrlInput.value = vmScanSelect.value;
    vmScanResults.classList.add('hidden');
    vmScanSelect.selectedIndex = 0;
  }
});

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
    document.getElementById('npm-pinned-row').classList.add('hidden');
    return;
  }

  const scripts = projectInfo.npmScripts;
  const pinned  = projectInfo.pinnedScripts || [];

  // ピン留めエリア
  pinnedGrid.innerHTML = '';
  const pinnedRow = document.getElementById('npm-pinned-row');
  if (pinned.length > 0) {
    pinnedRow.classList.remove('hidden');
    pinned.forEach(name => {
      pinnedGrid.appendChild(buildNpmBtn(name, scripts[name] || name, pinned, true));
    });
  } else {
    pinnedRow.classList.add('hidden');
  }

  // 全スクリプト → テーブル表示
  grid.innerHTML = '';
  const entries = Object.entries(scripts);
  if (entries.length === 0) {
    grid.innerHTML = '<span class="cmd-empty">scripts なし</span>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'npm-scripts-table';
  table.innerHTML = `
    <thead><tr>
      <th class="nst-th-pin"></th>
      <th class="nst-th-name">スクリプト</th>
      <th class="nst-th-cmd">コマンド</th>
    </tr></thead>`;
  const tbody = document.createElement('tbody');

  entries.forEach(([name, cmdContent]) => {
    const isPinned = pinned.includes(name);
    const tr = document.createElement('tr');
    tr.className = 'nst-row' + (isPinned ? ' nst-pinned' : '');
    tr.title = '入力欄にセット';

    const tdPin = document.createElement('td');
    tdPin.className = 'nst-pin';
    const pinBtn = document.createElement('button');
    pinBtn.className = 'nst-pin-btn';
    pinBtn.title = isPinned ? 'ピン解除' : 'ピン留め';
    pinBtn.textContent = isPinned ? '★' : '☆';
    tdPin.appendChild(pinBtn);

    const tdName = document.createElement('td');
    tdName.className = 'nst-name';
    tdName.textContent = name;

    const tdCmd = document.createElement('td');
    tdCmd.className = 'nst-cmd';
    tdCmd.textContent = cmdContent;

    tr.appendChild(tdPin);
    tr.appendChild(tdName);
    tr.appendChild(tdCmd);
    tbody.appendChild(tr);

    // 行クリック → コマンドを入力欄にセット
    tr.addEventListener('click', e => {
      if (e.target === pinBtn) return;
      runCommand(`npm run ${name}`, name);
    });

    // ピン留めトグル
    pinBtn.addEventListener('click', async e => {
      e.stopPropagation();
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
  });

  table.appendChild(tbody);
  grid.appendChild(table);
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
  });
});

function runCommand(cmd, label) {
  // コマンドを直接実行せず、入力欄にセットしてユーザーが確認・編集できるようにする
  document.querySelector('.tab[data-tab="logs"]').click();
  cmdInput.value   = cmd;
  labelInput.value = label || '';
  cmdInput.focus();
  cmdInput.select();
}

// =====================================================================
// ルーティンランナー
// =====================================================================

const routineAddBtn     = document.getElementById('routine-add-btn');
const routineList       = document.getElementById('routine-list');
const routineEditor     = document.getElementById('routine-editor');
const routineNameInput  = document.getElementById('routine-name-input');
const routineStepsList  = document.getElementById('routine-steps-list');
const routineStepCmd    = document.getElementById('routine-step-cmd');
const routineStepLabel  = document.getElementById('routine-step-label');
const routineStepAddBtn = document.getElementById('routine-step-add-btn');
const routineSaveBtn    = document.getElementById('routine-save-btn');
const routineCancelBtn  = document.getElementById('routine-cancel-btn');
const routineStopErr    = document.getElementById('routine-stop-on-error');

let routines     = [];       // 現在のプロジェクトのルーティン一覧
let routineEditingId  = null;     // 編集中の ID（null = 新規）
let routineEditSteps  = [];       // エディタ上のステップ
let routineRunState   = null;     // { seq, stepIdx } — 実行中状態
let routineMonitorSSE = null;     // ステップ完了監視用 SSE

// ---- ロード / セーブ ----

async function loadRoutines(projectPath) {
  try {
    const res = await fetch(`/api/routine/list?path=${encodeURIComponent(projectPath)}`);
    routines = await res.json();
  } catch (_) {
    routines = [];
  }
  renderRoutineList();
}

async function saveRoutines() {
  await fetch('/api/routine/save', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path: currentProjectPath, routines }),
  });
}

// ---- リスト描画 ----

function renderRoutineList() {
  if (!routines.length) {
    routineList.innerHTML = '<div class="routine-empty">ルーティンはまだありません — 「+ 追加」で作成</div>';
    return;
  }
  routineList.innerHTML = '';
  routines.forEach(seq => {
    const isRunning = !!(routineRunState && routineRunState.seq.id === seq.id);
    const stepIdx   = isRunning ? routineRunState.stepIdx : 0;
    const card      = document.createElement('div');
    card.className  = 'routine-item' + (isRunning ? ' seq-running' : '');
    card.dataset.id = seq.id;

    const preview = seq.steps.map(s => escHtml(s.label || s.cmd)).join(' → ');
    const progressHtml = isRunning
      ? `<div class="routine-progress">
           <span class="routine-progress-dot"></span>
           ステップ ${stepIdx + 1}/${seq.steps.length}: ${escHtml(seq.steps[stepIdx].label || seq.steps[stepIdx].cmd)}
         </div>`
      : '';

    const otherRunning = !!(routineRunState && routineRunState.seq.id !== seq.id);

    card.innerHTML = `
      <div class="routine-item-header">
        <span class="routine-item-name">${escHtml(seq.name)}</span>
        <span class="routine-item-count">${seq.steps.length}ステップ</span>
        <div class="routine-item-actions">
          <button class="cmd-btn seq-run-btn" ${isRunning || otherRunning ? 'disabled' : ''}>▶ 実行</button>
          <button class="btn-ghost seq-edit-btn" ${isRunning ? 'disabled' : ''}>編集</button>
          <button class="btn-ghost seq-del-btn"  ${isRunning ? 'disabled' : ''}>✕</button>
        </div>
      </div>
      <div class="routine-item-preview">${preview}</div>
      ${progressHtml}`;

    card.querySelector('.routine-run-btn').addEventListener('click', () => runRoutine(seq));
    card.querySelector('.routine-edit-btn').addEventListener('click', () => openRoutineEditor(seq.id));
    card.querySelector('.routine-del-btn').addEventListener('click', async () => {
      if (!confirm(`「${seq.name}」を削除しますか？`)) return;
      routines = routines.filter(s => s.id !== seq.id);
      await saveRoutines();
      renderRoutineList();
    });

    routineList.appendChild(card);
  });
}

// ---- エディタ ----

routineAddBtn.addEventListener('click', () => openRoutineEditor(null));

function openRoutineEditor(id) {
  routineEditingId = id;
  routineAddBtn.disabled = true;
  routineEditor.classList.remove('hidden');

  if (id) {
    const seq = routines.find(s => s.id === id);
    routineNameInput.value = seq.name;
    routineEditSteps       = seq.steps.map(s => ({ ...s }));
    routineStopErr.checked = seq.stopOnError !== false;
  } else {
    routineNameInput.value = '';
    routineEditSteps       = [];
    routineStopErr.checked = true;
  }
  renderSeqEditorSteps();
  routineNameInput.focus();
}

function closeSeqEditor() {
  routineEditor.classList.add('hidden');
  routineAddBtn.disabled = false;
  routineEditingId = null;
  routineEditSteps = [];
}

function renderSeqEditorSteps() {
  if (!routineEditSteps.length) {
    routineStepsList.innerHTML = '<div class="routine-steps-empty">↑ ステップを追加してください</div>';
    return;
  }
  routineStepsList.innerHTML = '';
  const total = routineEditSteps.length;
  routineEditSteps.forEach((step, i) => {
    const row = document.createElement('div');
    row.className = 'routine-editor-step-row';
    row.innerHTML = `
      <span class="routine-step-num">${i + 1}</span>
      <span class="routine-step-cmd-txt" title="${escHtml(step.cmd)}">${escHtml(step.label || step.cmd)}</span>
      <div class="routine-step-row-acts">
        <button class="routine-stp-up  btn-icon" data-i="${i}" ${i === 0          ? 'disabled' : ''}>↑</button>
        <button class="routine-stp-dn  btn-icon" data-i="${i}" ${i === total - 1  ? 'disabled' : ''}>↓</button>
        <button class="routine-stp-del btn-icon" data-i="${i}">✕</button>
      </div>`;
    routineStepsList.appendChild(row);
  });

  routineStepsList.querySelectorAll('.routine-stp-up').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    [routineEditSteps[i - 1], routineEditSteps[i]] = [routineEditSteps[i], routineEditSteps[i - 1]];
    renderSeqEditorSteps();
  }));
  routineStepsList.querySelectorAll('.routine-stp-dn').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    [routineEditSteps[i], routineEditSteps[i + 1]] = [routineEditSteps[i + 1], routineEditSteps[i]];
    renderSeqEditorSteps();
  }));
  routineStepsList.querySelectorAll('.routine-stp-del').forEach(b => b.addEventListener('click', () => {
    routineEditSteps.splice(+b.dataset.i, 1);
    renderSeqEditorSteps();
  }));
}

function addSeqStep() {
  const cmd = routineStepCmd.value.trim();
  if (!cmd) { routineStepCmd.focus(); return; }
  routineEditSteps.push({ cmd, label: routineStepLabel.value.trim() });
  routineStepCmd.value   = '';
  routineStepLabel.value = '';
  renderSeqEditorSteps();
  routineStepCmd.focus();
}

routineStepAddBtn.addEventListener('click', addSeqStep);
routineStepCmd.addEventListener('keydown',   e => { if (e.key === 'Enter') addSeqStep(); });
routineStepLabel.addEventListener('keydown', e => { if (e.key === 'Enter') addSeqStep(); });

routineSaveBtn.addEventListener('click', async () => {
  const name = routineNameInput.value.trim();
  if (!name) { routineNameInput.focus(); return; }
  if (!routineEditSteps.length) { alert('ステップを1つ以上追加してください'); return; }

  if (routineEditingId) {
    const idx = routines.findIndex(s => s.id === routineEditingId);
    if (idx >= 0) routines[idx] = { id: routineEditingId, name, steps: [...routineEditSteps], stopOnError: routineStopErr.checked };
  } else {
    routines.push({ id: `seq_${Date.now()}`, name, steps: [...routineEditSteps], stopOnError: routineStopErr.checked });
  }
  await saveRoutines();
  closeSeqEditor();
  renderRoutineList();
});

routineCancelBtn.addEventListener('click', closeSeqEditor);

// ---- ルーティン実行 ----

async function runRoutine(seq) {
  if (routineRunState) return;
  routineRunState = { seq, stepIdx: 0 };
  renderRoutineList();
  await startRoutineStep();
}

async function startRoutineStep() {
  const { seq, stepIdx } = routineRunState;
  const step  = seq.steps[stepIdx];
  const total = seq.steps.length;
  const label = `[${stepIdx + 1}/${total}] ${step.label || step.cmd}`;

  const parts = step.cmd.trim().split(/\s+/);
  let procId;
  try {
    const res  = await fetch('/api/process/start', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cmd: parts[0], args: parts.slice(1), label, cwd: currentProjectPath }),
    });
    const data = await res.json();
    procId = data.id;
  } catch {
    routineRunState = null;
    renderRoutineList();
    return;
  }

  // ログタブへ切り替えてプロセスを選択
  document.querySelector('.tab[data-tab="logs"]').click();
  refreshProcessList(procId);

  // ステップ完了を監視する専用 SSE
  if (routineMonitorSSE) { routineMonitorSSE.close(); routineMonitorSSE = null; }
  const sse = new EventSource(`/api/process/stream?id=${procId}`);
  routineMonitorSSE = sse;

  sse.onmessage = e => {
    const { type, data } = JSON.parse(e.data);
    if (type !== 'exit') return;
    sse.close();
    routineMonitorSSE = null;

    const m    = data.match(/code:\s*(-?\d+)/);
    const code = m ? parseInt(m[1]) : 1;

    if (code !== 0 && seq.stopOnError !== false) {
      routineRunState = null;
      renderRoutineList();
      return;
    }

    routineRunState.stepIdx++;
    if (routineRunState.stepIdx >= seq.steps.length) {
      routineRunState = null;
    }
    renderRoutineList();
    if (routineRunState) startRoutineStep();
  };

  sse.onerror = () => {
    sse.close();
    routineMonitorSSE = null;
    if (routineRunState) { routineRunState = null; renderRoutineList(); }
  };
}

// =====================================================================
// R9: コンテキスト対応コマンドビルダー
// =====================================================================

// ---- Flutter ビルダー ----

const ctxFlutterFetch = document.getElementById('ctx-flutter-fetch');
const ctxFlutterBody  = document.getElementById('ctx-flutter-body');
const ctxDeviceSelect = document.getElementById('ctx-device');
const ctxEntrySelect  = document.getElementById('ctx-entry');
const ctxFlavorRow    = document.getElementById('ctx-flavor-row');
const ctxFlavorSelect = document.getElementById('ctx-flavor');
const ctxRunSet       = document.getElementById('ctx-run-set');
const ctxAttachSet    = document.getElementById('ctx-attach-set');
const ctxBuildSet     = document.getElementById('ctx-build-set');

let ctxFlutterMode = ''; // '' = debug | '--release' | '--profile'

document.querySelectorAll('.ctx-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ctx-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ctxFlutterMode = btn.dataset.mode;
  });
});

ctxFlutterFetch.addEventListener('click', async () => {
  ctxFlutterFetch.textContent = '取得中...';
  ctxFlutterFetch.disabled    = true;
  try {
    const res  = await fetch(`/api/context/flutter?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();

    // デバイス
    ctxDeviceSelect.innerHTML = data.devices && data.devices.length
      ? '<option value="">-- 選択 --</option>'
      : '<option value="">（接続なし）</option>';
    (data.devices || []).forEach(d => {
      const opt = document.createElement('option');
      opt.value       = d.id;
      opt.textContent = `${d.emulator ? '📱' : '🔌'} ${d.name}  (${d.id})`;
      ctxDeviceSelect.appendChild(opt);
    });

    // エントリポイント
    ctxEntrySelect.innerHTML = '';
    (data.entryPoints && data.entryPoints.length ? data.entryPoints : ['lib/main.dart']).forEach(e => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = e;
      ctxEntrySelect.appendChild(opt);
    });

    // フレーバー
    if (data.flavors && data.flavors.length) {
      ctxFlavorSelect.innerHTML = '<option value="">-- なし --</option>';
      data.flavors.forEach(f => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = f;
        ctxFlavorSelect.appendChild(opt);
      });
      ctxFlavorRow.classList.remove('hidden');
    } else {
      ctxFlavorRow.classList.add('hidden');
    }

    ctxFlutterBody.classList.remove('hidden');
  } finally {
    ctxFlutterFetch.textContent = '更新 ↺';
    ctxFlutterFetch.disabled    = false;
  }
});

function buildFlutterCmd(base) {
  const device = ctxDeviceSelect.value;
  const entry  = ctxEntrySelect.value;
  const flavor = ctxFlavorSelect ? ctxFlavorSelect.value : '';
  let cmd = base;
  if (device) cmd += ` -d ${device}`;
  if (flavor) cmd += ` --flavor ${flavor}`;
  if (entry && entry !== 'lib/main.dart') cmd += ` -t ${entry}`;
  if (ctxFlutterMode) cmd += ` ${ctxFlutterMode}`;
  return cmd;
}

ctxRunSet.addEventListener('click', () => {
  runCommand(buildFlutterCmd('flutter run'), 'flutter run');
});
ctxAttachSet.addEventListener('click', () => {
  const d = ctxDeviceSelect.value;
  runCommand(`flutter attach${d ? ' -d ' + d : ''}`, 'flutter attach');
});
ctxBuildSet.addEventListener('click', () => {
  runCommand(buildFlutterCmd('flutter build apk'), 'flutter build apk');
});

// ---- Firebase ビルダー ----

const ctxFbFetch     = document.getElementById('ctx-firebase-fetch');
const ctxFbBody      = document.getElementById('ctx-firebase-body');
const ctxFbEmulators = document.getElementById('ctx-fb-emulators');
const ctxFbDeploy    = document.getElementById('ctx-fb-deploy');
const ctxFbEmuSet    = document.getElementById('ctx-fb-emu-set');
const ctxFbDeploySet = document.getElementById('ctx-fb-deploy-set');

ctxFbFetch.addEventListener('click', async () => {
  ctxFbFetch.textContent = '読み込み中...';
  ctxFbFetch.disabled    = true;
  try {
    const res  = await fetch(`/api/context/firebase?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();

    // Emulator チェックボックス
    ctxFbEmulators.innerHTML = '';
    if (data.emulators && data.emulators.length) {
      data.emulators.forEach(e => {
        const lbl = document.createElement('label');
        lbl.className = 'ctx-check-label';
        lbl.innerHTML = `<input type="checkbox" value="${escHtml(e)}" checked> ${escHtml(e)}`;
        ctxFbEmulators.appendChild(lbl);
      });
    } else {
      ctxFbEmulators.innerHTML = '<span class="ctx-muted">firebase.json に emulators 設定なし</span>';
    }

    // Deploy ターゲット チェックボックス
    ctxFbDeploy.innerHTML = '';
    if (data.deployTargets && data.deployTargets.length) {
      data.deployTargets.forEach(t => {
        const lbl = document.createElement('label');
        lbl.className = 'ctx-check-label';
        lbl.innerHTML = `<input type="checkbox" value="${escHtml(t)}"> ${escHtml(t)}`;
        ctxFbDeploy.appendChild(lbl);
      });
    } else {
      ctxFbDeploy.innerHTML = '<span class="ctx-muted">firebase.json 未検出</span>';
    }

    ctxFbBody.classList.remove('hidden');
  } finally {
    ctxFbFetch.textContent = '再読み込み ↺';
    ctxFbFetch.disabled    = false;
  }
});

ctxFbEmuSet.addEventListener('click', () => {
  const checked = [...ctxFbEmulators.querySelectorAll('input:checked')].map(i => i.value);
  const only    = checked.length ? ` --only ${checked.join(',')}` : '';
  runCommand(`firebase emulators:start${only}`, `emulators:start${only}`);
});

ctxFbDeploySet.addEventListener('click', () => {
  const checked = [...ctxFbDeploy.querySelectorAll('input:checked')].map(i => i.value);
  if (!checked.length) { alert('デプロイ対象を選択してください'); return; }
  const only = ` --only ${checked.join(',')}`;
  runCommand(`firebase deploy${only}`, `deploy${only}`);
});

// ---- Git クイックアクション ----

const gitQaFetch       = document.getElementById('git-qa-fetch');
const ctxGitBranch     = document.getElementById('ctx-git-branch');
const ctxGitCheckout   = document.getElementById('ctx-git-checkout');
const ctxGitMerge      = document.getElementById('ctx-git-merge');
const ctxGitStashRow   = document.getElementById('ctx-git-stash-row');
const ctxGitStash      = document.getElementById('ctx-git-stash');
const ctxGitStashPop   = document.getElementById('ctx-git-stash-pop');
const ctxGitStashApply = document.getElementById('ctx-git-stash-apply');
const gitQaResult      = document.getElementById('git-qa-result');

async function loadGitContext() {
  if (!currentProjectPath) return;
  gitQaFetch.textContent = '取得中...';
  gitQaFetch.disabled    = true;
  try {
    const res  = await fetch(`/api/context/git?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();

    // ブランチ
    ctxGitBranch.innerHTML = '';
    (data.branches || []).forEach(b => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = b;
      if (b === data.currentBranch) opt.selected = true;
      ctxGitBranch.appendChild(opt);
    });

    // スタッシュ
    if (data.stashes && data.stashes.length) {
      ctxGitStash.innerHTML = '';
      data.stashes.forEach(s => {
        const opt = document.createElement('option');
        opt.value       = s.ref;
        opt.textContent = `${s.ref}: ${s.message}`;
        ctxGitStash.appendChild(opt);
      });
      ctxGitStashRow.classList.remove('hidden');
    } else {
      ctxGitStashRow.classList.add('hidden');
    }
  } finally {
    gitQaFetch.textContent = '更新 ↺';
    gitQaFetch.disabled    = false;
  }
}

gitQaFetch.addEventListener('click', loadGitContext);
ctxGitCheckout.addEventListener('click', async () => {
  const b = ctxGitBranch.value;
  if (!b) return;
  ctxGitCheckout.disabled = true;
  const r = await gitOp('/api/git/checkout', { path: currentProjectPath, branch: b });
  ctxGitCheckout.disabled = false;
  showGitResult(gitQaResult, r.ok, r.ok ? `checkout: ${b}` : (r.error || 'checkout 失敗'));
  if (r.ok) { loadGitContext(); loadGitStatus(); }
});
ctxGitMerge.addEventListener('click', async () => {
  const b = ctxGitBranch.value;
  if (!b) return;
  ctxGitMerge.disabled = true;
  const r = await gitOp('/api/git/merge', { path: currentProjectPath, branch: b });
  ctxGitMerge.disabled = false;
  showGitResult(gitQaResult, r.ok, r.ok ? `merge: ${b}` : (r.error || 'merge 失敗'));
  if (r.ok) { loadGitContext(); loadGitStatus(); }
});
ctxGitStashPop.addEventListener('click', async () => {
  const s = ctxGitStash.value;
  ctxGitStashPop.disabled = true;
  const r = await gitOp('/api/git/stash-pop', { path: currentProjectPath, ref: s });
  ctxGitStashPop.disabled = false;
  showGitResult(gitQaResult, r.ok, r.ok ? 'stash pop 完了' : (r.error || 'stash pop 失敗'));
  if (r.ok) { loadGitContext(); loadGitStatus(); }
});
ctxGitStashApply.addEventListener('click', async () => {
  const s = ctxGitStash.value;
  ctxGitStashApply.disabled = true;
  const r = await gitOp('/api/git/stash-apply', { path: currentProjectPath, ref: s });
  ctxGitStashApply.disabled = false;
  showGitResult(gitQaResult, r.ok, r.ok ? 'stash apply 完了' : (r.error || 'stash apply 失敗'));
  if (r.ok) { loadGitContext(); loadGitStatus(); }
});

// =====================================================================
// ドキュメントビューア（フェーズ4）
// =====================================================================

const docsFileList      = document.getElementById('docs-file-list');
const docsBody          = document.getElementById('docs-body');
const docsBreadcrumb    = document.getElementById('docs-breadcrumb');
const docsFullscreenBtn = document.getElementById('docs-fullscreen-btn');
const docsContent       = document.getElementById('docs-content');
const docsZoomIn        = document.getElementById('docs-zoom-in');
const docsZoomOut       = document.getElementById('docs-zoom-out');
const docsZoomReset     = document.getElementById('docs-zoom-reset');
const docsZoomLevel     = document.getElementById('docs-zoom-level');

// ---- 全画面トグル ----
docsFullscreenBtn.addEventListener('click', () => {
  const isFs = docsContent.classList.toggle('docs-fullscreen');
  docsFullscreenBtn.title       = isFs ? '全画面を閉じる' : '全画面表示';
  docsFullscreenBtn.textContent = isFs ? '✕' : '⛶';
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && docsContent.classList.contains('docs-fullscreen')) {
    docsContent.classList.remove('docs-fullscreen');
    docsFullscreenBtn.title       = '全画面表示';
    docsFullscreenBtn.textContent = '⛶';
  }
});

// ---- 文書ズーム ----
const ZOOM_STEP = 0.1;
const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 3.0;
let   docsZoom  = 1.0;

function setDocsZoom(level) {
  docsZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(level * 10) / 10));
  docsBody.style.zoom = docsZoom;
  docsZoomLevel.textContent = Math.round(docsZoom * 100) + '%';
}

docsZoomIn   .onclick = () => setDocsZoom(docsZoom + ZOOM_STEP);
docsZoomOut  .onclick = () => setDocsZoom(docsZoom - ZOOM_STEP);
docsZoomReset.onclick = () => setDocsZoom(1.0);

// Ctrl + ホイールでズーム
docsContent.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setDocsZoom(docsZoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
}, { passive: false });

// ---- Mermaid ダイアグラム: ホイールズーム + ドラッグパン ----
function makeDiagramInteractive(container) {
  const svg = container.querySelector('svg');
  if (!svg) return;

  let scale = 1, tx = 0, ty = 0;
  let dragging = false, startX = 0, startY = 0;

  svg.style.transformOrigin = '0 0';
  svg.style.willChange      = 'transform';
  container.style.cursor    = 'grab';
  container.style.overflow  = 'hidden';
  container.title = 'ホイール: ズーム / ドラッグ: パン / ダブルクリック: リセット';

  function applyTransform() {
    svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  container.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation();
    // マウス位置を基準にズーム
    const rect   = container.getBoundingClientRect();
    const mx     = (e.clientX - rect.left - tx) / scale;
    const my     = (e.clientY - rect.top  - ty) / scale;
    const delta  = e.deltaY < 0 ? 0.12 : -0.12;
    scale = Math.max(0.2, Math.min(8, scale + delta));
    tx = e.clientX - rect.left - mx * scale;
    ty = e.clientY - rect.top  - my * scale;
    applyTransform();
  }, { passive: false });

  container.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.clientX - tx;
    startY   = e.clientY - ty;
    container.style.cursor = 'grabbing';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    tx = e.clientX - startX;
    ty = e.clientY - startY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    container.style.cursor = 'grab';
  });

  container.addEventListener('dblclick', () => {
    scale = 1; tx = 0; ty = 0;
    applyTransform();
  });
}

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

  // ファイルパスからツリーを構築: { _files: [], <dirname>: node, ... }
  const root = { _files: [] };
  files.forEach(f => {
    const parts = f.relPath.replace(/\\/g, '/').split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const d = parts[i];
      if (!node[d]) node[d] = { _files: [] };
      node = node[d];
    }
    node._files.push(f);
  });

  function renderNode(node, depth) {
    const padLeft = 8 + depth * 16; // px

    // サブディレクトリ（アルファベット順）→ 中身を再帰
    Object.entries(node)
      .filter(([k]) => k !== '_files')
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, child]) => {
        const sep = document.createElement('li');
        sep.className = 'docs-dir';
        sep.style.paddingLeft = `${padLeft}px`;
        sep.dataset.depth = depth;
        sep.textContent = `📁 ${key}`;
        docsFileList.appendChild(sep);
        renderNode(child, depth + 1);
      });

    // ファイル（アルファベット順）
    (node._files || [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(f => {
        const li = document.createElement('li');
        li.style.paddingLeft = `${padLeft}px`;
        li.dataset.depth = depth;
        li.textContent = `📄 ${f.name}`;
        li.title = f.relPath;
        li.dataset.rel = f.relPath;
        li.classList.toggle('active', f.relPath === currentDocFile);
        li.onclick = () => loadMdFile(f.relPath, f.name);
        docsFileList.appendChild(li);
      });
  }

  renderNode(root, 0);
}

async function loadMdFile(relPath) {
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

  // Mermaid ブロックを変換して描画
  const mermaidBlocks = [];
  docsBody.querySelectorAll('pre code.language-mermaid').forEach(code => {
    const div = document.createElement('div');
    div.className   = 'mermaid-diagram';
    div.textContent = code.textContent;
    code.closest('pre').replaceWith(div);
    mermaidBlocks.push(div);
  });
  if (mermaidBlocks.length > 0 && typeof window.__mermaid !== 'undefined') {
    window.__mermaid.run({ nodes: mermaidBlocks })
      .then(() => mermaidBlocks.forEach(makeDiagramInteractive))
      .catch(() => {});
  }

  // Markdown 内リンクをインターセプト（.md リンクはビューア内で開く）
  docsBody.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href && !href.startsWith('http') && href.endsWith('.md')) {
      a.addEventListener('click', e => {
        e.preventDefault();
        const base   = relPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
        const target = base ? `${base}/${href}` : href;
        loadMdFile(target);
      });
    } else if (href && href.startsWith('http')) {
      a.setAttribute('rel', 'noopener');
      a.setAttribute('target', '_blank');
    }
  });

  // highlight.js で再描画（mermaid 以外の code ブロック）
  if (typeof hljs !== 'undefined') {
    docsBody.querySelectorAll('pre code:not(.language-mermaid)').forEach(block => hljs.highlightElement(block));
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
const depsThType          = document.getElementById('deps-th-type');

// Persist threshold in localStorage
depsThreshold.value = localStorage.getItem('deps-threshold') || '7';
depsThreshold.addEventListener('change', () => {
  localStorage.setItem('deps-threshold', depsThreshold.value);
});

// サブタブ切り替え: pubspec | npm | cdn | security
let depsSource    = 'pubspec';
let depsActiveTab = 'pubspec';

document.querySelectorAll('.deps-tab').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.deps-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    depsActiveTab = btn.dataset.depsTab;
    if (depsActiveTab !== 'security' && depsActiveTab !== 'tree') depsSource = depsActiveTab;
    applyDepsTabUi(depsActiveTab);
    if (depsActiveTab === 'tree' && currentProjectPath) {
      if (treeType === 'npm') {
        await loadNpmPkgList();
        treePkgdirSelect.classList.remove('hidden');
      } else {
        treePkgdirSelect.classList.add('hidden');
      }
      loadTree(false);
      return;
    }
    if (depsActiveTab === 'security' && currentProjectPath) { loadOsv(false); return; }
    if (depsActiveTab === 'npm'      && currentProjectPath) { await loadNpmPkgList(); }
    if (currentProjectPath) checkDeps();
  });
});

const npmPkgdirRow    = document.getElementById('npm-pkgdir-row');
const npmPkgdirSelect = document.getElementById('npm-pkgdir-select');

npmPkgdirSelect.addEventListener('change', () => {
  currentNpmDir = npmPkgdirSelect.value || null;
  checkDeps(false);
});

async function loadNpmPkgList({ treeSelect = false } = {}) {
  if (!currentProjectPath) return;
  try {
    const res  = await fetch(`/api/npm/list?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    const dirs = data.dirs || [];
    const optHtml = dirs.map(d =>
      `<option value="${escHtml(d.dir)}">${escHtml(d.label)}</option>`
    ).join('');

    // package.json タブのセレクタ
    npmPkgdirSelect.innerHTML = optHtml;
    if (dirs.length > 1) {
      npmPkgdirRow.classList.remove('hidden');
    } else {
      npmPkgdirRow.classList.add('hidden');
    }

    // 依存ツリータブのセレクタ
    treePkgdirSelect.innerHTML = optHtml;

    // currentNpmDir を確定（プロジェクト変更後は先頭に戻す）
    if (!currentNpmDir || !dirs.some(d => d.dir === currentNpmDir)) {
      currentNpmDir = dirs[0]?.dir || null;
    }
    npmPkgdirSelect.value  = currentNpmDir || '';
    treePkgdirSelect.value = currentNpmDir || '';
  } catch {}
}

const npmAuditBar        = document.getElementById('npm-audit-bar');
const npmAuditCritical   = document.getElementById('npm-audit-critical');
const npmAuditHigh       = document.getElementById('npm-audit-high');
const npmAuditModerate   = document.getElementById('npm-audit-moderate');
const npmAuditLow        = document.getElementById('npm-audit-low');
const npmAuditOk         = document.getElementById('npm-audit-ok');
const npmAuditCriticalN  = document.getElementById('npm-audit-critical-n');
const npmAuditHighN      = document.getElementById('npm-audit-high-n');
const npmAuditModerateN  = document.getElementById('npm-audit-moderate-n');
const npmAuditLowN       = document.getElementById('npm-audit-low-n');
const npmAuditDetailBtn  = document.getElementById('npm-audit-detail-btn');
const npmAuditDetail     = document.getElementById('npm-audit-detail');

let npmAuditDetailOpen = false;

document.getElementById('npm-audit-fix-btn').onclick = () => {
  runCommand('npm audit fix', 'audit fix');
  document.querySelector('.tab[data-tab="logs"]').click();
};
document.getElementById('npm-audit-force-btn').onclick = () => {
  if (!confirm('npm audit fix --force は破壊的変更を含む可能性があります。実行しますか？')) return;
  runCommand('npm audit fix --force', 'audit fix --force');
  document.querySelector('.tab[data-tab="logs"]').click();
};
document.getElementById('npm-audit-recheck-btn').onclick = () => runNpmAudit();

npmAuditDetailBtn.onclick = () => {
  npmAuditDetailOpen = !npmAuditDetailOpen;
  npmAuditDetail.classList.toggle('hidden', !npmAuditDetailOpen);
  npmAuditDetailBtn.textContent = npmAuditDetailOpen ? '詳細 ▲' : '詳細 ▼';
};

function applyDepsTabUi(tab) {
  const isSecurity = tab === 'security';
  const isNpm = tab === 'npm';
  const isCdn = tab === 'cdn';
  const isTree = tab === 'tree';
  const hideTable = isSecurity || isTree;

  // サブパネル切り替え
  ['pubspec', 'npm', 'cdn', 'security', 'tree'].forEach(t => {
    document.getElementById(`deps-panel-${t}`).classList.toggle('hidden', t !== tab);
  });

  // セキュリティ・ツリータブではテーブル・ツールバーを非表示
  depsTableWrap.classList.toggle('hidden', hideTable);
  depsStatus.classList.toggle('hidden', hideTable);
  depsRefreshBtn.classList.toggle('hidden', hideTable);
  depsCompareBtn.classList.toggle('hidden', hideTable);

  // テーブルカラム制御
  depsThCheck.classList.toggle('hidden', !isNpm);
  depsThProvenance.classList.toggle('hidden', !isNpm && !isCdn);
  depsThProvenance.textContent = isCdn ? 'CDN' : 'Provenance';
  depsThType.textContent = isCdn ? 'ファイル' : '種別';
}

depsRefreshBtn.onclick = () => checkDeps(true); // force=true でキャッシュ無視
depsPubgetBtn.onclick  = () => { runCommand('flutter pub get', 'pub get'); document.querySelector('.tab[data-tab="logs"]').click(); };
depsUpgradeBtn.onclick = () => { runCommand('flutter pub upgrade', 'pub upgrade'); document.querySelector('.tab[data-tab="logs"]').click(); };

// Header checkbox: select / deselect all
depsCheckAll.addEventListener('change', () => {
  document.querySelectorAll('.deps-pkg-check').forEach(cb => { cb.checked = depsCheckAll.checked; });
});

// Select trusted packages only (provenance true AND age >= threshold)
document.getElementById('deps-select-trusted').addEventListener('click', () => {
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
});

async function checkDeps(force = false) {
  if (!currentProjectPath) { alert('プロジェクトを選択してください'); return; }

  const isNpm = depsSource === 'npm';
  const isCdn = depsSource === 'cdn';
  const waitMsg = isNpm ? '⏳ npm registry に問い合わせ中...'
    : isCdn ? '⏳ CDN ライブラリを確認中...'
    : '⏳ pub.dev に問い合わせ中...';
  depsStatus.textContent = waitMsg;
  depsTbody.innerHTML = `<tr><td colspan="9" class="deps-empty">読み込み中...</td></tr>`;
  depsRefreshBtn.disabled = true;

  applyDepsTabUi(depsActiveTab);
  depsCheckAll.checked = false;

  const forceParam = force ? '&force=1' : '';
  const npmPath    = isNpm ? (currentNpmDir || currentProjectPath) : currentProjectPath;
  const endpoint = isNpm
    ? `/api/npm/check?path=${encodeURIComponent(npmPath)}${forceParam}`
    : isCdn
      ? `/api/cdn/check?path=${encodeURIComponent(currentProjectPath)}${forceParam}`
      : `/api/pubspec/check?path=${encodeURIComponent(currentProjectPath)}${forceParam}`;

  try {
    const res  = await fetch(endpoint);
    const data = await res.json();

    if (data.error) {
      depsStatus.textContent = `⚠ ${data.error}`;
      depsTbody.innerHTML = `<tr><td colspan="9" class="deps-empty">${escHtml(data.error)}</td></tr>`;
      return;
    }

    depsProjectName.textContent = data.projectName || '';
    renderDepsTable(data.packages, depsSource);

    const threshold = parseInt(depsThreshold.value, 10) || 7;
    const both   = data.packages.filter(p => p.status === 'both').length;
    const major  = data.packages.filter(p => p.status === 'major').length;
    const minor  = data.packages.filter(p => p.status === 'minor').length;
    const young  = data.packages.filter(p => p.currentAgeInDays !== null && p.currentAgeInDays < threshold).length;
    const noSig  = isNpm ? data.packages.filter(p => p.provenance === false).length : 0;
    const total  = data.packages.length;

    let summary = `✓ ${total}件チェック完了 — MAJOR: ${major + both}件  minor: ${minor + both}件`;
    if (young > 0) summary += `  ⚠ 新着 ${threshold}日未満: ${young}件`;
    if (noSig > 0) summary += `  ⚠ Provenance なし: ${noSig}件`;

    // キャッシュ表示
    if (data.cached && data.cachedAt) {
      const ageMin = Math.round((Date.now() - data.cachedAt) / 60000);
      const ageStr = ageMin < 60
        ? `${ageMin}分前`
        : `${Math.floor(ageMin / 60)}時間${ageMin % 60 ? ageMin % 60 + '分' : ''}前`;
      summary += `  （キャッシュ: ${ageStr}）`;
    }

    depsStatus.textContent = summary;

    // npm の場合は audit も実行
    if (isNpm) runNpmAudit();

  } catch (e) {
    depsStatus.textContent = `エラー: ${e.message}`;
  } finally {
    depsRefreshBtn.disabled = false;
  }
}

async function runNpmAudit() {
  if (!currentProjectPath) return;
  npmAuditBar.classList.remove('hidden');
  npmAuditOk.classList.add('hidden');
  npmAuditDetailBtn.classList.add('hidden');
  npmAuditDetail.classList.add('hidden');
  npmAuditDetailOpen = false;
  npmAuditDetailBtn.textContent = '詳細 ▼';
  [npmAuditCritical, npmAuditHigh, npmAuditModerate, npmAuditLow].forEach(el => {
    el.classList.remove('hidden');
    el.classList.add('audit-loading');
  });

  const res  = await fetch(`/api/npm/audit?path=${encodeURIComponent(currentNpmDir || currentProjectPath)}`);
  const data = await res.json();

  [npmAuditCritical, npmAuditHigh, npmAuditModerate, npmAuditLow].forEach(el => el.classList.remove('audit-loading'));

  if (data.error) {
    npmAuditCritical.classList.add('hidden');
    npmAuditHigh.classList.add('hidden');
    npmAuditModerate.classList.add('hidden');
    npmAuditLow.classList.add('hidden');
    npmAuditOk.textContent = `⚠ ${data.error}`;
    npmAuditOk.classList.remove('hidden');
    return;
  }

  npmAuditCriticalN.textContent = data.critical;
  npmAuditHighN.textContent     = data.high;
  npmAuditModerateN.textContent = data.moderate;
  npmAuditLowN.textContent      = data.low;

  const noVulns = data.total === 0;
  npmAuditOk.textContent = '問題なし ✓';
  npmAuditOk.classList.toggle('hidden', !noVulns);
  [npmAuditCritical, npmAuditHigh, npmAuditModerate, npmAuditLow].forEach(el => {
    el.classList.toggle('hidden', noVulns);
    el.classList.toggle('audit-zero', !noVulns && +el.querySelector('b').textContent === 0);
  });

  // 詳細ボタンは脆弱性がある場合のみ表示
  if (!noVulns && data.details && data.details.length > 0) {
    npmAuditDetailBtn.classList.remove('hidden');
    renderNpmAuditDetail(data.details);
  }

  // npm タブのサマリー行を更新
  const summaryEl = document.getElementById('npm-audit-summary');
  const badgesEl  = document.getElementById('npm-audit-summary-badges');
  summaryEl.classList.remove('hidden');
  if (noVulns) {
    badgesEl.innerHTML = '<span class="npm-audit-summary-ok">問題なし ✓</span>';
  } else {
    const SEV = [
      ['critical', data.critical], ['high', data.high],
      ['moderate', data.moderate], ['low', data.low],
    ];
    badgesEl.innerHTML = SEV
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `<span class="npm-audit-badge audit-${s}">${s}: <b>${n}</b></span>`)
      .join('');
  }
}

document.getElementById('npm-audit-goto-security').onclick = () => {
  document.querySelector('.deps-tab[data-deps-tab="security"]').click();
};

function renderNpmAuditDetail(details) {
  let html = '<table class="npm-audit-detail-table"><tbody>';
  for (const v of details) {
    const sev   = escHtml(v.severity);
    const name  = escHtml(v.name);
    const range = v.range ? escHtml(v.range) : '—';
    const via   = v.isDirect
      ? '<span class="audit-direct">直接</span>'
      : v.via.length > 0
        ? `via: ${v.via.map(escHtml).join(', ')}`
        : '間接';

    let fixCell = '<span class="audit-nofix">fix なし</span>';
    if (v.fixAvailable === true) {
      fixCell = '<span class="audit-fix">fix あり</span>';
    } else if (v.fixAvailable && typeof v.fixAvailable === 'object') {
      const major = v.fixAvailable.isSemVerMajor ? ' <span class="badge badge-major">MAJOR</span>' : '';
      fixCell = `<span class="audit-fix">fix: ${escHtml(v.fixAvailable.name)}@${escHtml(v.fixAvailable.version)}</span>${major}`;
    }

    const titleHtml = v.title
      ? v.url
        ? `<a href="${escHtml(v.url)}" target="_blank" rel="noopener" class="audit-advisory-link">${escHtml(v.title)}</a>`
        : `<span class="audit-advisory-title">${escHtml(v.title)}</span>`
      : '';

    html += `<tr>
      <td><span class="npm-audit-badge audit-${sev}">${sev}</span></td>
      <td class="audit-pkg-name">${name}</td>
      <td class="audit-range">${range}</td>
      <td class="audit-via">${via}</td>
      <td class="audit-title">${titleHtml}</td>
      <td>${fixCell}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  npmAuditDetail.innerHTML = html;
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

// =====================================================================
// R5: 依存比較モード
// =====================================================================

const depsCompareBtn   = document.getElementById('deps-compare-btn');
const depsComparePanel = document.getElementById('deps-compare-panel');
const depsTableWrap    = document.getElementById('deps-table-wrap');
const cmpBranchSelect  = document.getElementById('cmp-branch-select');
const cmpProjectSelect = document.getElementById('cmp-project-select');
const cmpFetchBtn      = document.getElementById('cmp-fetch-btn');
const cmpRunBtn        = document.getElementById('cmp-run-btn');
const cmpDiffOnly      = document.getElementById('cmp-diff-only');
const cmpStatus        = document.getElementById('cmp-status');
const cmpTableWrap     = document.getElementById('cmp-table-wrap');
const cmpTbody         = document.getElementById('cmp-tbody');
const cmpThCurrent     = document.getElementById('cmp-th-current');
const cmpThTarget      = document.getElementById('cmp-th-target');

let cmpMode        = 'branch'; // 'branch' | 'project'
let compareActive  = false;
let lastCmpData    = null;

// 比較ボタン（比較モードは pubspec / npm のみ）
depsCompareBtn.onclick = () => {
  compareActive = !compareActive;
  depsCompareBtn.classList.toggle('active', compareActive);
  depsComparePanel.classList.toggle('hidden', !compareActive);
  depsTableWrap.classList.toggle('hidden', compareActive);
  npmAuditDetail.classList.toggle('hidden', true);
  if (compareActive) loadCmpOptions();
};

// モード切り替え
document.querySelectorAll('.cmp-mode-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.cmp-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cmpMode = btn.dataset.cmpMode;
    cmpBranchSelect.classList.toggle('hidden',  cmpMode !== 'branch');
    cmpProjectSelect.classList.toggle('hidden', cmpMode !== 'project');
  };
});

cmpFetchBtn.onclick = () => loadCmpOptions();
cmpDiffOnly.addEventListener('change', () => { if (lastCmpData) renderCmpTable(lastCmpData); });

async function loadCmpOptions() {
  cmpFetchBtn.disabled = true;

  if (cmpMode === 'branch') {
    cmpBranchSelect.innerHTML = '<option value="">読み込み中...</option>';
    const res  = await fetch(`/api/depcompare/branches?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    cmpBranchSelect.innerHTML = '';
    if (data.error || !data.branches.length) {
      cmpBranchSelect.innerHTML = '<option value="">ブランチなし</option>';
    } else {
      data.branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value       = b;
        opt.textContent = b;
        cmpBranchSelect.appendChild(opt);
      });
    }
  } else {
    cmpProjectSelect.innerHTML = '<option value="">読み込み中...</option>';
    const res  = await fetch('/api/depcompare/history');
    const data = await res.json();
    cmpProjectSelect.innerHTML = '';
    const others = (data.history || []).filter(h => h.path !== currentProjectPath);
    if (!others.length) {
      cmpProjectSelect.innerHTML = '<option value="">他のプロジェクトなし</option>';
    } else {
      others.forEach(h => {
        const opt = document.createElement('option');
        opt.value       = h.path;
        opt.textContent = h.name;
        opt.title       = h.path;
        cmpProjectSelect.appendChild(opt);
      });
    }
  }

  cmpFetchBtn.disabled = false;
}

cmpRunBtn.onclick = async () => {
  if (!currentProjectPath) return;
  const type = depsSource === 'npm' ? 'npm' : 'pubspec';

  let qp = `path=${encodeURIComponent(currentProjectPath)}&type=${type}`;
  if (cmpMode === 'branch') {
    const branch = cmpBranchSelect.value;
    if (!branch) { cmpStatus.textContent = 'ブランチを選択してください'; return; }
    qp += `&branch=${encodeURIComponent(branch)}`;
  } else {
    const otherPath = cmpProjectSelect.value;
    if (!otherPath) { cmpStatus.textContent = 'プロジェクトを選択してください'; return; }
    qp += `&otherPath=${encodeURIComponent(otherPath)}`;
  }

  cmpRunBtn.disabled = true;
  cmpStatus.textContent = '比較中...';
  cmpTableWrap.classList.add('hidden');

  const res  = await fetch(`/api/depcompare/compare?${qp}`);
  const data = await res.json();
  cmpRunBtn.disabled = false;

  if (data.error) { cmpStatus.textContent = `⚠ ${data.error}`; return; }

  lastCmpData = data;
  cmpThCurrent.textContent = data.currentName;
  cmpThTarget.textContent  = data.targetName || data.targetLabel;

  renderCmpTable(data);

  const added   = data.diff.filter(r => r.status === 'added').length;
  const removed = data.diff.filter(r => r.status === 'removed').length;
  const newer   = data.diff.filter(r => r.status === 'newer').length;
  const older   = data.diff.filter(r => r.status === 'older').length;
  const same    = data.diff.filter(r => r.status === 'same').length;
  cmpStatus.textContent =
    `${data.diff.length}件 — 新: ${newer}件  旧: ${older}件  追加: ${added}件  削除: ${removed}件  同: ${same}件`;
};

function renderCmpTable(data) {
  const diffOnly = cmpDiffOnly.checked;
  const rows = diffOnly ? data.diff.filter(r => r.status !== 'same') : data.diff;

  cmpTbody.innerHTML = '';
  if (rows.length === 0) {
    cmpTbody.innerHTML = `<tr><td colspan="5" class="deps-empty">差分なし</td></tr>`;
    cmpTableWrap.classList.remove('hidden');
    return;
  }

  const statusLabel = {
    newer:   { text: '↑ 現在が新しい', cls: 'cmp-newer' },
    older:   { text: '↓ 現在が古い',   cls: 'cmp-older' },
    same:    { text: '─',              cls: 'cmp-same'  },
    added:   { text: '＋ 追加',         cls: 'cmp-added' },
    removed: { text: '－ 削除',         cls: 'cmp-removed' },
    changed: { text: '≠ 変更',          cls: 'cmp-changed' },
  };

  rows.forEach(r => {
    const tr  = document.createElement('tr');
    const { text, cls } = statusLabel[r.status] || { text: r.status, cls: '' };
    tr.className = cls;
    tr.innerHTML = `
      <td class="cmp-pkg-name">${escHtml(r.name)}</td>
      <td class="cmp-ver">${escHtml(r.current || '—')}</td>
      <td class="cmp-ver">${escHtml(r.target  || '—')}</td>
      <td class="cmp-status-cell"><span class="cmp-badge ${cls}">${text}</span></td>
      <td class="cmp-dev">${r.dev ? '<span class="badge-dev">dev</span>' : ''}</td>`;
    cmpTbody.appendChild(tr);
  });

  cmpTableWrap.classList.remove('hidden');
}

// タブ切り替え時に比較モードを終了
document.querySelectorAll('.deps-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    if (compareActive) {
      compareActive = false;
      depsCompareBtn.classList.remove('active');
      depsComparePanel.classList.add('hidden');
      depsTableWrap.classList.remove('hidden');
    }
  });
});

function renderDepsTable(packages, source) {
  const showProvenance = source === 'npm';
  const showCdn        = source === 'cdn';
  depsTbody.innerHTML = '';
  if (!packages || packages.length === 0) {
    depsTbody.innerHTML = `<tr><td colspan="9" class="deps-empty">パッケージなし</td></tr>`;
    return;
  }

  const threshold = parseInt(depsThreshold.value, 10) || 7;

  packages.forEach(p => {
    const tr = document.createElement('tr');

    const statusLabel = {
      latest:  '✓ 最新',
      minor:   '↑ minor',
      major:   '⚠ MAJOR',
      both:    '↑⚠ 両方',
      unknown: '— 不明',
    }[p.status] || '—';

    const badgeClass = `badge badge-${p.status === 'both' ? 'major' : p.status}`;
    const current = p.current ?? '—';

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

    // Checkbox (npm only)
    const checkCell = document.createElement('td');
    checkCell.className = showProvenance ? 'deps-check-cell' : 'hidden';
    if (showProvenance) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'deps-pkg-check';
      cb.dataset.name = p.name;
      cb.dataset.version = p.current ?? '';
      checkCell.appendChild(cb);
      tr.appendChild(checkCell);
    } else {
      tr.appendChild(checkCell);
    }

    // Minor / Major version cells — clickable to select as install target
    function makeVersionCell(ver, type) {
      const td = document.createElement('td');
      td.className = `deps-ver-cell deps-ver-${type}`;
      if (ver) {
        const span = document.createElement('span');
        span.className = `deps-ver-btn badge-ver-${type}`;
        span.textContent = ver;
        span.title = `${type === 'minor' ? 'minor 更新' : 'MAJOR 更新'}: ${ver} を選択`;
        span.addEventListener('click', () => {
          // Highlight selection in this row
          tr.querySelectorAll('.deps-ver-btn').forEach(s => s.classList.remove('deps-ver-selected'));
          span.classList.add('deps-ver-selected');
          // Update checkbox target version
          const cb = tr.querySelector('.deps-pkg-check');
          if (cb) { cb.dataset.version = ver; cb.checked = true; }
        });
        td.appendChild(span);
      } else {
        td.textContent = '—';
      }
      return td;
    }

    tr.innerHTML = ''; // clear before DOM append
    tr.appendChild(checkCell);

    const tdName = document.createElement('td');
    tdName.textContent = p.name;
    tr.appendChild(tdName);

    const tdCurrent = document.createElement('td');
    tdCurrent.textContent = current;
    tr.appendChild(tdCurrent);

    tr.appendChild(makeVersionCell(p.latestMinor, 'minor'));
    tr.appendChild(makeVersionCell(p.latestMajor, 'major'));

    const tdStatus = document.createElement('td');
    tdStatus.innerHTML = `<span class="${badgeClass}">${statusLabel}</span>`;
    tr.appendChild(tdStatus);

    const tdDate = document.createElement('td');
    tdDate.className = 'deps-date';
    tdDate.textContent = pubDate;
    tr.appendChild(tdDate);

    const tdAge = document.createElement('td');
    tdAge.innerHTML = ageHtml;
    tr.appendChild(tdAge);

    // 9th col: Provenance (npm) | CDN provider (cdn) | hidden (pubspec)
    const tdProv = document.createElement('td');
    if (showProvenance) {
      tdProv.innerHTML = provHtml;
    } else if (showCdn) {
      tdProv.innerHTML = `<span class="badge badge-cdn">${escHtml(p.cdn || '')}</span>`;
      if (p.pinMajor) {
        tdProv.innerHTML += ` <span class="badge badge-pin" title="メジャーバージョン固定（自動マイナー更新）">pin</span>`;
      }
    } else {
      tdProv.className = 'hidden';
    }
    tr.appendChild(tdProv);

    // 10th col: 種別 (npm/pubspec) | ファイル (cdn)
    const tdDev = document.createElement('td');
    if (showCdn) {
      tdDev.className = 'deps-cdn-file';
      tdDev.title = p.url || '';
      tdDev.textContent = p.file || '';
    } else {
      tdDev.innerHTML = p.dev ? '<span class="badge badge-dev">dev</span>' : '';
    }
    tr.appendChild(tdDev);

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
  } else {
    files.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name;
      li.classList.toggle('active', name === currentEnvFile);
      li.onclick = () => loadEnvFile(name);
      envFileList.appendChild(li);
    });
  }

  // S3: 比較セレクト更新
  [envDiffA, envDiffB].forEach(sel => {
    const prev = sel.value;
    sel.innerHTML = '<option value="">— ファイル選択 —</option>';
    files.forEach(f => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = f;
      sel.appendChild(opt);
    });
    if (prev && files.includes(prev)) sel.value = prev;
  });
  if (files.length >= 1 && !envDiffA.value) envDiffA.value = files[0];
  if (files.length >= 2 && !envDiffB.value) envDiffB.value = files[1];
  envDiffSection.classList.toggle('hidden', files.length < 2);
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
// S3: 環境変数 diff
// =====================================================================

const envDiffSection  = document.getElementById('env-diff-section');
const envDiffA        = document.getElementById('env-diff-a');
const envDiffB        = document.getElementById('env-diff-b');
const envDiffRun      = document.getElementById('env-diff-run');
const envNormalView   = document.getElementById('env-normal-view');
const envDiffView     = document.getElementById('env-diff-view');
const envDiffTitle    = document.getElementById('env-diff-title');
const envDiffClose    = document.getElementById('env-diff-close');
const envDiffThA      = document.getElementById('env-diff-th-a');
const envDiffThB      = document.getElementById('env-diff-th-b');
const envDiffTbody    = document.getElementById('env-diff-tbody');

async function fetchEnvEntries(fileName) {
  const res  = await fetch(`/api/env/file?path=${encodeURIComponent(currentProjectPath)}&file=${encodeURIComponent(fileName)}`);
  const data = await res.json();
  return data.entries || [];
}

envDiffRun.onclick = async () => {
  const fa = envDiffA.value;
  const fb = envDiffB.value;
  if (!fa || !fb)           { alert('比較するファイルを2つ選択してください'); return; }
  if (fa === fb)            { alert('異なるファイルを選択してください'); return; }
  if (!currentProjectPath)  return;

  envDiffRun.disabled = true;
  envDiffRun.textContent = '比較中...';

  try {
    const [entriesA, entriesB] = await Promise.all([fetchEnvEntries(fa), fetchEnvEntries(fb)]);
    renderEnvDiff(fa, fb, entriesA, entriesB);
  } catch (e) {
    alert(`比較エラー: ${e.message}`);
  } finally {
    envDiffRun.disabled = false;
    envDiffRun.textContent = '比較';
  }
};

envDiffClose.onclick = () => {
  envDiffView.classList.add('hidden');
  envNormalView.classList.remove('hidden');
};

function renderEnvDiff(fa, fb, entriesA, entriesB) {
  // Map: key → { a, b, sensitiveA, sensitiveB }
  const mapA = Object.fromEntries(entriesA.map(e => [e.key, e]));
  const mapB = Object.fromEntries(entriesB.map(e => [e.key, e]));
  const allKeys = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])].sort();

  envDiffThA.textContent = fa;
  envDiffThB.textContent = fb;
  envDiffTitle.textContent = `${fa}  vs  ${fb}`;

  let onlyA = 0, onlyB = 0, mismatch = 0;

  envDiffTbody.innerHTML = '';
  allKeys.forEach(key => {
    const a    = mapA[key];
    const b    = mapB[key];
    const tr   = document.createElement('tr');
    let rowCls = '';
    let cellA  = '';
    let cellB  = '';

    if (a && !b) {
      rowCls = 'diff-row-only-a';
      cellA  = `<span class="env-value-plain">${escHtml(a.value)}</span>`;
      cellB  = `<span class="diff-cell-missing">未定義</span>`;
      onlyA++;
    } else if (!a && b) {
      rowCls = 'diff-row-only-b';
      cellA  = `<span class="diff-cell-missing">未定義</span>`;
      cellB  = `<span class="env-value-plain">${escHtml(b.value)}</span>`;
      onlyB++;
    } else if (a.value !== b.value) {
      rowCls = 'diff-row-mismatch';
      cellA  = `<span class="diff-cell-diff">${escHtml(a.value)}</span>`;
      cellB  = `<span class="diff-cell-diff">${escHtml(b.value)}</span>`;
      mismatch++;
    } else {
      // 一致: 通常表示
      const sensitive = a.sensitive || b.sensitive;
      const val = sensitive
        ? `<span class="env-value-masked">••••••••</span>`
        : `<span class="env-value-plain">${escHtml(a.value)}</span>`;
      cellA = val;
      cellB = val;
    }

    if (rowCls) tr.className = rowCls;
    tr.innerHTML = `<td class="env-key">${escHtml(key)}</td><td>${cellA}</td><td>${cellB}</td>`;
    envDiffTbody.appendChild(tr);
  });

  // サマリー行
  const summaryParts = [];
  if (onlyA)    summaryParts.push(`<span class="env-diff-badge diff-only-a">${fa} のみ: ${onlyA}</span>`);
  if (onlyB)    summaryParts.push(`<span class="env-diff-badge diff-only-b">${fb} のみ: ${onlyB}</span>`);
  if (mismatch) summaryParts.push(`<span class="env-diff-badge diff-mismatch">値の差異: ${mismatch}</span>`);
  if (summaryParts.length === 0) summaryParts.push('<span style="color:var(--ok);font-size:.8rem">差異なし ✓</span>');

  envDiffTitle.innerHTML = `${escHtml(fa)}  vs  ${escHtml(fb)}  &nbsp; ${summaryParts.join(' ')}`;

  envNormalView.classList.add('hidden');
  envDiffView.classList.remove('hidden');
}

// =====================================================================
// Git ステータス（フェーズ7）
// =====================================================================

const gitBranch       = document.getElementById('git-branch');
const gitSummary      = document.getElementById('git-summary');
const gitStashList    = document.getElementById('git-stash-list');
const gitChangesList  = document.getElementById('git-changes-list');
const gitChangesCount = document.getElementById('git-changes-count');
const gitLogList      = document.getElementById('git-log-list');
const gitCommitDetail = document.getElementById('git-commit-detail');
const gitLogPager     = document.getElementById('git-log-pager');
const gitLogPrev      = document.getElementById('git-log-prev');
const gitLogNext      = document.getElementById('git-log-next');
const gitLogPageInfo  = document.getElementById('git-log-page-info');
const gitLogCount     = document.getElementById('git-log-count');
const gitRefreshBtn   = document.getElementById('git-refresh-btn');
const gitStageAllBtn  = document.getElementById('git-stage-all-btn');
const gitUnstageAllBtn= document.getElementById('git-unstage-all-btn');
const gitCommitMsg    = document.getElementById('git-commit-msg');
const gitCommitBtn    = document.getElementById('git-commit-btn');
const gitCommitResult = document.getElementById('git-commit-result');
const gitPullBtn      = document.getElementById('git-pull-btn');
const gitPushBtn      = document.getElementById('git-push-btn');
const gitRemoteResult = document.getElementById('git-remote-result');

const GIT_LOG_LIMIT = 20;
let gitLogOffset    = 0;
let gitLogTotal     = 0;
let gitActiveHash   = null; // 展開中のコミット hash

gitRefreshBtn.onclick = () => { gitLogOffset = 0; loadGitStatus(); };
gitLogPrev.onclick    = () => { gitLogOffset = Math.max(0, gitLogOffset - GIT_LOG_LIMIT); loadGitStatus(true); };
gitLogNext.onclick    = () => { gitLogOffset = gitLogOffset + GIT_LOG_LIMIT; loadGitStatus(true); };

// ---- ステージ / アンステージ（全体）----
gitStageAllBtn.onclick = async () => {
  if (!currentProjectPath) return;
  gitStageAllBtn.disabled = true;
  const r = await gitOp('/api/git/stage', { path: currentProjectPath });
  gitStageAllBtn.disabled = false;
  showGitResult(gitCommitResult, r.ok, r.ok ? '全 add 完了' : (r.error || '全 add 失敗'));
  loadGitStatus();
};
gitUnstageAllBtn.onclick = async () => {
  if (!currentProjectPath) return;
  gitUnstageAllBtn.disabled = true;
  const r = await gitOp('/api/git/unstage', { path: currentProjectPath });
  gitUnstageAllBtn.disabled = false;
  showGitResult(gitCommitResult, r.ok, r.ok ? '全 unstage 完了' : (r.error || '全 unstage 失敗'));
  loadGitStatus();
};

// ---- コミット ----
gitCommitBtn.onclick = async () => {
  if (!currentProjectPath) return;
  const msg = gitCommitMsg.value.trim();
  if (!msg) { showGitResult(gitCommitResult, false, 'メッセージを入力してください'); return; }
  gitCommitBtn.disabled = true;
  const r = await gitOp('/api/git/do-commit', { path: currentProjectPath, message: msg });
  gitCommitBtn.disabled = false;
  if (r.ok) { gitCommitMsg.value = ''; showGitResult(gitCommitResult, true, 'コミット完了'); loadGitStatus(); }
  else       { showGitResult(gitCommitResult, false, 'コミット失敗'); }
};

// ---- プル / プッシュ ----
gitPullBtn.onclick = async () => {
  if (!currentProjectPath) return;
  gitPullBtn.disabled = true;
  const r = await gitOp('/api/git/pull', { path: currentProjectPath });
  gitPullBtn.disabled = false;
  showGitResult(gitRemoteResult, r.ok, r.ok ? 'pull 完了' : (r.error || 'pull 失敗'));
  if (r.ok) loadGitStatus();
};
gitPushBtn.onclick = async () => {
  if (!currentProjectPath) return;
  gitPushBtn.disabled = true;
  const r = await gitOp('/api/git/push', { path: currentProjectPath });
  gitPushBtn.disabled = false;
  showGitResult(gitRemoteResult, r.ok, r.ok ? 'push 完了' : (r.error || 'push 失敗'));
  if (r.ok && typeof loadRemoteTab === 'function') loadRemoteTab();
};

async function gitOp(url, body) {
  try {
    const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    return data.ok ? { ok: true } : { ok: false, error: data.error || 'エラー' };
  } catch (e) { return { ok: false, error: e.message }; }
}

function showGitResult(el, ok, msg) {
  el.textContent = msg;
  el.className   = 'git-op-result ' + (ok ? 'git-op-ok' : 'git-op-err');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.textContent = ''; el.className = 'git-op-result'; }, 4000);
}

const gitDiffPanel    = document.getElementById('git-diff-panel');
const gitDiffFilename = document.getElementById('git-diff-filename');
const gitDiffBody     = document.getElementById('git-diff-body');
const gitDiffClose    = document.getElementById('git-diff-close');
let   gitActiveDiffFile = null;

gitDiffClose.onclick = () => {
  gitDiffPanel.classList.add('hidden');
  gitDiffBody.innerHTML = '';
  gitActiveDiffFile = null;
  gitChangesList.querySelectorAll('.git-change-item').forEach(el => el.classList.remove('git-log-active'));
};

async function showDiff(file, staged) {
  // 同じファイル再クリックで閉じる
  if (gitActiveDiffFile === file) { gitDiffClose.onclick(); return; }
  gitActiveDiffFile = file;

  gitChangesList.querySelectorAll('.git-change-item').forEach(el =>
    el.classList.toggle('git-log-active', el.dataset.file === file)
  );

  gitDiffPanel.classList.remove('hidden');
  gitDiffFilename.textContent = file;
  gitDiffBody.innerHTML = '<span class="log-muted">diff 取得中...</span>';

  const res  = await fetch(
    `/api/git/diff?path=${encodeURIComponent(currentProjectPath)}&file=${encodeURIComponent(file)}&staged=${staged ? 1 : 0}`
  );
  const data = await res.json();
  if (data.error) { gitDiffBody.textContent = data.error; return; }
  if (!data.diff)  { gitDiffBody.innerHTML = '<span class="log-muted">差分なし（untracked または バイナリ）</span>'; return; }

  gitDiffBody.innerHTML = '';
  data.diff.split('\n').forEach(line => {
    const span = document.createElement('span');
    span.textContent = line + '\n';
    if      (line.startsWith('+') && !line.startsWith('+++')) span.className = 'diff-add';
    else if (line.startsWith('-') && !line.startsWith('---')) span.className = 'diff-del';
    else if (line.startsWith('@@'))                           span.className = 'diff-hunk';
    else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++'))
                                                              span.className = 'diff-meta';
    gitDiffBody.appendChild(span);
  });
}

async function loadGitStatus(logOnly = false) {
  if (!currentProjectPath) return;

  if (!logOnly) {
    gitBranch.textContent    = '読み込み中...';
    gitSummary.innerHTML     = '';
    gitChangesList.innerHTML = '';
  }
  gitLogList.innerHTML = '';
  gitCommitDetail.classList.add('hidden');
  gitCommitDetail.innerHTML = '';
  gitActiveHash = null;

  const res  = await fetch(
    `/api/git/status?path=${encodeURIComponent(currentProjectPath)}&logOffset=${gitLogOffset}&logLimit=${GIT_LOG_LIMIT}`
  );
  const data = await res.json();

  if (!data.isGit) {
    gitBranch.textContent = '（git リポジトリではありません）';
    gitBranch.style.color = 'var(--muted)';
    return;
  }
  gitBranch.style.color = '';

  // ブランチ + ahead/behind
  let branchText = `⎇ ${data.branch}`;
  if (data.ahead !== null && data.behind !== null) {
    branchText += `  ↑${data.ahead} ↓${data.behind}`;
  }
  gitBranch.textContent = branchText;

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
  gitDiffPanel.classList.add('hidden');
  gitActiveDiffFile = null;
  if (data.changes.length === 0) {
    gitChangesList.innerHTML = '<li class="git-empty">変更なし（クリーン）</li>';
  } else {
    data.changes.forEach(c => {
      const cssCls = { modified:'gs-modified', added:'gs-added', deleted:'gs-deleted',
                       renamed:'gs-renamed', untracked:'gs-untracked' }[c.status] || 'gs-other';
      const label  = { modified:'M', added:'A', deleted:'D', renamed:'R', untracked:'?' }[c.status] || '?';
      const li     = document.createElement('li');
      li.className = 'git-change-item';
      li.dataset.file = c.file;
      li.title = 'クリックで diff を表示';
      li.innerHTML = `
        <span class="git-status-badge ${cssCls}">${label}</span>
        <span class="git-change-file">${escHtml(c.file)}</span>
        <span class="git-file-actions">
          ${c.staged   ? `<button class="git-file-btn git-unstage-btn" title="アンステージ">−</button>` : ''}
          ${c.unstaged ? `<button class="git-file-btn git-stage-btn"   title="ステージ">＋</button>`   : ''}
        </span>`;
      li.addEventListener('click', e => {
        if (e.target.closest('.git-file-actions')) return;
        showDiff(c.file, c.staged);
      });
      li.querySelector('.git-unstage-btn')?.addEventListener('click', async e => {
        e.stopPropagation();
        const r = await gitOp('/api/git/unstage', { path: currentProjectPath, file: c.file });
        showGitResult(gitCommitResult, r.ok, r.ok ? `${c.file}: unstage 完了` : (r.error || `${c.file}: unstage 失敗`));
        await loadGitStatus();
      });
      li.querySelector('.git-stage-btn')?.addEventListener('click', async e => {
        e.stopPropagation();
        const r = await gitOp('/api/git/stage', { path: currentProjectPath, file: c.file });
        showGitResult(gitCommitResult, r.ok, r.ok ? `${c.file}: stage 完了` : (r.error || `${c.file}: stage 失敗`));
        await loadGitStatus();
      });
      gitChangesList.appendChild(li);
    });
  }

  // コミット履歴
  gitLogTotal = data.totalCommits || 0;
  const totalPages = Math.ceil(gitLogTotal / GIT_LOG_LIMIT) || 1;
  const curPage    = Math.floor(gitLogOffset / GIT_LOG_LIMIT) + 1;

  gitLogCount.textContent = gitLogTotal ? `${gitLogTotal}件` : '';
  gitLogPageInfo.textContent = `${curPage} / ${totalPages} ページ`;

  // ページネーション表示制御
  const showPager = gitLogTotal > GIT_LOG_LIMIT;
  gitLogPager.classList.toggle('hidden', !showPager);
  gitLogPrev.disabled = gitLogOffset === 0;
  gitLogNext.disabled = gitLogOffset + GIT_LOG_LIMIT >= gitLogTotal;

  if (data.commits.length === 0) {
    gitLogList.innerHTML = '<li class="git-empty">コミットなし</li>';
  } else {
    data.commits.forEach(c => {
      const li = document.createElement('li');
      li.className = 'git-log-item';
      li.dataset.hash = c.hash;
      li.innerHTML = `
        <span class="git-hash">${escHtml(c.short)}</span>
        <span class="git-subject" title="${escHtml(c.subject)}">${escHtml(c.subject)}</span>
        <span class="git-meta">${escHtml(c.author)} · ${escHtml(c.relDate)}</span>
        <span class="git-expand-icon">▶</span>`;
      li.addEventListener('click', () => toggleCommitDetail(c.hash, li));
      gitLogList.appendChild(li);
    });
  }
}

async function toggleCommitDetail(hash, li) {
  // 同じコミットを再クリック → 閉じる
  if (gitActiveHash === hash) {
    gitCommitDetail.classList.add('hidden');
    gitCommitDetail.innerHTML = '';
    li.classList.remove('git-log-active');
    li.querySelector('.git-expand-icon').textContent = '▶';
    gitActiveHash = null;
    return;
  }

  // 前の選択を解除
  gitLogList.querySelectorAll('.git-log-item').forEach(el => {
    el.classList.remove('git-log-active');
    el.querySelector('.git-expand-icon').textContent = '▶';
  });
  li.classList.add('git-log-active');
  li.querySelector('.git-expand-icon').textContent = '▼';
  gitActiveHash = hash;

  gitCommitDetail.classList.remove('hidden');
  gitCommitDetail.innerHTML = '<span class="log-muted">詳細取得中...</span>';

  const res  = await fetch(`/api/git/commit?path=${encodeURIComponent(currentProjectPath)}&hash=${encodeURIComponent(hash)}`);
  const d    = await res.json();
  if (d.error) { gitCommitDetail.innerHTML = `<span class="log-stderr">${escHtml(d.error)}</span>`; return; }

  const filesHtml = d.fileStats.length
    ? d.fileStats.map(f => `<li class="git-detail-file">${escHtml(f)}</li>`).join('')
    : '';

  gitCommitDetail.innerHTML = `
    <div class="git-detail-header">
      <code class="git-detail-hash">${escHtml(d.fullHash)}</code>
      <span class="git-detail-meta">${escHtml(d.author)} &lt;${escHtml(d.email)}&gt; · ${escHtml(d.date)}</span>
    </div>
    ${d.body ? `<pre class="git-detail-body">${escHtml(d.body)}</pre>` : ''}
    ${d.statSummary ? `<div class="git-detail-stat">${escHtml(d.statSummary)}</div>` : ''}
    ${filesHtml ? `<ul class="git-detail-files">${filesHtml}</ul>` : ''}`;
}

// プロセス一覧を定期更新（自動更新チェック時のみ）
setInterval(() => {
  if (!dashboard.classList.contains('hidden') && autoreload.checked) {
    refreshProcessList(null);
  }
}, 10000);

// =====================================================================
// R7: Flutter analyze ビューア
// =====================================================================

const analyzeRunBtn    = document.getElementById('analyze-run-btn');
const analyzePanel     = document.getElementById('analyze-panel');
const analyzeStatus    = document.getElementById('analyze-status');
const analyzeTbody     = document.getElementById('analyze-tbody');
const analyzeTableWrap = document.getElementById('analyze-table-wrap');
const analyzeHasFix    = document.getElementById('analyze-has-fix');

let analyzeResults = [];
let analyzeActiveSev = new Set(['ERROR', 'WARNING', 'INFO']);

analyzeRunBtn.onclick = async () => {
  if (!currentProjectPath) { alert('プロジェクトを選択してください'); return; }
  analyzeRunBtn.disabled = true;
  analyzeRunBtn.textContent = '実行中...';
  analyzePanel.classList.remove('hidden');
  analyzeStatus.textContent = '⏳ 解析中...';
  analyzeTableWrap.classList.add('hidden');

  const res  = await fetch(`/api/analyze?path=${encodeURIComponent(currentProjectPath)}`);
  const data = await res.json();

  analyzeRunBtn.disabled = false;
  analyzeRunBtn.textContent = '実行 ▶';

  if (data.error) { analyzeStatus.textContent = `⚠ ${data.error}`; return; }

  analyzeResults = data.issues || [];
  const errCnt  = analyzeResults.filter(i => i.severity === 'ERROR').length;
  const warnCnt = analyzeResults.filter(i => i.severity === 'WARNING').length;
  const infoCnt = analyzeResults.filter(i => i.severity === 'INFO').length;
  analyzeStatus.textContent =
    `${data.fileCount} ファイル解析 — ERROR: ${errCnt}  WARNING: ${warnCnt}  INFO: ${infoCnt}`;

  renderAnalyzeTable();
};

document.querySelectorAll('.analyze-sev-btn').forEach(btn => {
  btn.onclick = () => {
    btn.classList.toggle('active');
    const sev = btn.dataset.sev;
    if (btn.classList.contains('active')) analyzeActiveSev.add(sev);
    else analyzeActiveSev.delete(sev);
    renderAnalyzeTable();
  };
});
analyzeHasFix.addEventListener('change', renderAnalyzeTable);

function renderAnalyzeTable() {
  const hasFix = analyzeHasFix.checked;
  const rows = analyzeResults.filter(i =>
    analyzeActiveSev.has(i.severity) && (!hasFix || i.hasFix)
  );

  analyzeTbody.innerHTML = '';
  if (rows.length === 0) {
    analyzeTbody.innerHTML = `<tr><td colspan="5" class="deps-empty">該当なし</td></tr>`;
    analyzeTableWrap.classList.remove('hidden');
    return;
  }

  const SEV_CLS = { ERROR: 'analyze-error', WARNING: 'analyze-warn', INFO: 'analyze-info' };

  rows.forEach(issue => {
    const tr = document.createElement('tr');
    const cls = SEV_CLS[issue.severity] || '';

    // ファイルパスを短縮: プロジェクトルートからの相対パス
    let relFile = issue.file;
    if (currentProjectPath && relFile.startsWith(currentProjectPath)) {
      relFile = relFile.slice(currentProjectPath.length).replace(/^[\\/]/, '');
    }

    // vscode:// リンク
    const vsUrl = `vscode://file/${issue.file.replace(/\\/g, '/')}:${issue.line}:${issue.column}`;

    tr.innerHTML = `
      <td><span class="analyze-sev-badge ${cls}">${escHtml(issue.severity)}</span></td>
      <td class="analyze-msg">${escHtml(issue.message)}</td>
      <td class="analyze-file"><a href="${escHtml(vsUrl)}" class="analyze-file-link" title="${escHtml(issue.file)}">${escHtml(relFile)}</a></td>
      <td class="analyze-line">${issue.line}</td>
      <td class="analyze-fix">${issue.hasFix ? '<span class="audit-fix">✓</span>' : ''}</td>`;
    analyzeTbody.appendChild(tr);
  });

  analyzeTableWrap.classList.remove('hidden');
}

// =====================================================================
// S1: pubspec OSV セキュリティ診断
// =====================================================================

const osvRunBtn    = document.getElementById('osv-run-btn');
const osvStatus    = document.getElementById('osv-status');
const osvResult    = document.getElementById('osv-result');
const osvSummary   = document.getElementById('osv-summary');
const osvTbody     = document.getElementById('osv-tbody');

async function loadOsv(force = false) {
  if (!currentProjectPath) return;
  osvRunBtn.disabled = true;
  osvRunBtn.textContent = force ? '照会中...' : '確認中...';
  if (force) {
    osvStatus.textContent = '⏳ OSV.dev に問い合わせ中...';
    osvResult.classList.add('hidden');
  }

  try {
    const forceParam = force ? '&force=1' : '';
    const res  = await fetch(`/api/osv/check?path=${encodeURIComponent(currentProjectPath)}${forceParam}`);
    const data = await res.json();

    if (data.error) {
      osvStatus.textContent = `⚠ ${data.error}`;
    } else {
      const age = data.cached ? ` — キャッシュ: ${agoLabel(data.cachedAt)}` : '';
      osvStatus.textContent = age;
      renderOsvResult(data);
    }
  } catch (e) {
    osvStatus.textContent = `⚠ エラー: ${e.message}`;
  } finally {
    osvRunBtn.disabled = false;
    osvRunBtn.textContent = 'チェック ▶';
  }
}

osvRunBtn.onclick = () => loadOsv(true);

function renderOsvResult(data) {
  const { checkedCount = 0, totalVulns = 0, results = [], sourceFile = '' } = data;
  const src = sourceFile ? `（${sourceFile}）` : '';

  if (totalVulns === 0) {
    osvSummary.innerHTML =
      `<span class="osv-summary-ok">問題なし ✓</span>` +
      `<span class="osv-summary-meta">${checkedCount} パッケージを確認${src}</span>`;
    osvTbody.innerHTML = '';
    osvResult.classList.remove('hidden');
    return;
  }

  osvSummary.innerHTML =
    `<span class="osv-summary-warn">${totalVulns} 件の脆弱性</span>` +
    `<span class="osv-summary-meta">${checkedCount} パッケージ中${src}</span>`;

  const SEV_CLS = { CRITICAL: 'analyze-error', HIGH: 'analyze-warn', MEDIUM: 'analyze-info', LOW: 'analyze-info', UNKNOWN: '' };
  osvTbody.innerHTML = '';

  for (const v of results) {
    const tr  = document.createElement('tr');
    const cls = SEV_CLS[v.severity] || '';
    const cve = v.aliases.length ? `<br><span class="osv-alias">${escHtml(v.aliases[0])}</span>` : '';
    tr.innerHTML = `
      <td><span class="analyze-sev-badge ${cls}">${escHtml(v.severity)}</span></td>
      <td class="osv-pkg">${escHtml(v.package)}</td>
      <td class="osv-ver">${escHtml(v.version)}</td>
      <td class="osv-id"><a href="${escHtml(v.url)}" target="_blank" rel="noopener" class="analyze-file-link">${escHtml(v.id)}</a>${cve}</td>
      <td class="osv-summary-cell">${escHtml(v.summary)}</td>`;
    osvTbody.appendChild(tr);
  }

  osvResult.classList.remove('hidden');
}

// =====================================================================
// S2: 依存ツリービューア
// =====================================================================

const treeFetchBtn      = document.getElementById('tree-fetch-btn');
const treePkgdirSelect  = document.getElementById('tree-pkgdir-select');
const treeSearch        = document.getElementById('tree-search');
const treeExpandAll     = document.getElementById('tree-expand-all');
const treeCollapseAll   = document.getElementById('tree-collapse-all');
const treeStatus        = document.getElementById('tree-status');
const treeBody          = document.getElementById('tree-body');
const treeRoot          = document.getElementById('tree-root');
const treeReversePanel  = document.getElementById('tree-reverse-panel');
const treeReverseTitle  = document.getElementById('tree-reverse-title');
const treeReverseList   = document.getElementById('tree-reverse-list');
const treeReverseClose  = document.getElementById('tree-reverse-close');

let treeType       = 'flutter';
let treeData       = null;   // { root, nodes }
let treeKindFilter = null;   // null | 'direct' | 'dev' | 'transitive' | 'conflict'

// 経過時間を「X分前」「X時間前」で返す
function agoLabel(cachedAt) {
  const mins = Math.round((Date.now() - cachedAt) / 60000);
  if (mins < 1)   return 'たった今';
  if (mins < 60)  return `${mins}分前`;
  const hrs = Math.round(mins / 60);
  if (hrs  < 24)  return `${hrs}時間前`;
  return `${Math.round(hrs / 24)}日前`;
}

function setTreeStatus(data) {
  const n   = Object.keys(data.nodes).length;
  const age = data.cached ? ` — キャッシュ: ${agoLabel(data.cachedAt)}` : '';
  treeStatus.textContent = `${n} パッケージ${age}`;
}

// キャッシュ確認 or 強制再取得
async function loadTree(force = false) {
  if (!currentProjectPath) return;
  treeFetchBtn.disabled = true;
  treeFetchBtn.textContent = '取得中...';
  if (!force) {
    treeStatus.textContent = '⏳ キャッシュ確認中...';
  } else {
    treeStatus.textContent = '⏳ 依存ツリーを取得中...';
    treeBody.classList.add('hidden');
    treeReversePanel.classList.add('hidden');
    treeRoot.innerHTML = '';
  }

  try {
    const forceParam = force ? '&force=1' : '';
    const treePath = (treeType === 'npm') ? (currentNpmDir || currentProjectPath) : currentProjectPath;
    const res  = await fetch(`/api/deps-tree?path=${encodeURIComponent(treePath)}&type=${treeType}${forceParam}`);
    const data = await res.json();
    if (data.error) {
      treeStatus.textContent = `⚠ ${data.error}`;
      treeBody.classList.add('hidden');
    } else {
      treeData = data;
      renderTree(data, treeSearch.value.trim());
      setTreeStatus(data);
      treeBody.classList.remove('hidden');
    }
  } catch (e) {
    treeStatus.textContent = `⚠ エラー: ${e.message}`;
  } finally {
    treeFetchBtn.disabled = false;
    treeFetchBtn.textContent = '再取得 ↺';
  }
}

document.querySelectorAll('.tree-type-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.tree-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    treeType = btn.dataset.treeType;
    treeData = null;
    treeKindFilter = null;
    document.querySelectorAll('#tree-legend [data-tree-filter]').forEach(e => e.classList.remove('tree-legend-active'));
    treeRoot.innerHTML = '';
    treeBody.classList.add('hidden');
    treeReversePanel.classList.add('hidden');
    treeStatus.textContent = '';
    if (treeType === 'npm' && currentProjectPath) await loadNpmPkgList({ treeSelect: true });
    treePkgdirSelect.classList.toggle('hidden', treeType !== 'npm');
    if (currentProjectPath) loadTree(false);
  });
});

treePkgdirSelect.addEventListener('change', () => {
  currentNpmDir = treePkgdirSelect.value || null;
  // package.json タブのセレクタも同期
  if (npmPkgdirSelect.querySelector(`option[value="${CSS.escape(currentNpmDir || '')}"]`)) {
    npmPkgdirSelect.value = currentNpmDir || '';
  }
  loadTree(true);
});

// 「取得 ▶ / 再取得 ↺」ボタン → 強制再取得
treeFetchBtn.onclick = () => loadTree(true);

// 凡例クリック → kind フィルタ切り替え
document.querySelectorAll('#tree-legend [data-tree-filter]').forEach(el => {
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => {
    const f = el.dataset.treeFilter;
    treeKindFilter = (treeKindFilter === f) ? null : f;
    document.querySelectorAll('#tree-legend [data-tree-filter]').forEach(e =>
      e.classList.toggle('tree-legend-active', e.dataset.treeFilter === treeKindFilter)
    );
    if (treeData) renderTree(treeData, treeSearch.value.trim());
  });
});

treeSearch.addEventListener('input', () => {
  if (!treeData) return;
  renderTree(treeData, treeSearch.value.trim());
});

treeExpandAll.onclick    = () => treeRoot.querySelectorAll('details').forEach(d => { d.open = true; });
treeCollapseAll.onclick  = () => treeRoot.querySelectorAll('details').forEach(d => { d.open = false; });
treeReverseClose.onclick = () => treeReversePanel.classList.add('hidden');

// 逆引き: 指定 name を deps に含む全ノードを返す
function findParents(nodes, targetName) {
  return Object.values(nodes).filter(n =>
    n.deps.some(d => d === targetName || d.startsWith(targetName + '@'))
  );
}

// ツリー描画: DFS で <details>/<summary> を生成
function renderTree(data, filter) {
  if (treeKindFilter) { renderTreeFlat(data, filter); return; }
  renderTreeHierarchy(data, filter);
}

function renderTreeFlat(data, filter) {
  const { root, nodes } = data;
  const lf = filter.toLowerCase();

  const versionMap = {};
  Object.values(nodes).forEach(n => {
    if (!versionMap[n.name]) versionMap[n.name] = new Set();
    versionMap[n.name].add(n.version);
  });
  const conflicts = new Set(
    Object.entries(versionMap).filter(([, s]) => s.size > 1).map(([k]) => k)
  );

  function nodeMatches(node) {
    if (treeKindFilter === 'conflict')   return conflicts.has(node.name);
    if (treeKindFilter === 'transitive') return node.kind === 'transitive';
    return node.kind === treeKindFilter;
  }

  // DFS でマッチノードへの全パスを収集
  const results = [];
  function dfs(nodeKey, path, visited) {
    const node = nodes[nodeKey];
    if (!node || visited.has(nodeKey)) return;
    const newPath = [...path, node];
    if (nodeMatches(node) && (!lf || node.name.toLowerCase().includes(lf))) {
      results.push(newPath);
    }
    // direct/dev はルートの直接の子のみ対象（サブツリーは不要）
    if ((treeKindFilter === 'direct' || treeKindFilter === 'dev') && node.kind !== 'root') return;
    const next = new Set(visited); next.add(nodeKey);
    node.deps.forEach(d => dfs(d, newPath, next));
  }
  dfs(root, [], new Set());

  treeRoot.innerHTML = '';
  if (results.length === 0) {
    const p = document.createElement('p');
    p.className = 'tree-flat-empty';
    p.textContent = '一致するパッケージはありません';
    treeRoot.appendChild(p);
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'tree-flat-list';

  results.forEach(pathNodes => {
    const li = document.createElement('li');
    li.className = 'tree-flat-item';
    // ルートノード（kind='root'）はパスから省略
    const display = pathNodes.filter(n => n.kind !== 'root');
    display.forEach((n, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'tree-flat-sep';
        sep.textContent = '›';
        li.appendChild(sep);
      }
      const span = document.createElement('span');
      const isMatch = i === display.length - 1;
      span.className = isMatch ? 'tree-flat-match' : 'tree-flat-ancestor';
      if (conflicts.has(n.name)) span.classList.add('tree-flat-conflict');
      span.textContent = n.name + (n.version ? `@${n.version}` : '');
      span.title = '逆引き検索';
      span.addEventListener('click', () => showReversePanel(n.name));
      li.appendChild(span);
    });
    ul.appendChild(li);
  });

  treeRoot.appendChild(ul);
}

function renderTreeHierarchy(data, filter) {
  const { root, nodes } = data;
  const lf = filter.toLowerCase();

  // バージョン衝突検出: 同 name で複数 version
  const versionMap = {};
  Object.values(nodes).forEach(n => {
    if (!versionMap[n.name]) versionMap[n.name] = new Set();
    versionMap[n.name].add(n.version);
  });
  const conflicts = new Set(
    Object.entries(versionMap).filter(([, s]) => s.size > 1).map(([k]) => k)
  );

  // DFS (visited で無限ループ防止)
  // insideMatch: 祖先が kind フィルタにマッチ済み（サブツリーを丸ごと表示）
  function buildNode(nodeKey, visited = new Set(), insideMatch = false) {
    const node = nodes[nodeKey];
    if (!node) return null;

    const hasChildren = node.deps.length > 0;
    const isConflict  = conflicts.has(node.name);
    const matchSearch = lf && node.name.toLowerCase().includes(lf);

    // kind フィルタ: このノード自身が一致するか
    const nodeMatchesKind = treeKindFilter
      ? (treeKindFilter === 'conflict'    ? isConflict
       : treeKindFilter === 'transitive'  ? node.kind === 'transitive'
       : node.kind === treeKindFilter)
      : false;

    // direct / dev フィルタ: root 以外で一致しない & 祖先もマッチしていない → DOM から除外
    const isTopFilter = treeKindFilter === 'direct' || treeKindFilter === 'dev';
    if (isTopFilter && !insideMatch && node.kind !== 'root' && !nodeMatchesKind) {
      return null;
    }

    // このノードがマッチした場合、子孫はすべて表示（top フィルタのみ）
    const nowInsideMatch = insideMatch || (isTopFilter && nodeMatchesKind);

    const details = document.createElement('details');
    if (!hasChildren) details.classList.add('tree-leaf');
    if (isConflict)   details.classList.add('tree-conflict');
    if (matchSearch)  { details.classList.add('tree-match'); details.open = true; }
    if (nodeMatchesKind) details.classList.add('tree-kind-match');

    if (!lf && !treeKindFilter && node.kind === 'direct') details.open = true;
    if (nodeMatchesKind || nowInsideMatch) details.open = true;

    const summary = document.createElement('summary');

    // kind バッジ
    const kindLabel = { root: '[root]', direct: '[direct]', dev: '[dev]', transitive: '' };
    const kindCls   = { root: 'tree-kind-root', direct: 'tree-kind-direct', dev: 'tree-kind-dev', transitive: 'tree-kind-transitive' };

    // クリックで逆引き
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tree-node-name';
    nameSpan.textContent = node.name;
    nameSpan.title = '逆引き検索';
    nameSpan.addEventListener('click', e => {
      e.stopPropagation();
      showReversePanel(node.name);
    });

    const verSpan = document.createElement('span');
    verSpan.className = 'tree-node-ver';
    verSpan.textContent = node.version ? `@${node.version}` : '';

    if (kindLabel[node.kind]) {
      const kindSpan = document.createElement('span');
      kindSpan.className = kindCls[node.kind] || 'tree-kind-transitive';
      kindSpan.textContent = kindLabel[node.kind];
      summary.appendChild(kindSpan);
    }
    summary.appendChild(nameSpan);
    summary.appendChild(verSpan);
    details.appendChild(summary);

    if (hasChildren && !visited.has(nodeKey)) {
      const next = new Set(visited);
      next.add(nodeKey);
      node.deps.forEach(depKey => {
        const child = buildNode(depKey, next, nowInsideMatch);
        if (child) details.appendChild(child);
      });
    } else if (visited.has(nodeKey) && hasChildren) {
      const circle = document.createElement('span');
      circle.style.cssText = 'font-size:.7rem;color:var(--muted);padding-left:1rem;';
      circle.textContent = '（循環参照）';
      details.appendChild(circle);
    }

    // テキストフィルタ: 自分も子孫もマッチしない場合は hidden
    if (lf && !matchSearch && !details.querySelector('.tree-match')) {
      details.classList.add('hidden');
    }

    // conflict / transitive フィルタ: 自分も子孫もマッチしない場合は hidden
    if ((treeKindFilter === 'conflict' || treeKindFilter === 'transitive')
        && !nodeMatchesKind && !details.querySelector('.tree-kind-match')) {
      details.classList.add('hidden');
    }

    return details;
  }

  treeRoot.innerHTML = '';
  const rootEl = buildNode(root);
  if (rootEl) { rootEl.open = true; treeRoot.appendChild(rootEl); }
}

function showReversePanel(name) {
  if (!treeData) return;
  const parents = findParents(treeData.nodes, name);
  treeReverseTitle.textContent = `"${name}" を参照しているパッケージ`;
  treeReverseList.innerHTML = '';
  if (parents.length === 0) {
    const li = document.createElement('li');
    li.textContent = '（なし — ルートまたは直接依存）';
    treeReverseList.appendChild(li);
  } else {
    parents.forEach(p => {
      const li = document.createElement('li');
      li.textContent = `${p.name}@${p.version}`;
      treeReverseList.appendChild(li);
    });
  }
  treeReversePanel.classList.remove('hidden');
}

// =====================================================================
// R4: Firebase 環境切り替えパネル
// =====================================================================

const fbEnvHeader     = document.getElementById('fb-env-header');
const fbHeaderAlias   = document.getElementById('fb-header-alias');
const fbHeaderEnvname = document.getElementById('fb-header-envname');
const fbHeaderFirebase = document.getElementById('fb-header-firebase');
const fbHeaderEnv     = document.getElementById('fb-header-env');
const fbEnvPanel      = document.getElementById('fb-env-panel');

// ヘッダーのピルをクリックしたら環境変数タブを開く
function openEnvTab() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  const btn = document.querySelector('.tab[data-tab="env"]');
  if (btn) btn.classList.add('active');
  const content = document.getElementById('tab-env');
  if (content) content.classList.remove('hidden');
}
fbHeaderFirebase.onclick = openEnvTab;
fbHeaderEnv.onclick      = openEnvTab;

async function loadFirebaseEnvStatus(projectPath) {
  fbEnvPanel.innerHTML = '<div class="fb-env-loading">読み込み中...</div>';
  fbEnvHeader.classList.add('hidden');

  const res  = await fetch(`/api/firebaseenv/status?path=${encodeURIComponent(projectPath)}`);
  const data = await res.json();
  if (data.error) {
    fbEnvPanel.innerHTML = `<div class="fb-env-loading">${escHtml(data.error)}</div>`;
    return;
  }

  renderFbEnvPanel(data);
  updateFbEnvHeader(data);
}

function updateFbEnvHeader(data) {
  const hasFirebase = data.currentAlias !== null;
  const hasEnv      = data.activeEnv !== null || data.envVariants.length > 0;

  if (!hasFirebase && !hasEnv) {
    fbEnvHeader.classList.add('hidden');
    return;
  }

  fbHeaderAlias.textContent   = data.currentAlias || '未設定';
  fbHeaderEnvname.textContent = data.activeEnv
    ? data.activeEnv.replace(/^\.env\./, '')
    : '未設定';

  fbEnvHeader.classList.remove('hidden');
}

function renderFbEnvPanel(data) {
  const { aliases, currentAlias, currentProjectId, envVariants, activeEnv } = data;
  const aliasKeys = Object.keys(aliases);

  let html = '';

  // ---- Firebase プロジェクト切り替え ----
  if (aliasKeys.length > 0) {
    html += `<div class="fb-env-group">
      <div class="fb-env-group-label">firebase use</div>
      <div class="fb-env-btns">`;
    aliasKeys.forEach(alias => {
      const active = alias === currentAlias;
      html += `<button class="fb-use-btn${active ? ' active' : ''}" data-alias="${escHtml(alias)}">${escHtml(alias)}</button>`;
    });
    html += `</div>`;
    if (currentProjectId) {
      html += `<div class="fb-env-project-id">${escHtml(currentProjectId)}</div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="fb-env-group">
      <div class="fb-env-group-label">firebase use</div>
      <div class="fb-env-none">.firebaserc 未検出</div>
    </div>`;
  }

  // ---- .env ファイル切り替え ----
  if (envVariants.length > 0) {
    html += `<div class="fb-env-group">
      <div class="fb-env-group-label">.env 切り替え</div>
      <div class="fb-env-btns">`;
    envVariants.forEach(name => {
      const active  = name === activeEnv;
      const label   = name.replace(/^\.env\./, '');
      html += `<button class="fb-env-btn${active ? ' active' : ''}" data-file="${escHtml(name)}">${escHtml(label)}</button>`;
    });
    html += `</div>`;
    if (activeEnv) {
      html += `<div class="fb-env-project-id">現在: ${escHtml(activeEnv)}</div>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="fb-env-group">
      <div class="fb-env-group-label">.env 切り替え</div>
      <div class="fb-env-none">.env.* ファイルなし</div>
    </div>`;
  }

  fbEnvPanel.innerHTML = html;

  // firebase use ボタン
  fbEnvPanel.querySelectorAll('.fb-use-btn').forEach(btn => {
    btn.onclick = async () => {
      const alias = btn.dataset.alias;
      const isProd = /prod/i.test(alias);
      if (isProd && !confirm(`本番環境 "${alias}" に切り替えます。よろしいですか？`)) return;

      btn.disabled = true;
      const res  = await fetch('/api/firebaseenv/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentProjectPath, alias }),
      });
      const data = await res.json();
      btn.disabled = false;
      if (data.error) { alert(`エラー: ${data.error}`); return; }
      loadFirebaseEnvStatus(currentProjectPath);
    };
  });

  // .env 切り替えボタン
  fbEnvPanel.querySelectorAll('.fb-env-btn').forEach(btn => {
    btn.onclick = async () => {
      const file   = btn.dataset.file;
      const isProd = /prod/i.test(file);
      if (isProd && !confirm(`本番環境ファイル "${file}" を .env にコピーします。よろしいですか？`)) return;

      btn.disabled = true;
      const res  = await fetch('/api/firebaseenv/env-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentProjectPath, file }),
      });
      const data = await res.json();
      btn.disabled = false;
      if (data.error) { alert(`エラー: ${data.error}`); return; }
      // リロードして状態を反映
      loadFirebaseEnvStatus(currentProjectPath);
      loadEnvList(currentProjectPath);
    };
  });
}

// =====================================================================
// S4: 全プロセス統合ログビュー
// =====================================================================

const combinedViewBtn     = document.getElementById('combined-view-btn');
const combinedPanel       = document.getElementById('combined-panel');
const combinedOutput      = document.getElementById('combined-output');
const combinedFilter      = document.getElementById('combined-filter');
const combinedProcFilter  = document.getElementById('combined-proc-filter');
const combinedRefresh     = document.getElementById('combined-refresh');
const combinedCount       = document.getElementById('combined-count');
const combinedAutoscroll  = document.getElementById('combined-autoscroll');

let combinedActive    = false;
let combinedPollTimer = null;
let combinedActiveLevels = new Set(); // 空 = フィルタなし

// プロセスラベルごとに色を割り当て（HSL で均等分散）
const procColorCache = {};
let   procColorIndex = 0;
const PROC_COLORS = [
  '#4a9eff', '#4fc77a', '#f0a830', '#e05c5c',
  '#a67de8', '#40c8d0', '#f07850', '#c0c040',
];
function procColor(id) {
  if (!procColorCache[id]) {
    procColorCache[id] = PROC_COLORS[procColorIndex % PROC_COLORS.length];
    procColorIndex++;
  }
  return procColorCache[id];
}

function fmtTs(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

// ログエントリをレベル判定（既存の logLevelOf 相当）
function combinedLevel(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\berror\b|\bfatal\b|\bexception\b/.test(t)) return 'error';
  if (/\bwarn(ing)?\b/.test(t))                    return 'warn';
  if (/\binfo\b/.test(t))                           return 'info';
  return null;
}

function renderCombined() {
  const filterText  = combinedFilter.value.trim();
  const procId      = combinedProcFilter.value;
  let re = null;
  if (filterText) { try { re = new RegExp(filterText, 'i'); } catch { re = null; } }

  let visible = 0;
  const lines = combinedOutput.querySelectorAll('.combined-line');
  lines.forEach(el => {
    const level   = el.dataset.level;
    const eid     = el.dataset.pid;
    const text    = el.dataset.text || '';

    let show = true;
    if (combinedActiveLevels.size && level && !combinedActiveLevels.has(level)) show = false;
    if (procId && eid !== procId) show = false;
    if (re && !re.test(text)) show = false;

    el.classList.toggle('combined-hidden', !show);
    if (show) visible++;
  });

  combinedCount.textContent = `${visible} / ${lines.length} 行`;

  if (combinedAutoscroll.checked) {
    combinedOutput.scrollTop = combinedOutput.scrollHeight;
  }
}

async function fetchCombined() {
  try {
    const res  = await fetch('/api/process/combined-log');
    const data = await res.json();
    buildCombinedOutput(data);
    updateCombinedProcFilter(data);
    renderCombined();
  } catch {}
}

function buildCombinedOutput(entries) {
  // 既存行数と同じなら差分だけ追加（全再描画を避ける）
  const existing = combinedOutput.querySelectorAll('.combined-line').length;
  if (existing === entries.length) return;

  if (existing === 0) combinedOutput.innerHTML = '';

  for (let i = existing; i < entries.length; i++) {
    const e    = entries[i];
    const text = (e.data || '').replace(/\n$/, '');
    if (!text) continue;

    const level = e.type === 'exit' ? 'exit' : combinedLevel(text);
    const color = procColor(e.id);

    const div = document.createElement('div');
    div.className = 'combined-line';
    div.dataset.level = level || '';
    div.dataset.pid   = String(e.id);
    div.dataset.text  = text;

    const ts = document.createElement('span');
    ts.className   = 'combined-ts';
    ts.textContent = fmtTs(e.ts);

    const badge = document.createElement('span');
    badge.className   = 'combined-proc-badge';
    badge.textContent = e.label;
    badge.style.background = color + '28';
    badge.style.color      = color;
    badge.style.borderLeft = `2px solid ${color}`;

    const textSpan = document.createElement('span');
    textSpan.className = 'combined-text' +
      (e.type === 'stderr' ? ' combined-stderr' : '') +
      (e.type === 'exit'   ? ' combined-exit'   : '');
    textSpan.textContent = text;

    div.appendChild(ts);
    div.appendChild(badge);
    div.appendChild(textSpan);
    combinedOutput.appendChild(div);
  }
}

function updateCombinedProcFilter(entries) {
  const cur = combinedProcFilter.value;
  const ids  = new Map();
  entries.forEach(e => { if (!ids.has(e.id)) ids.set(e.id, e.label); });

  combinedProcFilter.innerHTML = '<option value="">全プロセス</option>';
  ids.forEach((label, id) => {
    const opt = document.createElement('option');
    opt.value       = String(id);
    opt.textContent = label;
    combinedProcFilter.appendChild(opt);
  });
  if (cur) combinedProcFilter.value = cur;
}

function startCombinedPoll() {
  fetchCombined();
  combinedPollTimer = setInterval(fetchCombined, 2000);
}
function stopCombinedPoll() {
  clearInterval(combinedPollTimer);
  combinedPollTimer = null;
}

function enterCombinedView() {
  combinedActive = true;
  combinedViewBtn.classList.add('active');
  logOutput.classList.add('hidden');
  stdinBar.classList.add('hidden');
  devtoolsBar.classList.add('hidden');
  combinedPanel.classList.remove('hidden');
  combinedOutput.innerHTML = '';
  startCombinedPoll();
}
function exitCombinedView() {
  combinedActive = false;
  combinedViewBtn.classList.remove('active');
  combinedPanel.classList.add('hidden');
  logOutput.classList.remove('hidden');
  stopCombinedPoll();
}

combinedViewBtn.onclick = () => {
  if (combinedActive) exitCombinedView();
  else                enterCombinedView();
};

combinedRefresh.onclick = () => {
  combinedOutput.innerHTML = '';
  fetchCombined();
};

combinedFilter.addEventListener('input', renderCombined);
combinedProcFilter.addEventListener('change', renderCombined);

document.querySelectorAll('.combined-level-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const lv = btn.dataset.level;
    if (combinedActiveLevels.has(lv)) {
      combinedActiveLevels.delete(lv);
      btn.classList.remove('active');
    } else {
      combinedActiveLevels.add(lv);
      btn.classList.add('active');
    }
    renderCombined();
  });
});

// =====================================================================
// S5: ポートモニター
// =====================================================================

const portAddInput    = document.getElementById('port-add-input');
const portAddBtn      = document.getElementById('port-add-btn');
const portRefreshBtn  = document.getElementById('port-refresh-btn');
const portAutoRefresh = document.getElementById('port-auto-refresh');
const portLastUpdated = document.getElementById('port-last-updated');
const portTbody       = document.getElementById('port-tbody');

let portPollTimer  = null;
let portWatched    = [];   // 現在の監視ポート一覧

// ポートタブが開いたときに起動、閉じたときに停止
document.querySelector('.tab[data-tab="ports"]').addEventListener('click', startPortMonitor);
document.querySelectorAll('.tab:not([data-tab="ports"])').forEach(t => {
  t.addEventListener('click', stopPortMonitor);
});

function startPortMonitor() {
  fetchPortStatus();
  if (portAutoRefresh.checked && !portPollTimer) {
    portPollTimer = setInterval(fetchPortStatus, 3000);
  }
}
function stopPortMonitor() {
  clearInterval(portPollTimer);
  portPollTimer = null;
}

portAutoRefresh.addEventListener('change', () => {
  if (portAutoRefresh.checked) {
    if (!portPollTimer) portPollTimer = setInterval(fetchPortStatus, 3000);
  } else {
    clearInterval(portPollTimer);
    portPollTimer = null;
  }
});

portRefreshBtn.onclick = fetchPortStatus;

async function fetchPortStatus() {
  try {
    const res  = await fetch('/api/ports/status');
    const data = await res.json();
    portWatched = data.watched || [];
    renderPortTable(data.ports || []);
    portLastUpdated.textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP')}`;
  } catch (e) {
    portTbody.innerHTML = `<tr><td colspan="7" class="deps-empty">⚠ ${escHtml(e.message)}</td></tr>`;
  }
}

function extractArgs(cmdline) {
  if (!cmdline) return '';
  // 実行ファイル部分（クォートあり・なし）を除いた引数部分を返す
  const m = cmdline.match(/^(?:"[^"]*"|[^\s]+)\s+([\s\S]*)/);
  return m ? m[1].trim() : '';
}

function renderPortTable(ports) {
  if (ports.length === 0) {
    portTbody.innerHTML = `<tr><td colspan="7" class="deps-empty">監視ポートがありません。ポートを追加してください。</td></tr>`;
    return;
  }
  portTbody.innerHTML = '';
  ports.forEach(({ port, status, proto, pid, name, cmdline }) => {
    const tr   = document.createElement('tr');
    const isUp = status === 'listening';

    const badgeCls = isUp ? 'port-status-listening' : 'port-status-free';
    const badgeTxt = isUp ? '使用中' : '空き';

    const killCell = isUp
      ? `<button class="port-kill-btn" data-pid="${pid}" data-port="${port}">Kill</button>`
      : '';
    const removeBtn = `<button class="port-remove-btn" data-port="${port}" title="監視から除外">✕</button>`;

    const args = extractArgs(cmdline);
    const argsShort = args.length > 50 ? args.slice(0, 50) + '…' : args;

    tr.innerHTML = `
      <td class="port-num">${port}</td>
      <td><span class="port-status-badge ${badgeCls}">${badgeTxt}</span></td>
      <td>${escHtml(proto)}</td>
      <td class="port-pid">${pid != null ? pid : '—'}</td>
      <td class="port-name">${escHtml(name || '—')}</td>
      <td class="port-cmd" title="${escHtml(cmdline || '')}">${args ? escHtml(argsShort) : '<span class="port-cmd-empty">—</span>'}</td>
      <td style="display:flex;gap:.4rem;align-items:center">${killCell}${removeBtn}</td>`;
    portTbody.appendChild(tr);
  });

  // Kill ボタン
  portTbody.querySelectorAll('.port-kill-btn').forEach(btn => {
    btn.onclick = async () => {
      const pid  = parseInt(btn.dataset.pid);
      const port = btn.dataset.port;
      if (!confirm(`ポート ${port} を使用しているプロセス (PID: ${pid}) を強制終了しますか？`)) return;
      btn.disabled = true;
      btn.textContent = '終了中...';
      try {
        const res  = await fetch('/api/ports/kill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid }),
        });
        const data = await res.json();
        if (data.ports) renderPortTable(data.ports);
      } catch (e) {
        alert(`Kill 失敗: ${e.message}`);
        btn.disabled = false;
        btn.textContent = 'Kill';
      }
      portLastUpdated.textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP')}`;
    };
  });

  // 監視除外ボタン
  portTbody.querySelectorAll('.port-remove-btn').forEach(btn => {
    btn.onclick = async () => {
      const port = parseInt(btn.dataset.port);
      const next = portWatched.filter(p => p !== port);
      await saveWatchedPorts(next);
      fetchPortStatus();
    };
  });
}

portAddBtn.onclick = async () => {
  const val  = parseInt(portAddInput.value);
  if (!val || val < 1 || val > 65535) { alert('1〜65535 の範囲で入力してください'); return; }
  if (portWatched.includes(val)) { alert(`ポート ${val} はすでに監視中です`); return; }
  const next = [...portWatched, val].sort((a, b) => a - b);
  portAddInput.value = '';
  await saveWatchedPorts(next);
  fetchPortStatus();
};

portAddInput.addEventListener('keydown', e => { if (e.key === 'Enter') portAddBtn.click(); });

async function saveWatchedPorts(ports) {
  await fetch('/api/ports/watched', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ports }),
  });
  portWatched = ports;
}

// =====================================================================
// S6: FVM 連携
// =====================================================================

const fvmHeader      = document.getElementById('fvm-header');
const fvmVersionPill = document.getElementById('fvm-version-pill');
const fvmVersionText = document.getElementById('fvm-version-text');

async function loadFvmInfo(projectPath) {
  fvmHeader.classList.add('hidden');
  fvmVersionPill.classList.remove('fvm-mismatch');
  try {
    const res  = await fetch(`/api/fvm/info?path=${encodeURIComponent(projectPath)}`);
    const data = await res.json();
    if (!data.hasFvm) return;
    fvmVersionText.textContent = data.sdkVersion || '—';
    fvmVersionPill.title = data.globalVersion
      ? `FVM SDK: ${data.sdkVersion} / グローバル flutter: ${data.globalVersion}`
      : `FVM SDK: ${data.sdkVersion}`;
    if (data.mismatch) {
      fvmVersionPill.classList.add('fvm-mismatch');
      fvmVersionPill.title += ' ⚠ バージョン不一致';
    }
    fvmHeader.classList.remove('hidden');
  } catch { /* FVM 未使用なら非表示のまま */ }
}

// =====================================================================
// S7: ビルドサイズトラッカー
// =====================================================================

const buildsizeScanBtn       = document.getElementById('buildsize-scan-btn');
const buildsizeRecordBtn     = document.getElementById('buildsize-record-btn');
const buildsizeHistoryToggle = document.getElementById('buildsize-history-toggle');
const buildsizeArtifacts     = document.getElementById('buildsize-artifacts');
const buildsizeArtifactList  = document.getElementById('buildsize-artifact-list');
const buildsizeHistorySection = document.getElementById('buildsize-history-section');
const buildsizeLabelInput    = document.getElementById('buildsize-label-input');
const buildsizeHistoryList   = document.getElementById('buildsize-history-list');

let buildsizeCurrentArtifacts = [];

function fmtBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024)        return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtDiff(diff) {
  if (diff === 0) return '<span class="bs-diff-zero">±0</span>';
  const sign = diff > 0 ? '+' : '';
  const cls  = diff > 0 ? 'bs-diff-grow' : 'bs-diff-shrink';
  return `<span class="${cls}">${sign}${fmtBytes(diff)}</span>`;
}

buildsizeScanBtn.onclick = async () => {
  if (!currentProjectPath) { alert('プロジェクトを選択してください'); return; }
  buildsizeScanBtn.disabled = true;
  buildsizeScanBtn.textContent = 'スキャン中...';
  try {
    const res  = await fetch(`/api/buildsize/scan?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    buildsizeCurrentArtifacts = data.artifacts || [];
    renderBuildsizeArtifacts(buildsizeCurrentArtifacts);
    buildsizeArtifacts.classList.remove('hidden');
    buildsizeRecordBtn.classList.toggle('hidden', buildsizeCurrentArtifacts.length === 0);
  } catch (e) {
    buildsizeArtifactList.innerHTML = `<div class="deps-empty">スキャンエラー: ${escHtml(e.message)}</div>`;
    buildsizeArtifacts.classList.remove('hidden');
  } finally {
    buildsizeScanBtn.disabled = false;
    buildsizeScanBtn.textContent = 'スキャン ▶';
  }
};

function renderBuildsizeArtifacts(artifacts) {
  if (artifacts.length === 0) {
    buildsizeArtifactList.innerHTML = '<div class="deps-empty">ビルド成果物が見つかりません（flutter build を実行してください）</div>';
    return;
  }
  buildsizeArtifactList.innerHTML = '';
  artifacts.forEach(a => {
    const row = document.createElement('div');
    row.className = 'bs-artifact-row';
    row.innerHTML = `
      <span class="bs-type-badge">${escHtml(a.type)}</span>
      <span class="bs-name" title="${escHtml(a.path)}">${escHtml(a.name)}</span>
      <span class="bs-size">${fmtBytes(a.size)}</span>`;
    buildsizeArtifactList.appendChild(row);
  });
}

buildsizeRecordBtn.onclick = async () => {
  if (!currentProjectPath || buildsizeCurrentArtifacts.length === 0) return;
  const label = buildsizeLabelInput.value.trim();
  try {
    const res  = await fetch('/api/buildsize/record', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: currentProjectPath, label, artifacts: buildsizeCurrentArtifacts }),
    });
    const data = await res.json();
    if (data.ok) {
      buildsizeLabelInput.value = '';
      renderBuildsizeHistory(data.history);
      buildsizeHistorySection.classList.remove('hidden');
      buildsizeHistoryToggle.textContent = '履歴 ▲';
    }
  } catch (e) { alert(`記録エラー: ${e.message}`); }
};

buildsizeHistoryToggle.onclick = async () => {
  const open = !buildsizeHistorySection.classList.contains('hidden');
  if (open) {
    buildsizeHistorySection.classList.add('hidden');
    buildsizeHistoryToggle.textContent = '履歴 ▼';
  } else {
    await loadBuildsizeHistory();
    buildsizeHistorySection.classList.remove('hidden');
    buildsizeHistoryToggle.textContent = '履歴 ▲';
  }
};

async function loadBuildsizeHistory() {
  if (!currentProjectPath) return;
  try {
    const res  = await fetch(`/api/buildsize/history?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    renderBuildsizeHistory(data.history || []);
  } catch { buildsizeHistoryList.innerHTML = '<div class="deps-empty">履歴の読み込みに失敗しました</div>'; }
}

function renderBuildsizeHistory(history) {
  if (history.length === 0) {
    buildsizeHistoryList.innerHTML = '<div class="deps-empty">記録なし — 「記録 💾」で保存してください</div>';
    return;
  }
  buildsizeHistoryList.innerHTML = '';
  history.forEach((entry, idx) => {
    const prev = history[idx + 1];
    const date = new Date(entry.timestamp).toLocaleString('ja-JP');
    const card = document.createElement('div');
    card.className = 'bs-history-card';

    const artifactsHtml = entry.artifacts.map(a => {
      let diffHtml = '';
      if (prev) {
        const prevA = prev.artifacts.find(p => p.name === a.name);
        if (prevA) diffHtml = ` ${fmtDiff(a.size - prevA.size)}`;
      }
      return `<div class="bs-history-artifact">
        <span class="bs-type-badge">${escHtml(a.type)}</span>
        <span class="bs-name">${escHtml(a.name)}</span>
        <span class="bs-size">${fmtBytes(a.size)}${diffHtml}</span>
      </div>`;
    }).join('');

    card.innerHTML = `
      <div class="bs-history-header">
        <span class="bs-history-date">${date}</span>
        ${entry.label ? `<span class="bs-history-label">${escHtml(entry.label)}</span>` : ''}
        <button class="bs-delete-btn btn-ghost" data-idx="${idx}" title="この記録を削除">✕</button>
      </div>
      <div class="bs-history-artifacts">${artifactsHtml}</div>`;
    buildsizeHistoryList.appendChild(card);
  });

  buildsizeHistoryList.querySelectorAll('.bs-delete-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.idx);
      if (!confirm('この記録を削除しますか？')) return;
      try {
        const res  = await fetch('/api/buildsize/delete', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ path: currentProjectPath, index: idx }),
        });
        const data = await res.json();
        if (data.ok) renderBuildsizeHistory(data.history);
      } catch (e) { alert(`削除エラー: ${e.message}`); }
    };
  });
}

// =====================================================================
// S8: エミュレータ データスナップショット UI
// =====================================================================

const snapshotRefreshBtn  = document.getElementById('snapshot-refresh-btn');
const snapshotNameInput   = document.getElementById('snapshot-name-input');
const snapshotNewBtn      = document.getElementById('snapshot-new-btn');
const snapshotList        = document.getElementById('snapshot-list');

snapshotRefreshBtn.onclick = loadSnapshotList;
snapshotNewBtn.onclick = () => {
  const name = snapshotNameInput.value.trim();
  if (!name) { alert('スナップショット名を入力してください'); return; }
  if (/[/\\<>:"|?*\x00-\x1f]/.test(name) || name === '.' || name === '..') { alert('使用できない文字が含まれています'); return; }
  const rel = `./emu-snapshots/${name}`;
  runCommand(
    `firebase emulators:start --export-on-exit=${rel}`,
    `emulators (new snapshot: ${name})`
  );
  snapshotNameInput.value = '';
};

async function loadSnapshotList() {
  if (!currentProjectPath) return;
  snapshotList.innerHTML = '<div class="deps-empty">読み込み中...</div>';
  try {
    const res  = await fetch(`/api/emusnapshot/list?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    renderSnapshotList(data.snapshots || []);
  } catch (e) {
    snapshotList.innerHTML = `<div class="deps-empty">エラー: ${escHtml(e.message)}</div>`;
  }
}

function renderSnapshotList(snapshots) {
  if (snapshots.length === 0) {
    snapshotList.innerHTML = '<div class="deps-empty">スナップショットなし — 「新規で起動」で作成してください</div>';
    return;
  }
  snapshotList.innerHTML = '';
  snapshots.forEach(snap => {
    const date = new Date(snap.mtime).toLocaleString('ja-JP');
    const row  = document.createElement('div');
    row.className = 'snapshot-row';
    row.innerHTML = `
      <div class="snapshot-info">
        <span class="snapshot-name">${escHtml(snap.name)}</span>
        <span class="snapshot-meta">${date} · ${snap.fileCount} files</span>
      </div>
      <div class="snapshot-actions">
        <button class="cmd-btn snap-load-btn" data-name="${escHtml(snap.name)}" title="このスナップショットを読み込んでエミュレータを起動">起動</button>
        <button class="btn-ghost snap-del-btn"  data-name="${escHtml(snap.name)}" title="削除">✕</button>
      </div>`;
    snapshotList.appendChild(row);
  });

  snapshotList.querySelectorAll('.snap-load-btn').forEach(btn => {
    btn.onclick = () => {
      const name = btn.dataset.name;
      const rel  = `./emu-snapshots/${name}`;
      runCommand(
        `firebase emulators:start --import=${rel} --export-on-exit=${rel}`,
        `emulators (snapshot: ${name})`
      );
    };
  });

  snapshotList.querySelectorAll('.snap-del-btn').forEach(btn => {
    btn.onclick = async () => {
      const name = btn.dataset.name;
      if (!confirm(`スナップショット「${name}」を削除しますか？`)) return;
      try {
        const res  = await fetch('/api/emusnapshot/delete', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ path: currentProjectPath, name }),
        });
        const data = await res.json();
        if (data.ok) renderSnapshotList(data.snapshots || []);
        else alert(data.error || '削除に失敗しました');
      } catch (e) { alert(`削除エラー: ${e.message}`); }
    };
  });
}

// Firebaseパネルが開いたときにスナップショット一覧を自動ロード
document.querySelector('.cmd-tab[data-cmd-tab="firebase"]').addEventListener('click', () => {
  if (currentProjectPath) loadSnapshotList();
});

// =====================================================================
// build_runner 管理 UI
// =====================================================================
const brRefreshBtn  = document.getElementById('br-refresh-btn');
const brFilesList   = document.getElementById('br-files-list');

document.querySelectorAll('.br-cmd-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    runCommand(btn.dataset.cmd, btn.dataset.label);
    document.querySelector('.tab[data-tab="logs"]').click();
  });
});

async function loadBrFiles() {
  if (!currentProjectPath) return;
  brFilesList.innerHTML = '<span class="cmd-empty">取得中…</span>';
  try {
    const res  = await fetch(`/api/build-runner/files?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    if (!data.files || data.files.length === 0) {
      brFilesList.innerHTML = '<span class="cmd-empty">.g.dart / .freezed.dart ファイルが見つかりません</span>';
      return;
    }
    brFilesList.innerHTML = `
      <table class="br-files-table">
        <thead><tr><th>ファイル</th><th>最終生成</th></tr></thead>
        <tbody>${data.files.map(f => {
          const d = new Date(f.mtime).toLocaleString('ja-JP');
          const isFreezed = f.file.endsWith('.freezed.dart');
          return `<tr>
            <td class="br-file-path">
              <span class="br-file-badge ${isFreezed ? 'br-badge-freezed' : 'br-badge-g'}">${isFreezed ? 'freezed' : 'g'}</span>
              ${escHtml(f.file)}
            </td>
            <td class="br-file-mtime">${d}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  } catch (e) {
    brFilesList.innerHTML = `<span class="cmd-empty" style="color:var(--err)">エラー: ${escHtml(e.message)}</span>`;
  }
}

brRefreshBtn.addEventListener('click', loadBrFiles);

document.querySelector('.cmd-tab[data-cmd-tab="buildrunner"]').addEventListener('click', () => {
  if (currentProjectPath) loadBrFiles();
});

// =====================================================================
// 初期ロード
// =====================================================================
browse('');
