# FlutterBoard — 実装計画

---

## G1/G2: GitHub 連携（gh CLI 経由）— ✅ 完了

### 完了済み

| 対象 | 内容 |
|---|---|
| `server/githubClient.js` | gh CLI 抽象レイヤー（`run` / `checkGhAvailable` / `checkIsGithub`） |
| `server/github.js` | `/api/github/status` + 各ハンドラへのルーティング |
| `server/githubPr.js` | PR 一覧取得 / PR 作成 / コミット一覧取得（PR 本文自動挿入用） |
| `server/githubIssues.js` | Issues 一覧取得 / Issue 作成 |
| `server/githubActions.js` | workflow runs 一覧取得 |
| `public/app-git-remote.js` | リモートサブタブ全体（327 行） |
| ローカル / リモート サブタブ切り替え | Git タブ内に 2 サブタブを追加 |
| gh 検出チェック | `ghAvailable` / `isGithub` 判定、未検出時のメッセージ制御 |
| PR セクション | Open PR 一覧・現在ブランチ強調・CI バッジ表示・PR 作成フォーム |
| PR 本文自動挿入 | 直前コミット一覧を `textarea` に挿入（1件ならフルメッセージ） |
| Issues セクション | Open Issues 一覧・Issue 作成フォーム |
| Actions セクション | 直近 workflow runs 一覧・成否アイコン表示 |
| プロジェクト切り替え対応 | `ghCheckAfterProjectLoad()` で状態リセット |

---

### 残課題チェックリスト

- [x] **push 後のリモートタブ自動更新**
  - `gitPushBtn.onclick`（`app.js` 2890 行）に `loadRemoteTab()` 呼び出しを追加して完了

- [x] **コミットメッセージ入力欄での `#` Issue 補完**
  - `git-commit-msg` textarea で `#` を入力すると Open Issues をサジェスト、選択で `#番号` を挿入して完了

---

## 次フェーズ候補（未着手）

RC.md の優先度に従い、以下の順で検討。

| 優先 | ID | 概要 |
|---|---|---|
| 高 | T1 | build_runner 管理 UI |
| 高 | T2 | pubspec.lock 変更サマリー |
| 高 | T3 | テストランナー UI |
| 中 | T4 | 証明書・キーストア有効期限チェック |
| 中 | T5 | コマンド実行履歴 |
| 中 | FC1 | Firebase Remote Config 値確認 |
| 中 | FC2 | App Distribution ワンクリック配布 |
| 低 | T6 | node_modules / pub cache サイズ分析 |
| 低 | FC3 | Crashlytics 直近クラッシュ表示 |
| 低 | W1 | npm workspaces 対応コマンドビルダー |
| 低 | W2 | Firestore Rules 編集 → 検証 → デプロイサイクル |
