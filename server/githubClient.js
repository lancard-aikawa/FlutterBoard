'use strict';
const { execFile } = require('child_process');

// gh CLI / REST API の切り替えレイヤー
// 将来は config/ の設定から読む
const USE_CLI = true;

function execGh(args, cwd) {
  return new Promise(resolve => {
    // shell: false — args 配列の各要素をそのまま渡すことでスペース入り値を正しく扱う
    execFile('gh', args, { cwd, encoding: 'utf-8', shell: false, timeout: 15000 },
      (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: err.message, stderr: stderr || '' });
        try { resolve({ ok: true, data: JSON.parse(stdout) }); }
        catch { resolve({ ok: true, data: stdout.trim() }); }
      });
  });
}

async function callApi(/* args, cwd */) {
  throw new Error('REST API mode not implemented');
}

function run(args, cwd) {
  if (USE_CLI) return execGh(args, cwd);
  else         return callApi(args, cwd);
}

// gh が使えるかチェック（起動時 or 初回アクセス時に確認）
function checkGhAvailable() {
  return new Promise(resolve => {
    execFile('gh', ['--version'], { shell: false, timeout: 5000 },
      err => resolve(!err));
  });
}

// リモートが GitHub かチェック
function checkIsGithub(cwd) {
  return new Promise(resolve => {
    execFile('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf-8', shell: process.platform === 'win32', timeout: 5000 },
      (err, stdout) => resolve(!err && stdout.includes('github.com')));
  });
}

module.exports = { run, checkGhAvailable, checkIsGithub };
