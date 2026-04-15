'use strict';

// =====================================================================
// 共有ステート
// app.js および将来の機能別ファイルから参照・更新される
// =====================================================================

let currentProjectPath = '';
let currentNpmDir      = null; // npm check/audit で使うディレクトリ（null = projectPath）

// =====================================================================
// 共有ユーティリティ
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
