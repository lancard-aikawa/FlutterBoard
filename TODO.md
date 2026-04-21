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

## マルチエントリ分離（feature/separate-plan）

app.js 肥大化への対処として、フロントエンドを複数 HTML エントリに分離中。
テストリリース支援（D 系）は `/release.html` に独立して実装する方針。

### Phase 1 — 骨組み ✅

- `public/shared/base.css` — CSS 変数 + ヘッダ + ボタン + エントリ間ナビの共通スタイル
- `public/shared/project.js` — localStorage 経由のプロジェクトパス取得ヘルパ
- `public/release.html` — テストリリース専用ページ（現状は「準備中」表示）
- `public/release.css` — release.html 固有スタイル
- `public/app-release.js` — release ページのエントリスクリプト
- `public/index.html` ヘッダに「🛠 開発 / 🚀 リリース」リンク追加
- 既存 `app.js` / `style.css` / `server/*` には一切触れず、影響範囲最小

### Phase 2A — D1 Pre-flight チェックリスト ✅

- `server/preflight.js` 新規（7 チェック項目、全て静的ファイル解析のみ）
- `/api/preflight/check?path=...` を追加
- `public/release.html` を Pre-flight パネルに差し替え
- 検出項目:
  - pubspec.yaml / Android build.gradle / iOS Info.plist の version 表示
  - 3ファイル間のバージョン整合性
  - Android release 署名設定（debug 鍵誤用の検出）
  - applicationId（`com.example.*` 既定残存の警告）
  - lib/ 配下の `print` / `debugPrint` 残存カウント

### Phase 2D — D-CL テストリリース手順チェックリスト ✅

- `server/checklist.js` 新規（プロジェクト別 MD 永続化、`config/` 配下なので git 衝突なし）
- `/api/checklist` GET/POST を追加
- release.html トップにチェックリストパネルを配置
- MD レンダラー手書き（`- [ ]` / `- [x]` / `##` / `###` / `-` 対応、外部依存なし）
- セッション内チェックトグル、✏️ 編集 → 保存でカスタマイズ可能
- 初回はデフォルトテンプレート（D1/D3/D4 の手順込み）を自動表示

### Phase 2C — D4 配布 URL / テスター管理 ✅

- `server/distributor.js` 新規（リリース・テスター CRUD、プロジェクト別 JSON 永続化）
- `/api/distributor/releases` と `/api/distributor/testers` エンドポイント追加
- リリース名・配布 URL・メモの登録/削除、案内文クリップボードコピー
- テスター氏名・メール・端末・メモの登録/削除

### Phase 2B — D3 リリースノート自動生成 ✅

- `server/releaseNotes.js` 新規（git log ベース、外部依存なし）
- `/api/releasenotes/tags` / `/api/releasenotes/generate` を追加
- Conventional Commits（feat/fix/perf/etc.）とプロジェクト独自 prefix（`T3:` / `R4:` / `D1:` 等）を分類
- 「✨ 新機能 / 改善」「🐛 修正」「🔧 その他」の 3 セクションで Markdown 生成
- 基準タグは最新タグ自動選択、セレクタで手動切替可
- クリップボードコピー・対象コミット一覧の折り畳み表示

### Phase 2 残候補 — release ページ中身の拡張

RC/RC.md の D 系候補を以下の順で実装予定。

| 優先 | ID | 概要 | 外部依存 |
|---|---|---|---|
| ✅ | D1 | Pre-flight チェックリスト | なし |
| ✅ | D3 | リリースノート自動生成 | なし（git log ベース） |
| ✅ | D4 | 配布 URL / テスター管理ダッシュボード | なし（ローカル JSON 保存） |
| 低 | D2 | Play Developer API で Internal Testing アップロード | Google Play Developer API 認証 |
| 低 | D5 | テストトラック状態ビュー | Play Developer API |
| 低 | D6 | 配布後 24h クラッシュ監視 | Firebase API |

---

## 既存候補（未着手）

RC/RC.md の優先度に従い、以下の順で検討。

| 優先 | ID | 概要 |
|---|---|---|
| ✅ | T1 | build_runner 管理 UI |
| ✅ | T2 | pubspec.lock 変更サマリー |
| ✅ | T3 | テストランナー UI |
| 中 | T4 | 証明書・キーストア有効期限チェック |
| ✅ | T5 | コマンド実行履歴 |
| 中 | FC1 | Firebase Remote Config 値確認 |
| 中 | FC2 | App Distribution ワンクリック配布 |
| ✅ | T7 | ログファイルビューア |
| 低 | T6 | node_modules / pub cache サイズ分析 |
| 低 | FC3 | Crashlytics 直近クラッシュ表示 |
| 低 | W1 | npm workspaces 対応コマンドビルダー |
| 低 | W2 | Firestore Rules 編集 → 検証 → デプロイサイクル |
