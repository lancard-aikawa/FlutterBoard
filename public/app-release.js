'use strict';
/*
 * release.html エントリスクリプト。
 * - プロジェクトパスを localStorage から取得
 * - D1: Pre-flight チェックの実行とカード表示
 */

(function () {
  const projectLabel = document.getElementById('release-project');
  const noProject    = document.getElementById('release-no-project');
  const preflight    = document.getElementById('preflight-panel');
  const runBtn       = document.getElementById('preflight-run-btn');
  const statusText   = document.getElementById('preflight-status');
  const summary      = document.getElementById('preflight-summary');
  const results      = document.getElementById('preflight-results');

  // D3: リリースノート
  const rnPanel       = document.getElementById('relnotes-panel');
  const rnFromSelect  = document.getElementById('relnotes-from-select');
  const rnIncludeOther = document.getElementById('relnotes-include-other');
  const rnGenBtn      = document.getElementById('relnotes-gen-btn');
  const rnStatus      = document.getElementById('relnotes-status');
  const rnMeta        = document.getElementById('relnotes-meta');
  const rnBody        = document.getElementById('relnotes-body');
  const rnCopyBtn     = document.getElementById('relnotes-copy-btn');
  const rnCopyStatus  = document.getElementById('relnotes-copy-status');
  const rnMarkdown    = document.getElementById('relnotes-markdown');
  const rnCount       = document.getElementById('relnotes-count');
  const rnCommitList  = document.getElementById('relnotes-commit-list');

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  const BADGES = { ok: '✅', warn: '⚠️', error: '❌', info: 'ℹ️' };

  function renderChecks(data) {
    const counts = { ok: 0, warn: 0, error: 0, info: 0 };
    for (const c of data.checks) counts[c.status] = (counts[c.status] || 0) + 1;

    const runAt = new Date(data.runAt).toLocaleTimeString('ja-JP');
    summary.innerHTML = `
      <span class="sum-error">❌ ${counts.error}</span>
      <span class="sum-warn">⚠️ ${counts.warn}</span>
      <span class="sum-ok">✅ ${counts.ok}</span>
      <span class="sum-info">ℹ️ ${counts.info}</span>
      <span class="sum-time">実行: ${runAt}</span>
    `;
    summary.classList.remove('hidden');

    results.innerHTML = data.checks.map(c => {
      const badge = BADGES[c.status] || '•';
      const value = c.value !== null && c.value !== undefined ? escHtml(c.value) : '';
      const detail = c.detail ? `<div class="preflight-detail">${escHtml(c.detail)}</div>` : '';
      return `
        <div class="preflight-item status-${c.status}">
          <div class="preflight-row">
            <span class="preflight-badge">${badge}</span>
            <span class="preflight-label">${escHtml(c.label)}</span>
            <span class="preflight-value" title="${value}">${value}</span>
          </div>
          ${detail}
        </div>
      `;
    }).join('');
  }

  async function runPreflight(projectPath) {
    runBtn.disabled = true;
    statusText.textContent = '実行中…';
    results.innerHTML = '';
    summary.classList.add('hidden');

    try {
      const res  = await fetch(`/api/preflight/check?path=${encodeURIComponent(projectPath)}`);
      const data = await res.json();
      if (data.error) {
        statusText.textContent = `エラー: ${data.error}`;
        return;
      }
      renderChecks(data);
      const errors = data.checks.filter(c => c.status === 'error').length;
      statusText.textContent = errors > 0
        ? `${errors} 件の重大な問題を検出しました`
        : '完了';
    } catch (e) {
      statusText.textContent = `通信エラー: ${e.message}`;
    } finally {
      runBtn.disabled = false;
    }
  }

  // --- D3: リリースノート ---------------------------------------------

  async function loadTags(projectPath) {
    try {
      const res  = await fetch(`/api/releasenotes/tags?path=${encodeURIComponent(projectPath)}`);
      const data = await res.json();
      if (data.error) {
        rnStatus.textContent = `タグ取得エラー: ${data.error}`;
        return;
      }
      // 先頭の「自動選択」以外をクリアして詰め直す
      rnFromSelect.length = 1;
      for (const tag of (data.tags || [])) {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = tag;
        rnFromSelect.appendChild(opt);
      }
      if ((data.tags || []).length === 0) {
        rnStatus.textContent = 'タグがまだありません（全履歴を対象に生成できます）';
      }
    } catch (e) {
      rnStatus.textContent = `タグ取得失敗: ${e.message}`;
    }
  }

  function renderCommitList(commits) {
    rnCount.textContent = commits.length;
    rnCommitList.innerHTML = commits.map(c => {
      const short = (c.hash || '').slice(0, 7);
      return `
        <li>
          <span class="relnotes-commit-hash">${escHtml(short)}</span>
          <span class="relnotes-commit-subject">${escHtml(c.subject || '')}</span>
          <span class="relnotes-commit-author">${escHtml(c.author || '')}</span>
        </li>
      `;
    }).join('');
  }

  function renderMeta(data) {
    const fromPart = data.from
      ? `基準タグ: <code>${escHtml(data.from)}</code> → <code>HEAD</code>`
      : `全履歴（タグ未設定）`;
    rnMeta.innerHTML = `${fromPart} &nbsp; 対象: <strong>${data.count}</strong> 件`;
    rnMeta.classList.remove('hidden');
  }

  async function generateReleaseNotes(projectPath) {
    rnGenBtn.disabled = true;
    rnStatus.textContent = '生成中…';
    rnCopyStatus.textContent = '';

    const params = new URLSearchParams({ path: projectPath });
    const fromVal = rnFromSelect.value;
    if (fromVal) params.set('from', fromVal);
    if (!rnIncludeOther.checked) params.set('includeOther', '0');

    try {
      const res  = await fetch(`/api/releasenotes/generate?${params.toString()}`);
      const data = await res.json();
      if (data.error) {
        rnStatus.textContent = `エラー: ${data.error}`;
        rnBody.classList.add('hidden');
        return;
      }
      rnMarkdown.value = data.markdown || '';
      renderMeta(data);
      renderCommitList(data.commits || []);
      rnBody.classList.remove('hidden');
      rnStatus.textContent = `完了（${data.count} 件）`;
    } catch (e) {
      rnStatus.textContent = `通信エラー: ${e.message}`;
    } finally {
      rnGenBtn.disabled = false;
    }
  }

  async function copyMarkdown() {
    const text = rnMarkdown.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      rnCopyStatus.textContent = 'コピーしました ✓';
    } catch {
      // フォールバック: textarea select + execCommand
      rnMarkdown.select();
      document.execCommand('copy');
      rnCopyStatus.textContent = 'コピーしました ✓';
    }
    setTimeout(() => { rnCopyStatus.textContent = ''; }, 2000);
  }

  // 初期化
  const path = window.FbProject.getProjectPath();
  if (path) {
    projectLabel.textContent = path;
    preflight.classList.remove('hidden');
    runBtn.addEventListener('click', () => runPreflight(path));

    // D3
    rnPanel.classList.remove('hidden');
    rnGenBtn.addEventListener('click', () => generateReleaseNotes(path));
    rnCopyBtn.addEventListener('click', copyMarkdown);
    loadTags(path);
  } else {
    projectLabel.textContent = 'プロジェクト未選択';
    noProject.classList.remove('hidden');
  }
})();
