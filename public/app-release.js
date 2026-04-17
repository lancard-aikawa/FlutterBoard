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

  // 初期化
  const path = window.FbProject.getProjectPath();
  if (path) {
    projectLabel.textContent = path;
    preflight.classList.remove('hidden');
    runBtn.addEventListener('click', () => runPreflight(path));
  } else {
    projectLabel.textContent = 'プロジェクト未選択';
    noProject.classList.remove('hidden');
  }
})();
