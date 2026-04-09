# FlutterBoard — コードレビュー & リファクタリング記録

S6 / S7 / S8 実装（2026-04-09）後のレビュー結果と対応状況。

---

## 対応済み（修正コミット済み）

### [B1] `buildSize.js` — `hashPath` の重複定義

**問題**  
`projectInfo.js` の実装と同じ関数をローカルで重複定義していた。  
CLAUDE.md に「`projectInfo.js` の `hashPath()` を使う」と明記されているにもかかわらず、エクスポートされていなかったため共有できていなかった。

**修正**  
- `projectInfo.js` に `hashPath` をエクスポート追加
- `buildSize.js` の重複定義を削除し `require('./projectInfo')` で取得

---

### [B2] `buildSize.js` — `/history` エンドポイントの path 未検証

**問題**  
`GET /api/buildsize/history?path=...` で `fs.existsSync(p)` のチェックがなく、存在しないパスや任意のパスを渡せた。`scan` も同様のリスクがあったが、こちらは元々チェック済みだった。

**修正**  
`history` エンドポイントに `!fs.existsSync(p)` チェックを追加。

---

### [B3] `buildSize.js` — `delete` エンドポイントで負の `index` が末尾削除を引き起こす

**問題**  
`index: -1` を POST すると `history.splice(-1, 1)` で末尾エントリが削除されてしまう（Array.splice の仕様）。

**修正**  
```js
if (typeof index !== 'number' || index < 0 || index >= history.length) { → 400 }
```

---

### [B4] `emuSnapshot.js` — `isSafeName` が `..` を明示ブロックしていなかった

**問題**  
`isSafeName` は禁止文字セットでパストラバーサルを防いでいたが、`..` 自体はドット文字のみからなるため抜けていた。`path.join` + `startsWith` の二重チェックで実害は防げていたが、防御の深さが不十分。

**修正**  
```js
name !== '.' && name !== '..' を isSafeName に追加
```

---

### [B5] `app.js` — スナップショット名バリデーションに制御文字チェックが欠けていた

**問題**  
フロントエンドの正規表現が `/[/\\<>:"|?*]/` のみで、`\x00-\x1f`（制御文字）を見逃していた。サーバーの `isSafeName` とチェック内容が不一致。

**修正**  
```js
/[/\\<>:"|?*\x00-\x1f]/.test(name) || name === '.' || name === '..'
```

---

## 軽微な指摘（対応見送り）

### [I1] `fvmInfo.js` — グローバルFlutterが古い場合に `--machine` 非対応の可能性

`flutter --version --machine` が JSON 以外を返した場合のフォールバック正規表現は機能するが、ANSI エスケープが混入すると失敗する可能性がある。実害が出てから対処で十分と判断。

**将来対応候補**  
`flutter --version`（`--machine` なし）を使い、正規表現のみで取得する方がシンプル。

---

### [I2] `buildSize.js` — `record` エンドポイントの `artifacts` 内容検証なし

POST body の `artifacts` 配列の各要素（`type`, `size`, `name`, `path`）が信頼できる形式かを検証していない。ローカル専用ツールでありブラウザからのみアクセスするため、現時点では許容範囲。

---

## アーキテクチャメモ

### `hashPath` の共有

CLAUDE.md に「`projectInfo.js` の `hashPath()` を使う」と明記されているが、同関数がエクスポートされていなかった。今回のレビューで `module.exports` に追加したため、今後の新機能では `require('./projectInfo').hashPath` で再利用できる。

### path 検証の標準パターン

既存ハンドラは以下のパターンを使っている。新機能追加時は同様に適用すること:

```js
const p = url.searchParams.get('path');
if (!p || !fs.existsSync(p)) {
  res.writeHead(400);
  return res.end(JSON.stringify({ error: 'path required' }));
}
```

POST ボディから `path` を取る場合も `fs.existsSync` チェックを行う（設定ファイルを扱うエンドポイントでは省略可）。

### `delete` 系 API の index バリデーション

配列 index を受け取る POST エンドポイントでは必ず以下を確認する:

```js
if (typeof index !== 'number' || index < 0 || index >= array.length) { → 400 }
```

`splice(-1, 1)` は末尾を消すため、負数チェックは必須。
