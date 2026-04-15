'use strict';
// =====================================================================
// Git タブ — リモートサブタブ（GitHub 連携 G1/G2）
// currentProjectPath は app-core.js で定義済み
// =====================================================================

// =====================================================================
// DOM 参照
// =====================================================================
const gitSubtabBtns       = document.querySelectorAll('.git-subtab');
const gitSubtabRemoteBtn  = document.getElementById('git-subtab-remote-btn');
const gitMainPane         = document.getElementById('git-main');
const gitRemotePane       = document.getElementById('git-remote-pane');
const ghUnavailableMsg    = document.getElementById('gh-unavailable-msg');
const ghFeatures          = document.getElementById('gh-features');

// PR
const ghprSectionBody     = document.getElementById('ghpr-section-body');
const ghprMeta            = document.getElementById('ghpr-meta');
const ghprStatusArea      = document.getElementById('ghpr-status-area');
const ghprRefreshBtn      = document.getElementById('ghpr-refresh-btn');
const ghprTitle           = document.getElementById('ghpr-title');
const ghprBase            = document.getElementById('ghpr-base');
const ghprBody            = document.getElementById('ghpr-body');
const ghprCreateBtn       = document.getElementById('ghpr-create-btn');
const ghprCreateResult    = document.getElementById('ghpr-create-result');

// Issues
const ghissueSectionBody  = document.getElementById('ghissue-section-body');
const ghissueMeta         = document.getElementById('ghissue-meta');
const ghissueTitle        = document.getElementById('ghissue-title');
const ghissueBody         = document.getElementById('ghissue-body');
const ghissueCreateBtn    = document.getElementById('ghissue-create-btn');
const ghissueCreateResult = document.getElementById('ghissue-create-result');
const ghissueList         = document.getElementById('ghissue-list');
const ghissueRefreshBtn   = document.getElementById('ghissue-refresh-btn');

// Actions
const ghactionsSectionBody = document.getElementById('ghactions-section-body');
const ghactionsMeta       = document.getElementById('ghactions-meta');
const ghactionsList       = document.getElementById('ghactions-list');
const ghactionsRefreshBtn = document.getElementById('ghactions-refresh-btn');

// =====================================================================
// アコーディオン開閉
// =====================================================================
document.querySelectorAll('.gh-section-header').forEach(header => {
  header.addEventListener('click', e => {
    const targetId = header.dataset.target;
    const body = document.getElementById(targetId);
    if (!body) return;
    const isOpen = body.classList.toggle('open');
    header.classList.toggle('open', isOpen);
  });
});

// =====================================================================
// サブタブ切り替え
// =====================================================================
gitSubtabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    gitSubtabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.subtab;
    gitMainPane.classList.toggle('hidden', target !== 'local');
    gitRemotePane.classList.toggle('hidden', target !== 'remote');
    if (target === 'remote') loadRemoteTab();
  });
});

// =====================================================================
// gh 検出チェック（タブは常に表示、内側でメッセージ制御）
// =====================================================================
let ghAvailable = false;

function showUnavailable(data) {
  ghFeatures.classList.add('hidden');
  ghUnavailableMsg.classList.remove('hidden');
  if (!data.ghAvailable) {
    ghUnavailableMsg.textContent = 'gh コマンドが見つかりません。インストール後に gh auth login を実行してください。';
  } else if (!data.isGithub) {
    ghUnavailableMsg.textContent = 'このリポジトリのリモート origin が GitHub ではありません（git remote get-url origin で確認してください）。';
  }
}

// プロジェクト切り替え時に状態をリセット（タブを開き直したとき再チェックさせる）
window.ghCheckAfterProjectLoad = function() {
  ghAvailable = false;
};

// =====================================================================
// リモートタブ表示（プロジェクト切り替え後は毎回ステータス再チェック）
// =====================================================================
async function loadRemoteTab() {
  // プロジェクト未選択
  if (!currentProjectPath) {
    ghUnavailableMsg.textContent = 'プロジェクトを選択してください。';
    ghUnavailableMsg.classList.remove('hidden');
    ghFeatures.classList.add('hidden');
    return;
  }
  // キャッシュがある場合はスキップ
  if (!ghAvailable) {
    ghUnavailableMsg.textContent = '確認中…';
    ghUnavailableMsg.classList.remove('hidden');
    ghFeatures.classList.add('hidden');
    const res  = await fetch(`/api/github/status?path=${encodeURIComponent(currentProjectPath)}`).catch(() => null);
    const data = res ? await res.json() : { ghAvailable: false, isGithub: false };
    ghAvailable = data.ghAvailable && data.isGithub;
    if (!ghAvailable) { showUnavailable(data); return; }
  }
  ghUnavailableMsg.classList.add('hidden');
  ghFeatures.classList.remove('hidden');
  loadPrStatus();
  loadIssues();
  loadActions();
  loadPrCommits();
}

