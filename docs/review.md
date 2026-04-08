# FlutterBoard コードレビュー

レビュー日: 2026-04-08  
対象: server/*.js, public/app.js

---

## Lint チェック結果

### サーバーサイド（ESLint 8 / node環境）

```
✔ エラー・警告なし（server/*.js 全ファイル）
```

### クライアントサイド（app.js / browser環境）

| 行 | 種別 | 内容 |
|----|------|------|
| 596, 599, 600 | warning | `marked` / `hljs` が未定義 — CDN グローバル変数のため実害なし |
| 691, 712 | warning | 同上 |
| 669 | warning | `name` が未使用（destructuring の残り） |
| 768 | warning | `threshold` が代入されているが未使用 |

CDN グローバル変数の警告は `/* global marked, hljs */` コメントで抑制可能。
未使用変数 2 件は修正が望ましい。

---

## セキュリティ

### [C-1] 静的ファイル配信のパス検証（index.js:34）

**リスク: 中〜高**

`startsWith` によるパス比較が `path.normalize` 前の生文字列で行われており、Windows のケース非区別ファイルシステム上で不整合が生じる可能性がある。

```js
// 現状
if (!filePath.startsWith(PUBLIC)) { ... }

// 推奨
const realPublic = fs.realpathSync(PUBLIC);
const realFile   = path.resolve(PUBLIC, url.pathname.slice(1));
if (!realFile.startsWith(realPublic + path.sep)) { res.writeHead(403); return; }
```

---

### [C-2] readBody にサイズ制限がない（processManager.js:255, npmChecker.js, projectInfo.js）

**リスク: 中**

ローカルツールとはいえ HTTP サーバーとして起動しており、巨大なリクエストボディを送られるとメモリが枯渇する。

```js
// 推奨: 全 readBody 関数に追加
const MAX_BODY = 1 * 1024 * 1024; // 1MB
req.on('data', chunk => {
  body += chunk;
  if (Buffer.byteLength(body) > MAX_BODY) { req.destroy(); }
});
```

---

### [C-3] PTY モードでのコマンドインジェクション（processManager.js:39）

**リスク: 低〜中（ローカル専用の設計上の制約）**

PTY では `cmd + args` を文字列結合してシェルに渡すため、`; rm -rf /` のようなメタキャラクタが通過する。ローカル専用ツールなので設計上は許容だが、ドキュメントに明記を推奨。

---

### [C-4] JSON.parse の try/catch 漏れ → サーバークラッシュ（processManager.js）

**リスク: 高**

`/api/process/input`、`/api/process/stop`、`/api/process/remove` で `JSON.parse(body)` に try/catch がなく、不正 JSON でサーバーがクラッシュする。

```js
// 影響エンドポイント（各 readBody コールバック内）
const { id, text } = JSON.parse(body); // ← try/catch なし
```

`/api/process/start` と同様に try/catch を追加すること。

---

### [C-5] JSON.parse の try/catch 漏れ（projectInfo.js:83, 95）

**リスク: 高**

`/api/project/pin`、`/api/project/unpin` も同様。不正 JSON でサーバークラッシュ。

---

### [C-6] npmChecker / pubspecChecker のパス検証欠如

**リスク: 中**

`projectPath` パラメータの検証がなく、`../../../../etc/passwd` のような任意パスの `package.json` や `pubspec.yaml` を読み取れる可能性がある。`folderBrowser.js` や `markdownHandler.js` では防止されているのに不一致。

```js
// 推奨: プロジェクト履歴内のパスのみ許可するか、最低限以下を追加
const normalized = path.resolve(projectPath);
if (normalized.includes('..')) { res.writeHead(400); return; }
```

---

### [C-7] git hash パラメータの未検証（gitStatus.js）

**リスク: 中**

`/api/git/commit?hash=` で hash をバリデーションせずに `git show` に渡している。`execFile` 使用のためシェルインジェクションは防がれるが、`--upload-pack=...` のような argument injection が可能。

```js
// 推奨: hash を検証してから使用
if (!hash || !/^[0-9a-f]{4,64}$/i.test(hash)) {
  res.writeHead(400);
  return res.end(JSON.stringify({ error: 'Invalid hash' }));
}
```

---

## バグ・品質

### [I-1] envManager.js のパス比較不整合（envManager.js:107）

`path.join`（相対パス）と `path.resolve`（絶対パス）を混在させて `startsWith` 比較しており、`projectPath` が相対パスの場合に検証をすり抜ける可能性がある。両方 `path.resolve` で統一すること。

---

### [I-2] processes Map が無制限に増加（processManager.js）

終了したプロセスはユーザーが明示的に `remove` しない限り Map に残り続け、長期稼働でメモリが増加する。一定時間（例: 1時間）後に自動削除するか、最大件数（例: 200件）を設けることを検討。

---

### [I-3] folderBrowser.js の `..` チェック

`path.normalize` 後に `includes('..')` を確認しているが、Windows ショートパス（`~1` 記法）などのエッジケースに未対応。正規化後のパスをルートパスと `startsWith` で比較する方がより確実。

---

### [I-4] スコープ付きパッケージのエンコード（npmChecker.js:12, 163）

```js
pkgName.replace(/^@/, '%40').replace(/\//, '%2F');
//                                    ↑ g フラグなし（実害は少ないが意図不明確）
```

`encodeURIComponent` を使うか、コメントで意図を明記すること。

---

### [I-5] app.js: fetch エラーの未ハンドル

`loadProjectInfo`、`loadMdList`、`loadEnvList`、`browse` など主要関数で `fetch` の reject（サーバーダウン時等）が未 catch のため、コンソールに `UnhandledPromiseRejection` が出るだけで UI に何も表示されない。

---

## 優先度まとめ

| 優先度 | ID | ファイル | 内容 |
|--------|----|-----------|----|
| 🔴 最優先 | C-4 | processManager.js | JSON.parse try/catch 漏れ → クラッシュ |
| 🔴 最優先 | C-5 | projectInfo.js | 同上 |
| 🔴 最優先 | C-7 | gitStatus.js | hash 未検証 → argument injection |
| 🟠 推奨 | C-2 | 全 readBody | ボディサイズ無制限 |
| 🟠 推奨 | C-6 | npmChecker / pubspecChecker | パス検証欠如 |
| 🟠 推奨 | C-1 | index.js | 静的ファイルのパス比較改善 |
| 🟡 軽微 | I-1 | envManager.js | resolve/join 不整合 |
| 🟡 軽微 | I-2 | processManager.js | Map 無制限増加 |
| 🟡 軽微 | I-4 | npmChecker.js | replace の g フラグ欠落 |
| 🟡 軽微 | I-5 | app.js | fetch エラー未ハンドル |
