# GitHub 連携 アーキテクチャ設計

G1/G2 実装に向けたサーバー・フロントエンドの構成方針。

---

## サーバー側

### ファイル構成

```
server/
  git.js              既存 — ローカル git 操作のみ（変更なし）
  github.js           新規 — /api/github/* のルーティング入口
  githubClient.js     新規 — gh CLI / REST API の切り替えレイヤー
  githubIssues.js     新規 — Issues CRUD
  githubPr.js         新規 — PR 作成・ステータス取得
  githubActions.js    新規 — CI / Actions 状態取得
```

### githubClient.js — 抽象レイヤー

CLI と REST API の差異をここに閉じ込める。各ハンドラは client を呼ぶだけ。

```js
'use strict';
const { execFile } = require('child_process');

// 将来は config/ の設定から読む
const USE_CLI = true;

function execGh(args, cwd) {
  return new Promise(resolve => {
    execFile('gh', args, { cwd, encoding: 'utf-8', shell: process.platform === 'win32' },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: err.message });
        try { resolve({ ok: true, data: JSON.parse(stdout) }); }
        catch { resolve({ ok: true, data: stdout.trim() }); }
      });
  });
}

async function callApi(endpoint, opts = {}) {
  // 将来実装: GitHub REST API 直接呼び出し
  // Authorization: Bearer <token> ヘッダーを付与
  throw new Error('REST API mode not implemented');
}

function run(args, cwd) {
  if (USE_CLI) return execGh(args, cwd);
  else         return callApi(args, cwd);
}

// gh が使えるかチェック（起動時 or 初回アクセス時に確認）
function checkGhAvailable() {
  return new Promise(resolve => {
    execFile('gh', ['--version'], { shell: process.platform === 'win32' },
      err => resolve(!err));
  });
}

module.exports = { run, checkGhAvailable };
```

### github.js — ルーティング

```js
'use strict';
const { handleIssues }  = require('./githubIssues');
const { handlePr }      = require('./githubPr');
const { handleActions } = require('./githubActions');

async function handleGithub(req, res, url) {
  const p = url.pathname;
  if (p.startsWith('/api/github/issues'))  return handleIssues(req, res, url);
  if (p.startsWith('/api/github/pr'))      return handlePr(req, res, url);
  if (p.startsWith('/api/github/actions')) return handleActions(req, res, url);
  res.writeHead(404); res.end('Not found');
}

module.exports = { handleGithub };
```

### 各ハンドラのエンドポイント

| ファイル | エンドポイント | メソッド | 概要 |
|---|---|---|---|
| githubIssues.js | `/api/github/issues/list` | GET | Open Issues 一覧 |
| githubIssues.js | `/api/github/issues/create` | POST | Issue 作成 |
| githubPr.js | `/api/github/pr/status` | GET | 現在ブランチの PR + CI |
| githubPr.js | `/api/github/pr/create` | POST | PR 作成 |
| githubActions.js | `/api/github/actions/runs` | GET | 直近 workflow runs |

### gh 未検出時の fallback

`checkGhAvailable()` の結果を起動時にキャッシュし、`/api/github/status` で返す。  
フロントエンドはこれを見てリモートタブの表示/非表示を切り替える。

---

## フロントエンド側

### ファイル構成

```
public/
  app.js              既存 — コア・共通グローバル（変更最小限）
  app-git-remote.js   新規 — Git タブのリモートサブタブ（GitHub 機能）
  index.html          既存 — <script> タグを1行追加するだけ
```

### 読み込み順

```html
<script src="app.js"></script>
<script src="app-git-remote.js"></script>   ← app.js の後
```

`app-git-remote.js` は `app.js` のグローバル変数（`currentProjectPath` 等）を
そのまま参照できる。`import/export` 不使用、バンドル不要。

### app-git-remote.js の構成

```
// =====================================================================
// DOM 参照（リモートタブ専用要素）
// =====================================================================

// =====================================================================
// gh 検出チェック + タブ表示制御
// =====================================================================

// =====================================================================
// 同期セクション（pull / push は app.js 側に残す）
// =====================================================================

// =====================================================================
// PR セクション
// =====================================================================

// =====================================================================
// Issues セクション
// =====================================================================

// =====================================================================
// Actions セクション
// =====================================================================
```

### app.js のリファクタリング

GitHub 連携とは切り離して**別タスク**とする。

現状の split/merge ワークフロー（`scripts/split.js` / `scripts/merge.js`）を活用し、
既存の 24 セクション境界をそのままファイル分割の単位にする方針。
バンドルなし・グローバル共有・`<script>` 複数読み込みは GitHub 連携と同じ方式。

---

## 将来の CLI → REST API 切り替え

`githubClient.js` の `USE_CLI` フラグを `false` にするだけで切り替え可能にする。  
REST API 側の実装は `callApi()` に追記する。認証トークンは `config/` に保存し、
環境変数タブから設定できるようにする（既存の env manager を流用）。

---

## 参照

- UI レイアウト設計 → [RC_UI_git.md](RC_UI_git.md)
- 機能要件 → [../RC.md](../RC.md) の G1/G2
