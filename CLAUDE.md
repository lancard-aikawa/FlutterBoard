# FlutterBoard — AI 向け開発ガイド

Flutter / Firebase / Node.js 開発を支援するローカル Web ダッシュボード。
このファイルを読めば、コードベースの全体像と実装ルールを把握できる。

---

## 実装の進め方

**TODO.md** に実装順序（フェーズ）と設計メモがある。
**RC.md** に機能要望の背景・課題・UI イメージの詳細がある。
TODO.md のフェーズ順に、RC.md を参照しながら進める。

---

## アーキテクチャ

```
server/index.js        — HTTP サーバー（ポート 3210、127.0.0.1 のみ）
server/api.js          — API ルーティング（/api/* を各ハンドラへ振り分け）
server/processManager.js — プロセス起動・SSE ログ配信・PTY 管理・VM Service attach
server/vmService.js    — Dart VM Service WebSocket クライアント（外部依存なし・手動フレーミング）
server/[feature].js    — 機能ごとのハンドラ（1 機能 = 1 ファイル）
public/index.html      — 開発ダッシュボード UI（951 行）
public/app.js          — /index.html 用フロントエンド JS（4383 行、24 セクション）
public/style.css       — /index.html 用スタイル（CSS 変数ベース、3081 行）
public/release.html    — テストリリース専用エントリ（骨組み）
public/release.css     — /release.html 用スタイル
public/app-release.js  — /release.html 用エントリスクリプト
public/shared/         — 複数エントリで共有する最小セット（base.css / project.js）
src/app/               — app.js の分割編集用（split/merge で生成・結合）
config/                — プロジェクト別設定の JSON 保存先（gitignore 対象）
```

### マルチエントリ構成

フロントエンドは複数の HTML エントリに分かれている。責任と肥大化対策のため、
新機能は既存 `app.js` に足さず、用途別エントリに載せる方針:

- `/index.html` — 開発ダッシュボード（プロセス/ログ、ツール、Git など従来の全機能）
- `/release.html` — テストリリース支援（D 系の実装先）

共通要素（ベース CSS、ページ間ナビゲーション、プロジェクト path 取得）は
`public/shared/` に置き、個別ページは `shared/base.css` + ページ固有 CSS の順に
読み込む。ページ間は `<a href="/xxx.html">` で単純遷移する（SPA ルーティング不使用）。

### 重要な制約

- **Express 禁止** — 素の `node:http` のみ使用
- **CommonJS** — `require` / `module.exports`。ESM は使わない
- **フロントエンドはバンドルなし** — `<script src="app.js">` を直接読み込む。import/export 不使用

---

## トークン節約ルール（必読）

### 読み取り制約（厳守）

- **300 行 / 15 KB 以下のファイルは全体 Read 可**
  （行数は Read の行番号で確認、サイズは ls 等で確認）
- それを超えるファイルの全体 Read は禁止。必ず `Grep` → `Read(offset, limit)` で部分読み込み
- 現時点で制約対象: `public/app.js`（4383行）/ `public/index.html`（951行）/ `public/style.css`（3081行）
- **Edit 前に必ず対象行を Read すること**（未読ファイルへの Edit はエラーになる）
- 同一ファイルの再読は避けること（Edit/Write 成功 = 変更反映済み）

### app.js の部分読み込み

app.js は 4383 行ある。**全体を Read しない**。

1. `Grep` でセクション区切り行番号を特定する
2. `Read(offset, limit)` で必要セクションだけ読む
3. `Edit` で差分のみ変更する（編集後に再読しない）

セクション区切りの形式:
```
// =====================================================================
// セクション名
// =====================================================================
```

例: `プロセス管理` セクションを編集する場合
```
Grep pattern="プロセス管理" → 行番号を取得 → Read(offset=167, limit=540)
```

### app.js 分割編集ワークフロー（大規模変更時）

```
node scripts/split.js   # src/app/ に 24 ファイル（平均 170 行）に分割
# → 対象ファイルだけ編集
node scripts/merge.js   # public/app.js に結合（ラウンドトリップ保証）
```

分割ファイルの命名: `NN_セクション名.js`（例: `03_プロセス管理.js`）

### index.html の部分読み込み

index.html は 951 行。タブコメントで構造を確認:
```
<!-- ログタブ -->        → 行  60
<!-- コマンドタブ -->    → 行 170
<!-- ドキュメントタブ --> → 行 446
<!-- 依存チェックタブ --> → 行 471
<!-- 環境変数タブ -->    → 行 713
<!-- Git タブ -->        → 行 804
<!-- ポートモニタータブ --> → 行 906
```
`Grep` でコメントを検索して行番号を取得し、`Read(offset, limit)` で対象タブだけ読む。

### style.css の部分読み込み

style.css は 3081 行。セクション区切りの形式:
```
/* ===== セクション名 ===== */
```

主なセクションと行番号（目安）:
```
/* ===== ヘッダー =====          */  → 行   27
/* ===== コマンドタブ =====      */  → 行  732
/* ===== ドキュメントタブ ===== */  → 行 1221
/* ===== 依存チェックタブ ===== */  → 行 1405
/* ===== 環境変数タブ =====     */  → 行 1928
/* ===== Git タブ =====         */  → 行 2163
/* ===== S5: ポートモニター ==== */  → 行 2811
/* ===== S6: FVM 連携 =====     */  → 行 2936
/* ===== S7: ビルドサイズ ===== */  → 行 2950
/* ===== S8: エミュレータ ===== */  → 行 3024
```
`Grep pattern="===== セクション名"` で行番号を確認し、`Read(offset, limit)` で対象セクションのみ読む。

