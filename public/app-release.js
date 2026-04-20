'use strict';
/*
 * release.html エントリスクリプト。
 * D1: Pre-flight / D3: リリースノート / D4: 配布管理 / D-CL: チェックリスト
 */

(function () {
  const projectLabel = document.getElementById('release-project');
  const noProject    = document.getElementById('release-no-project');

  // D-CL: チェックリスト
  const clPanel      = document.getElementById('checklist-panel');
  const clView       = document.getElementById('checklist-view');
  const clEditor     = document.getElementById('checklist-editor');
  const clEditBtn    = document.getElementById('checklist-edit-btn');
  const clSaveBtn    = document.getElementById('checklist-save-btn');
  const clCancelBtn  = document.getElementById('checklist-cancel-btn');
  const clSaveStatus = document.getElementById('checklist-save-status');
  const preflight    = document.getElementById('preflight-panel');
  const runBtn       = document.getElementById('preflight-run-btn');
  const statusText   = document.getElementById('preflight-status');
  const summary      = document.getElementById('preflight-summary');
  const results      = document.getElementById('preflight-results');

  // D4: 配布 URL / テスター管理
  const distPanel        = document.getElementById('dist-panel');
  const distReleaseForm  = document.getElementById('dist-release-form');
  const distRelTitle     = document.getElementById('dist-release-title');
  const distRelUrl       = document.getElementById('dist-release-url');
  const distRelNote      = document.getElementById('dist-release-note');
  const distReleaseList  = document.getElementById('dist-release-list');
  const distRelActions   = document.getElementById('dist-release-actions');
  const distCopyAnnBtn   = document.getElementById('dist-copy-announce-btn');
  const distCopyStatus   = document.getElementById('dist-copy-status');
  const distTesterForm   = document.getElementById('dist-tester-form');
  const distTesterName   = document.getElementById('dist-tester-name');
  const distTesterEmail  = document.getElementById('dist-tester-email');
  const distTesterDevice = document.getElementById('dist-tester-device');
  const distTesterNote   = document.getElementById('dist-tester-note');
  const distTesterList   = document.getElementById('dist-tester-list');

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
      const badge  = BADGES[c.status] || '•';
      const value  = c.value !== null && c.value !== undefined ? escHtml(c.value) : '';
      const detail = c.detail ? `<div class="preflight-detail">${escHtml(c.detail)}</div>` : '';
      const helpBtn = c.helpKey
        ? `<button type="button" class="preflight-help-btn" onclick="window.open('/help/${escHtml(c.helpKey)}.html','fb-help','width=660,height=680,scrollbars=yes,resizable=yes')" title="対処方法を見る">?</button>`
        : '';
      return `
        <div class="preflight-item status-${c.status}">
          <div class="preflight-row">
            <span class="preflight-badge">${badge}</span>
            <span class="preflight-label">${escHtml(c.label)}</span>
            <span class="preflight-value" title="${value}">${value}</span>
            ${helpBtn}
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

  // --- D4: 配布 URL / テスター管理 ------------------------------------

  let _distReleases = [];
  let _distTesters  = [];

  function renderReleases(releases) {
    _distReleases = releases;
    distReleaseList.innerHTML = releases.length === 0
      ? '<li class="dist-list-item" style="color:var(--muted)">登録がありません</li>'
      : releases.map(r => {
          const dt = new Date(r.createdAt).toLocaleDateString('ja-JP');
          const urlHtml = r.url
            ? `<a class="dist-item-url" href="${escHtml(r.url)}" target="_blank" rel="noopener">${escHtml(r.url)}</a>`
            : '';
          const noteHtml = r.note ? `<span class="dist-item-note">${escHtml(r.note)}</span>` : '';
          return `
            <li class="dist-list-item" data-id="${escHtml(r.id)}">
              <div class="dist-item-main">
                <span class="dist-item-title">${escHtml(r.title || '（無題）')}</span>
                ${urlHtml}
                <span class="dist-item-meta">${dt}${noteHtml ? ' — ' : ''}${noteHtml}</span>
              </div>
              <button type="button" class="dist-del-btn" data-type="release" data-id="${escHtml(r.id)}" title="削除">✕</button>
            </li>`;
        }).join('');
    distRelActions.classList.toggle('hidden', releases.length === 0);
  }

  function renderTesters(testers) {
    _distTesters = testers;
    distTesterList.innerHTML = testers.length === 0
      ? '<li class="dist-list-item" style="color:var(--muted)">テスターが登録されていません</li>'
      : testers.map(t => {
          const parts = [t.email, t.device, t.note].filter(Boolean).map(escHtml).join(' / ');
          return `
            <li class="dist-list-item" data-id="${escHtml(t.id)}">
              <div class="dist-item-main">
                <span class="dist-item-title">${escHtml(t.name || t.email)}</span>
                ${parts ? `<span class="dist-item-meta">${parts}</span>` : ''}
              </div>
              <button type="button" class="dist-del-btn" data-type="tester" data-id="${escHtml(t.id)}" title="削除">✕</button>
            </li>`;
        }).join('');
  }

  async function loadDist(projectPath) {
    const [rr, tr] = await Promise.all([
      fetch(`/api/distributor/releases?path=${encodeURIComponent(projectPath)}`).then(r => r.json()),
      fetch(`/api/distributor/testers?path=${encodeURIComponent(projectPath)}`).then(r => r.json()),
    ]);
    renderReleases(rr.releases || []);
    renderTesters(tr.testers   || []);
  }

  // --- D-CL: チェックリスト ------------------------------------------

  // [text](url) 記法をリンクに変換（それ以外は escHtml）
  function renderInline(text) {
    const parts = [];
    let last = 0;
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(escHtml(text.slice(last, m.index)));
      const href     = escHtml(m[2]);
      const linkText = escHtml(m[1]);
      const external = !href.startsWith('#');
      parts.push(
        `<a href="${href}" class="checklist-link"` +
        (external ? ' target="_blank" rel="noopener"' : '') +
        `>${linkText}</a>`
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(escHtml(text.slice(last)));
    return parts.join('');
  }

  function renderMarkdown(md) {
    const lines  = md.split('\n');
    const chunks = [];
    let inList   = false;

    function closeList() {
      if (inList) { chunks.push('</ul>'); inList = false; }
    }

    for (const raw of lines) {
      const line = raw.trimEnd();

      // 見出し
      const h3 = line.match(/^###\s+(.+)/);
      if (h3) { closeList(); chunks.push(`<h3>${renderInline(h3[1])}</h3>`); continue; }
      const h2 = line.match(/^##\s+(.+)/);
      if (h2) { closeList(); chunks.push(`<h2>${renderInline(h2[1])}</h2>`); continue; }
      const h1 = line.match(/^#\s+(.+)/);
      if (h1) { closeList(); chunks.push(`<h2>${renderInline(h1[1])}</h2>`); continue; }

      // チェックボックス付きリスト
      const cb = line.match(/^- \[([ xX])\]\s*(.*)/);
      if (cb) {
        if (!inList) { chunks.push('<ul>'); inList = true; }
        const checked  = cb[1].toLowerCase() === 'x';
        chunks.push(
          `<li class="${checked ? 'checked' : ''}">` +
          `<input type="checkbox" class="checklist-cb"${checked ? ' checked' : ''}>` +
          `<span class="checklist-cb-label">${renderInline(cb[2])}</span></li>`
        );
        continue;
      }

      // 通常リスト
      const li = line.match(/^- (.+)/);
      if (li) {
        if (!inList) { chunks.push('<ul>'); inList = true; }
        chunks.push(`<li class="plain"><span>${renderInline(li[1])}</span></li>`);
        continue;
      }

      // 空行・その他
      closeList();
      if (line.trim()) chunks.push(`<p style="font-size:.85rem;color:var(--muted)">${renderInline(line)}</p>`);
    }
    closeList();
    return chunks.join('\n');
  }

  async function loadChecklist(projectPath) {
    try {
      const res  = await fetch(`/api/checklist?path=${encodeURIComponent(projectPath)}`);
      const data = await res.json();
      if (data.content) {
        clView.innerHTML   = renderMarkdown(data.content);
        clEditor.value     = data.content;
        attachCheckboxToggle();
      }
    } catch (e) {
      clView.textContent = `読み込みエラー: ${e.message}`;
    }
  }

  function attachCheckboxToggle() {
    clView.querySelectorAll('.checklist-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.closest('li').classList.toggle('checked', cb.checked);
      });
    });
  }

  function enterEditMode() {
    clView.classList.add('hidden');
    clEditor.classList.remove('hidden');
    clEditBtn.classList.add('hidden');
    clSaveBtn.classList.remove('hidden');
    clCancelBtn.classList.remove('hidden');
  }

  function exitEditMode() {
    clEditor.classList.add('hidden');
    clView.classList.remove('hidden');
    clEditBtn.classList.remove('hidden');
    clSaveBtn.classList.add('hidden');
    clCancelBtn.classList.add('hidden');
  }

  async function saveChecklist(projectPath) {
    clSaveBtn.disabled = true;
    try {
      const res = await fetch(
        `/api/checklist?path=${encodeURIComponent(projectPath)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: clEditor.value }) }
      );
      const data = await res.json();
      if (data.ok) {
        clView.innerHTML = renderMarkdown(clEditor.value);
        attachCheckboxToggle();
        exitEditMode();
        clSaveStatus.textContent = '保存しました ✓';
        setTimeout(() => { clSaveStatus.textContent = ''; }, 2000);
      }
    } catch (e) {
      clSaveStatus.textContent = `保存エラー: ${e.message}`;
    } finally {
      clSaveBtn.disabled = false;
    }
  }

  function initChecklist(projectPath) {
    clPanel.classList.remove('hidden');
    loadChecklist(projectPath);
    clEditBtn.addEventListener('click', enterEditMode);
    clCancelBtn.addEventListener('click', () => {
      clEditor.value = clView.innerHTML ? clEditor.value : '';
      exitEditMode();
    });
    clSaveBtn.addEventListener('click', () => saveChecklist(projectPath));
  }

  async function copyAnnouncement() {
    const latest = _distReleases[0];
    const urlLine = latest?.url ? `配布 URL: ${latest.url}` : '';
    const testerLines = _distTesters.map(t =>
      [t.name, t.email, t.device].filter(Boolean).join(' / ')
    ).join('\n');
    const text = [
      latest ? `【${latest.title || 'リリース'}】` : '',
      urlLine,
      '',
      testerLines ? `テスター:\n${testerLines}` : '',
    ].filter(s => s !== '').join('\n').trim();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { /* ignore */ }
    distCopyStatus.textContent = 'コピーしました ✓';
    setTimeout(() => { distCopyStatus.textContent = ''; }, 2000);
  }

  function initDist(projectPath) {
    distPanel.classList.remove('hidden');
    loadDist(projectPath);

    distReleaseForm.addEventListener('submit', async e => {
      e.preventDefault();
      const res = await fetch(
        `/api/distributor/releases?path=${encodeURIComponent(projectPath)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: distRelTitle.value, url: distRelUrl.value, note: distRelNote.value }) }
      );
      const data = await res.json();
      if (data.ok) {
        distRelTitle.value = ''; distRelUrl.value = ''; distRelNote.value = '';
        await loadDist(projectPath);
      }
    });

    distTesterForm.addEventListener('submit', async e => {
      e.preventDefault();
      const res = await fetch(
        `/api/distributor/testers?path=${encodeURIComponent(projectPath)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: distTesterName.value, email: distTesterEmail.value,
            device: distTesterDevice.value, note: distTesterNote.value }) }
      );
      const data = await res.json();
      if (data.ok) {
        distTesterName.value = ''; distTesterEmail.value = '';
        distTesterDevice.value = ''; distTesterNote.value = '';
        await loadDist(projectPath);
      }
    });

    // 削除ボタン（イベント委譲）
    distReleaseList.addEventListener('click', async e => {
      const btn = e.target.closest('.dist-del-btn[data-type="release"]');
      if (!btn) return;
      await fetch(`/api/distributor/releases/delete?path=${encodeURIComponent(projectPath)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: btn.dataset.id }) });
      await loadDist(projectPath);
    });
    distTesterList.addEventListener('click', async e => {
      const btn = e.target.closest('.dist-del-btn[data-type="tester"]');
      if (!btn) return;
      await fetch(`/api/distributor/testers/delete?path=${encodeURIComponent(projectPath)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: btn.dataset.id }) });
      await loadDist(projectPath);
    });

    distCopyAnnBtn.addEventListener('click', copyAnnouncement);
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

    // D-CL
    initChecklist(path);

    // D4
    initDist(path);
  } else {
    projectLabel.textContent = 'プロジェクト未選択';
    noProject.classList.remove('hidden');
  }
})();
