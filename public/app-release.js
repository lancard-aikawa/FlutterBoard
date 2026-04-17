'use strict';
/*
 * テストリリースページ（release.html）のエントリスクリプト。
 * 現状は最小骨組み: 開発画面側で選択済みのプロジェクトパスを表示するだけ。
 * D1 以降の機能はここに順次追加していく。
 */

(function () {
  const projectLabel = document.getElementById('release-project');
  const hint         = document.getElementById('release-project-hint');

  const path = window.FbProject.getProjectPath();
  if (path) {
    projectLabel.textContent = path;
  } else {
    projectLabel.textContent = 'プロジェクト未選択';
    hint.textContent = '※ まず開発ダッシュボードでプロジェクトを選択してください。';
    hint.classList.remove('hidden');
  }
})();