// =====================================================================
// PR セクション
// =====================================================================
async function loadPrStatus() {
  ghprStatusArea.innerHTML = '<span style="color:var(--muted)">取得中…</span>';
  ghprMeta.textContent = '';
  try {
    const res  = await fetch(`/api/github/pr/status?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    if (!data.ok) { ghprStatusArea.textContent = data.error || 'エラー'; return; }

    const prs = Array.isArray(data.data) ? data.data : [];
    const cur = data.currentBranch || '';

    if (prs.length === 0) {
      ghprStatusArea.innerHTML = '<span style="color:var(--muted)">Open PR はありません</span>';
      ghprMeta.textContent = '';
    } else {
      ghprStatusArea.innerHTML = prs.map(pr => {
        const isCurrent = pr.headRefName === cur;
        const ciStatus  = getCiBadge(pr.statusCheckRollup);
        return `<div class="gh-pr-row${isCurrent ? ' gh-pr-current' : ''}">
          <span class="gh-num">#${pr.number}</span>
          <span class="gh-title">${escHtml(pr.title)}</span>
          <span class="gh-pr-branch">${escHtml(pr.headRefName)} → ${escHtml(pr.baseRefName)}</span>
          ${ciStatus.label ? `<span class="gh-ci-badge ${ciStatus.cls}">${ciStatus.label}</span>` : ''}
          <a class="gh-link" href="${escHtml(pr.url)}" target="_blank">↗</a>
        </div>`;
      }).join('');
      const curPr = prs.find(p => p.headRefName === cur);
      ghprMeta.textContent = curPr ? `#${curPr.number}` : `${prs.length} open`;
    }

    // PR タイトルが未入力ならブランチ名をデフォルトセット
    if (!ghprTitle.value && cur) {
      ghprTitle.value = cur;
    }

    // base ブランチ選択肢を更新（現在ブランチ以外、main/master を優先）
    if (data.branches && data.branches.length) {
      const bases = data.branches.filter(b => b !== cur);
      ghprBase.innerHTML = bases.map(b =>
        `<option value="${escHtml(b)}"${b === 'main' || b === 'master' ? ' selected' : ''}>${escHtml(b)}</option>`
      ).join('');
    }
  } catch (e) {
    ghprStatusArea.textContent = 'エラー: ' + e.message;
  }
}

async function loadPrCommits() {
  try {
    const res  = await fetch(`/api/github/pr/commits?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    if (data.ok && data.data && !ghprBody.value) {
      ghprBody.value = data.data;
    }
  } catch { /* 無視 */ }
}

function getCiBadge(rollup) {
  if (!rollup || rollup.length === 0) return { cls: '', label: '—' };
  const states = rollup.map(r => r.state || r.conclusion || '');
  if (states.some(s => s === 'FAILURE' || s === 'failure'))  return { cls: 'gh-ci-failure', label: '✗ CI 失敗' };
  if (states.some(s => s === 'PENDING' || s === 'in_progress')) return { cls: 'gh-ci-pending', label: '⏳ CI 実行中' };
  if (states.every(s => s === 'SUCCESS' || s === 'success')) return { cls: 'gh-ci-success', label: '✓ CI 通過' };
  return { cls: '', label: '—' };
}

ghprRefreshBtn.addEventListener('click', () => { loadPrStatus(); loadPrCommits(); });

ghprCreateBtn.addEventListener('click', async () => {
  const title = ghprTitle.value.trim();
  if (!title) { ghprCreateResult.textContent = 'タイトルを入力してください'; return; }
  ghprCreateBtn.disabled = true;
  ghprCreateResult.textContent = '作成中…';
  try {
    const res  = await fetch('/api/github/pr/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentProjectPath, title, base: ghprBase.value, body: ghprBody.value }),
    });
    const data = await res.json();
    if (data.ok) {
      ghprCreateResult.style.color = 'var(--ok)';
      ghprCreateResult.textContent = '作成しました: ' + (typeof data.data === 'string' ? data.data : JSON.stringify(data.data));
      ghprTitle.value = '';
      ghprBody.value  = '';
      loadPrStatus();
    } else {
      ghprCreateResult.style.color = 'var(--err)';
      ghprCreateResult.textContent = 'エラー: ' + (data.error || data.stderr || '');
    }
  } catch (e) {
    ghprCreateResult.style.color = 'var(--err)';
    ghprCreateResult.textContent = 'エラー: ' + e.message;
  } finally {
    ghprCreateBtn.disabled = false;
  }
});

// =====================================================================
// Issues セクション
// =====================================================================
async function loadIssues() {
  ghissueList.innerHTML = '<li class="gh-list-item" style="color:var(--muted)">取得中…</li>';
  ghissueMeta.textContent = '';
  try {
    const res  = await fetch(`/api/github/issues/list?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.data) || data.data.length === 0) {
      ghissueList.innerHTML = '<li class="gh-list-item" style="color:var(--muted)">Open Issues はありません</li>';
      ghissueMeta.textContent = '';
      return;
    }
    ghissueList.innerHTML = data.data.map(issue =>
      `<li class="gh-list-item">
        <span class="gh-num">#${issue.number}</span>
        <span class="gh-title">${escHtml(issue.title)}</span>
        <a class="gh-link" href="${escHtml(issue.url)}" target="_blank">↗</a>
      </li>`
    ).join('');
    ghissueMeta.textContent = `${data.data.length} open`;
  } catch (e) {
    ghissueList.innerHTML = `<li class="gh-list-item" style="color:var(--err)">エラー: ${escHtml(e.message)}</li>`;
  }
}

