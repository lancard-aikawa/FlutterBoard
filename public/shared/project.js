'use strict';
/*
 * 複数エントリページ間で共有するプロジェクトパスヘルパ。
 * index.html 側の selectProject() が同じキーで localStorage に書き込むので、
 * release.html は読み取り専用で参照する想定。
 */

const FB_PROJECT_KEY = 'fb-last-project-path';

function getProjectPath() {
  try { return localStorage.getItem(FB_PROJECT_KEY) || ''; }
  catch { return ''; }
}

function setProjectPath(path) {
  try { localStorage.setItem(FB_PROJECT_KEY, path); } catch {}
}

window.FbProject = { getProjectPath, setProjectPath, KEY: FB_PROJECT_KEY };
