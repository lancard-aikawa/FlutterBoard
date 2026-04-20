'use strict';
/* android.html エントリスクリプト — applicationId / key.properties / build.gradle 編集 */

(function () {
  const projectLabel   = document.getElementById('android-project');
  const noProject      = document.getElementById('android-no-project');

  // applicationId
  const appidPanel     = document.getElementById('appid-panel');
  const appidFileLabel = document.getElementById('appid-file-label');
  const appidInput     = document.getElementById('appid-input');
  const appidSaveBtn   = document.getElementById('appid-save-btn');
  const appidStatus    = document.getElementById('appid-status');

  // key.properties
  const keyPanel       = document.getElementById('keyprops-panel');
  const keyNotfound    = document.getElementById('keyprops-notfound');
  const keyMaskBtn     = document.getElementById('keyprops-mask-btn');
  const keySaveBtn     = document.getElementById('keyprops-save-btn');
  const keyStatus      = document.getElementById('keyprops-status');
  const keyEditor      = document.getElementById('keyprops-editor');
  const keyCreateBtn   = document.getElementById('keyprops-create-btn');

  // build.gradle
  const gradlePanel    = document.getElementById('gradle-panel');
  const gradleLabel    = document.getElementById('gradle-file-label');
  const gradleView     = document.getElementById('gradle-view');
  const gradleEditor   = document.getElementById('gradle-editor');
  const gradleEditBtn  = document.getElementById('gradle-edit-btn');
  const gradleSaveBtn  = document.getElementById('gradle-save-btn');
  const gradleCancelBtn= document.getElementById('gradle-cancel-btn');
  const gradleStatus   = document.getElementById('gradle-status');

  let currentPath      = null;
  let gradleOriginal   = '';

  // -----------------------------------------------------------------------
  // ユーティリティ
  // -----------------------------------------------------------------------
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function flash(el, msg, isErr) {
    el.textContent = msg;
    el.className = 'save-status' + (isErr ? ' err' : '');
    setTimeout(() => { el.textContent = ''; }, 2500);
  }

  // -----------------------------------------------------------------------
  // build.gradle ハイライトレンダリング
  // -----------------------------------------------------------------------
  function renderGradle(content) {
    const lines = content.split('\n');
    const html  = lines.map(line => {
      const esc = escHtml(line);
      if (/applicationId|namespace\s*=/.test(line))  return `<span class="hl-appid">${esc}</span>`;
      if (/versionCode|versionName/.test(line))      return `<span class="hl-version">${esc}</span>`;
      if (/signingConfig|signingConfigs|storeFile|storePassword|keyAlias|keyPassword/.test(line))
                                                     return `<span class="hl-signing">${esc}</span>`;
      return esc;
    }).join('\n');
    gradleView.innerHTML = html;
  }

  // -----------------------------------------------------------------------
  // データ読み込み
  // -----------------------------------------------------------------------
  async function loadAll(p) {
    currentPath = p;
    await Promise.all([loadGradle(p), loadKeyProps(p)]);
  }

  async function loadGradle(p) {
    gradlePanel.classList.remove('hidden');
    appidPanel.classList.remove('hidden');
    try {
      const r    = await fetch(`/api/android/gradle?path=${encodeURIComponent(p)}`);
      if (!r.ok) {
        const e = await r.json();
        gradleView.textContent = e.error || '読み込み失敗';
        appidPanel.classList.add('hidden');
        return;
      }
      const data = await r.json();
      gradleLabel.textContent  = data.file;
      appidFileLabel.textContent = data.file;
      appidInput.value         = data.applicationId || '';
      gradleOriginal           = data.content;
      renderGradle(data.content);
    } catch (e) {
      gradleView.textContent = String(e);
    }
  }

  async function loadKeyProps(p) {
    keyPanel.classList.remove('hidden');
    try {
      const r    = await fetch(`/api/android/keyprops?path=${encodeURIComponent(p)}`);
      const data = await r.json();
      if (!data.exists) {
        keyEditor.classList.add('hidden');
        keySaveBtn.classList.add('hidden');
        keyMaskBtn.classList.add('hidden');
        keyNotfound.classList.remove('hidden');
      } else {
        keyNotfound.classList.add('hidden');
        keyEditor.classList.remove('hidden');
        keySaveBtn.classList.remove('hidden');
        keyMaskBtn.classList.remove('hidden');
        keyEditor.value = data.content;
      }
    } catch (e) {
      keyEditor.value = String(e);
    }
  }

  // -----------------------------------------------------------------------
  // applicationId 保存
  // -----------------------------------------------------------------------
  appidSaveBtn.addEventListener('click', async () => {
    if (!currentPath) return;
    const newId = appidInput.value.trim();
    if (!newId) { flash(appidStatus, 'ID を入力してください', true); return; }

    // build.gradle の applicationId 行を書き換え
    const r = await fetch(`/api/android/gradle?path=${encodeURIComponent(currentPath)}`);
    if (!r.ok) { flash(appidStatus, '読み込み失敗', true); return; }
    const data = await r.json();

    const updated = data.content.replace(
      /(applicationId\s*=?\s*)"([^"]+)"/,
      (_, pre) => `${pre}"${newId}"`
    );
    if (updated === data.content) { flash(appidStatus, '変更なし', true); return; }

    const w = await fetch('/api/android/gradle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: currentPath, content: updated }),
    });
    if (w.ok) {
      gradleOriginal = updated;
      renderGradle(updated);
      flash(appidStatus, '保存しました');
    } else {
      flash(appidStatus, '保存失敗', true);
    }
  });

  // -----------------------------------------------------------------------
  // key.properties マスク切り替え
  // -----------------------------------------------------------------------
  let masked = true;
  keyMaskBtn.addEventListener('click', () => {
    masked = !masked;
    keyEditor.classList.toggle('masked', masked);
    keyMaskBtn.textContent = masked ? '👁 表示' : '🙈 隠す';
  });

  // key.properties テンプレート作成
  const KEY_TEMPLATE = `storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=YOUR_KEY_ALIAS
storeFile=../keystore/release.jks
`;
  keyCreateBtn.addEventListener('click', async () => {
    if (!currentPath) return;
    const w = await fetch('/api/android/keyprops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: currentPath, content: KEY_TEMPLATE }),
    });
    if (w.ok) {
      await loadKeyProps(currentPath);
    } else {
      alert('作成に失敗しました');
    }
  });

  // key.properties 保存
  keySaveBtn.addEventListener('click', async () => {
    if (!currentPath) return;
    const w = await fetch('/api/android/keyprops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: currentPath, content: keyEditor.value }),
    });
    flash(keyStatus, w.ok ? '保存しました' : '保存失敗', !w.ok);
  });

  // -----------------------------------------------------------------------
  // build.gradle 編集モード
  // -----------------------------------------------------------------------
  gradleEditBtn.addEventListener('click', () => {
    gradleView.classList.add('hidden');
    gradleEditor.classList.remove('hidden');
    gradleEditor.value = gradleOriginal;
    gradleEditBtn.classList.add('hidden');
    gradleSaveBtn.classList.remove('hidden');
    gradleCancelBtn.classList.remove('hidden');
  });

  gradleCancelBtn.addEventListener('click', () => {
    gradleEditor.classList.add('hidden');
    gradleView.classList.remove('hidden');
    gradleEditBtn.classList.remove('hidden');
    gradleSaveBtn.classList.add('hidden');
    gradleCancelBtn.classList.add('hidden');
  });

  gradleSaveBtn.addEventListener('click', async () => {
    if (!currentPath) return;
    const content = gradleEditor.value;
    const w = await fetch('/api/android/gradle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: currentPath, content }),
    });
    if (w.ok) {
      gradleOriginal = content;
      renderGradle(content);
      // applicationId 欄も更新
      const m = content.match(/applicationId\s*=?\s*"([^"]+)"/);
      if (m) appidInput.value = m[1];
      gradleCancelBtn.click();
      flash(gradleStatus, '保存しました');
    } else {
      flash(gradleStatus, '保存失敗', true);
    }
  });

  // -----------------------------------------------------------------------
  // プロジェクト初期化
  // -----------------------------------------------------------------------
  function init() {
    const p = getProjectPath();
    if (!p) {
      noProject.classList.remove('hidden');
      return;
    }
    projectLabel.textContent = p;
    loadAll(p);
  }

  window.addEventListener('project-changed', e => {
    currentPath = e.detail;
    projectLabel.textContent = currentPath;
    noProject.classList.add('hidden');
    loadAll(currentPath);
  });

  init();
})();