### 読み取り優先順位

ファイルにアクセスする際は上から順に試みる:

1. `Grep` — キーワード・関数名・セパレータで行番号を特定
2. `Read(offset, limit)` — 対象セクションのみ読む
3. `src/app/NN_*.js` — 分割ファイルを直接読む（split 済みの場合）
4. `Read` 全体 — 上記が全て使えない場合の最終手段

### 一般ルール

- **編集後に再読しない** — Edit/Write が成功すれば変更は反映済み
- **サブエージェントは最小化** — 同じファイルを再読させない

---

## サーバー側の実装パターン

### 新機能の追加手順

1. `server/featureName.js` を作成し `handleFeature(req, res, url)` を export
2. `server/api.js` に `require` と `if (pathname.startsWith('/api/feature'))` を追加
3. それだけ。index.js は触らない

### ハンドラの基本形

```js
'use strict';
async function handleFeature(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const p = url.searchParams.get('path');
  if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

  if (url.pathname === '/api/feature/something' && req.method === 'GET') {
    res.writeHead(200);
    return res.end(JSON.stringify({ result: 'ok' }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}
module.exports = { handleFeature };
```

### POST リクエストのボディ読み取り

```js
function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}
```

### 子プロセス実行（結果だけ欲しい場合）

```js
const { execFile } = require('child_process');
function run(cmd, args, cwd, timeout = 20000) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd, encoding: 'utf-8', shell: process.platform === 'win32', timeout },
      (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}
```

### SSE（リアルタイムログ）

プロセスのログ配信は `processManager.js` の SSE 機構を使う。
`GET /api/process/stream?id=<id>` でクライアントが接続し、`broadcast(id, data)` で全クライアントへ push。
新機能でリアルタイム配信が必要な場合も同じパターンを踏襲する。

---

## フロントエンドの実装パターン

### DOM 参照

```js
const myBtn = document.getElementById('my-btn');
```

ページ読み込み時に全要素を `const` で参照しておく（`app.js` の上部に並べる）。

### API 呼び出し

```js
const res  = await fetch(`/api/feature/something?path=${encodeURIComponent(currentProjectPath)}`);
const data = await res.json();
```

`currentProjectPath` はグローバル変数（選択中のプロジェクトパス）。

### コマンドを入力欄にセットして実行

```js
function runCommand(cmd, label) { /* app.js に実装済み */ }
```

ユーザーが確認・編集できるよう、コマンドはターミナル入力欄にセットしてから実行する（直接 exec しない）。

### タブ構造

- メインタブ: `.tab` / `.tab-content` / `data-tab="name"` / `id="tab-name"`
- コマンドタブ内サブタブ: `.cmd-tab` / `.cmd-tab-content`

### CSS 変数（テーマ）

```css
var(--bg)       /* 背景 */
var(--panel)    /* パネル背景 */
var(--text)     /* 本文 */
var(--muted)    /* 薄いテキスト */
var(--accent)   /* アクセントカラー（青系） */
var(--border)   /* ボーダー */
var(--ok)       /* 成功（緑） */
var(--warn)     /* 警告（黄） */
var(--err)      /* エラー（赤） */
var(--vm-accent) /* VM attach アクセント（teal） */
```

---

## プロセス管理（processManager.js）

- PTY モード優先（`node-pty`）、なければ pipe モードで fallback
- `flutter run` 中は `r` / `R` / `q` などのキーを PTY stdin へ送信可能
- ANSI エスケープとスピナー（bare `\r`）を `cleanOutput()` でクリーニング
- `flutter run` ログから VM Service URL と DevTools URL を自動検出し、`devtools-bar` に表示
- Windows 停止: `\x03` → 200ms → `Y\r\n`（バッチ確認プロンプト回答）→ 2s → `taskkill /T /F`（プロセスツリー強制終了）→ 3.5s → `forceExit`（SSE 強制通知）
- **VM Service attach** (`/api/process/attach-vm`): `vmService.js` 経由で外部プロセスの VM Service WebSocket に接続し、Stdout/Stderr ログを SSE に流し込む。`isVm` フラグで通常プロセスと区別

---

## 設定ファイル

```
config/pins_<hash>.json      — コマンドのピン留め（プロジェクト別）
config/seq_<hash>.json       — コマンドシーケンス（プロジェクト別）
config/flutterboard.pid      — サーバー PID（stop.cmd 用）
```

`<hash>` はプロジェクトパスの簡易ハッシュ（`projectInfo.js` の `hashPath()` を使う）。

---

## Git・コミット規則

- **コミットメッセージは日本語**
- フッターの `Co-Authored-By` 行は英語のまま残す
- 例:
  ```
  R4: Firebase 環境切り替えパネルを実装

  - server/firebaseEnv.js 新規作成
  - ...

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```

---

## 起動・停止

```
start.cmd   — node server/index.js をバックグラウンド起動（ポート 3210）
stop.cmd    — PID ファイルを読んでプロセスを終了
npm run dev — node --watch で開発用起動（ファイル変更で自動再起動）
```

ブラウザは `http://localhost:3210` でアクセス。