ghissueRefreshBtn.addEventListener('click', loadIssues);

ghissueCreateBtn.addEventListener('click', async () => {
  const title = ghissueTitle.value.trim();
  if (!title) { ghissueCreateResult.textContent = 'タイトルを入力してください'; return; }
  ghissueCreateBtn.disabled = true;
  ghissueCreateResult.textContent = '作成中…';
  try {
    const res  = await fetch('/api/github/issues/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentProjectPath, title, body: ghissueBody.value }),
    });
    const data = await res.json();
    if (data.ok) {
      ghissueCreateResult.style.color = 'var(--ok)';
      ghissueCreateResult.textContent = '作成しました: ' + (typeof data.data === 'string' ? data.data : JSON.stringify(data.data));
      ghissueTitle.value = '';
      ghissueBody.value  = '';
      loadIssues();
    } else {
      ghissueCreateResult.style.color = 'var(--err)';
      ghissueCreateResult.textContent = 'エラー: ' + (data.error || data.stderr || '');
    }
  } catch (e) {
    ghissueCreateResult.style.color = 'var(--err)';
    ghissueCreateResult.textContent = 'エラー: ' + e.message;
  } finally {
    ghissueCreateBtn.disabled = false;
  }
});

// =====================================================================
// CI / Actions セクション
// =====================================================================
async function loadActions() {
  ghactionsList.innerHTML = '<li class="gh-list-item" style="color:var(--muted)">取得中…</li>';
  ghactionsMeta.textContent = '';
  try {
    const res  = await fetch(`/api/github/actions/runs?path=${encodeURIComponent(currentProjectPath)}`);
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.data) || data.data.length === 0) {
      ghactionsList.innerHTML = '<li class="gh-list-item" style="color:var(--muted)">workflow runs がありません</li>';
      return;
    }
    ghactionsList.innerHTML = data.data.map(run => {
      const icon = runIcon(run.status, run.conclusion);
      const when = run.createdAt ? new Date(run.createdAt).toLocaleString('ja-JP') : '';
      return `<li class="gh-list-item">
        <span style="flex-shrink:0">${icon}</span>
        <span class="gh-title">${escHtml(run.workflowName || run.name)}</span>
        <span class="gh-num">${escHtml(run.headBranch || '')}</span>
        <span class="gh-num">${when}</span>
        <a class="gh-link" href="${escHtml(run.url)}" target="_blank">↗</a>
      </li>`;
    }).join('');
    // 最新 run の状態をヘッダーメタに表示
    const latest = data.data[0];
    const icon = runIcon(latest.status, latest.conclusion);
    ghactionsMeta.innerHTML = icon;
  } catch (e) {
    ghactionsList.innerHTML = `<li class="gh-list-item" style="color:var(--err)">エラー: ${escHtml(e.message)}</li>`;
  }
}

function runIcon(status, conclusion) {
  if (status === 'completed') {
    if (conclusion === 'success')  return '<span style="color:var(--ok)">✓</span>';
    if (conclusion === 'failure')  return '<span style="color:var(--err)">✗</span>';
    if (conclusion === 'cancelled') return '<span style="color:var(--muted)">○</span>';
  }
  if (status === 'in_progress') return '<span style="color:var(--warn)">⏳</span>';
  return '<span style="color:var(--muted)">—</span>';
}

ghactionsRefreshBtn.addEventListener('click', loadActions);

// タブは常に有効（disabled しない）
// 内容の確認はタブを開いたとき（loadRemoteTab）に行う
