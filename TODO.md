# FlutterBoard — 実装計画

RC.md の機能要望をもとにした実装順序と設計メモ。

---

## フェーズ 1 — R3: コマンドシーケンス（タスクランナー）

**目的:** `flutter clean → pub get → run --flavor dev` のような定型フローをワンクリック実行。

### UI イメージ

```
コマンドタブ > [シーケンス] セクション
┌─────────────────────────────────────────┐
│ + 新しいシーケンス                       │
│                                          │
│ ▶ clean & run (dev)          [▶] [編集] [✕] │
│   flutter clean                          │
│   flutter pub get                        │
│   flutter run --flavor dev               │
│                                          │
│ ▶ deploy staging             [▶] [編集] [✕] │
│   firebase use staging                   │
│   firebase deploy                        │
└─────────────────────────────────────────┘
```

### 設計

- **保存先:** `config/sequences_<projectHash>.json`
- **実行:** ステップを順番に `/api/process/start` で起動し、`exit code 0` を確認してから次へ
- **失敗時:** そのステップで停止 + エラー表示（続行オプションあり）
- **新規ファイル:** `server/sequenceRunner.js`
- **変更ファイル:** `server/api.js`, `public/index.html`, `public/app.js`, `public/style.css`

---

## フェーズ 2 — R4: Firebase 環境切り替えパネル

**目的:** `firebase use` のプロジェクト切り替えと `.env` ファイルの環境切り替えを安全に一元管理。

### UI イメージ

```
ヘッダー右端に常時表示:
[ Firebase: my-app-staging ▼ ]  [ ENV: .env.staging ▼ ]

環境変数タブ or 専用パネルに詳細:
  firebase use で切り替え: [dev] [staging ✓] [prod]
  .env ファイル切り替え:   [.env.dev] [.env.staging ✓] [.env.prod]
  現在のプロジェクト ID:   my-app-staging
```

### 設計

- `firebase use --json` でプロジェクト一覧と現在のエイリアスを取得
- `.env.*` ファイルをスキャンして切り替えボタンを生成
- `prod` への切り替えは確認ダイアログを必須化
- **新規ファイル:** `server/firebaseEnv.js`
- **変更ファイル:** `server/api.js`, `public/index.html`, `public/app.js`, `public/style.css`

---

## フェーズ 3 — R6: npm audit 表示

**目的:** 依存チェックタブの npm ソースに脆弱性情報を追加。

### UI イメージ

```
依存チェック > npm タブ
┌──────────────────────────────────────────────────────┐
│ 脆弱性: [critical: 0] [high: 2] [moderate: 5] [low: 3] │
│ npm audit fix をワンクリック実行                      │
└──────────────────────────────────────────────────────┘
```

### 設計

- `npm audit --json` の結果をパースして severity 別カウントを表示
- 既存の `npmChecker.js` に追記（または `npmAudit.js` として分離）
- **変更ファイル:** `server/npmChecker.js` or 新規, `server/api.js`, `public/app.js`, `public/index.html`, `public/style.css`

---

## フェーズ 4 — R8: ログ画面グループ化

**目的:** `flutter run` のログを画面（ルート）単位の折り畳みセクションで整理。

### UI イメージ

```
ログタブ
▼ [10:32:01] HomeScreen ─────── 12行
   I/flutter: build called
   ...
▶ [10:32:45] DetailScreen ────── 8行（折り畳み済）
▼ [10:33:10] SettingsScreen ──── ライブ
   I/flutter: initState
   ...
```

### 設計

- Flutter アプリ側に1行追加: `debugPrint('[FB:SCREEN] ScreenName')`
- マーカーパターンはプロジェクトごとに設定可能（`config/settings.json`）
- SSE データにセクションメタ情報を付与 or クライアント側で検出
- マーカー未設定でも通常ログとして動作（後方互換）
- **変更ファイル:** `server/processManager.js`, `public/app.js`, `public/index.html`, `public/style.css`

---

## フェーズ 5 — R5: プロジェクト・ブランチ間依存比較

**目的:** 複数プロジェクトまたはブランチ間でパッケージバージョンを横断比較。

### UI イメージ

```
依存チェックタブ > [比較モード]
比較対象: [現在のプロジェクト ▼]  vs  [ブランチ: main ▼] / [別プロジェクト ▼]

パッケージ       現在           比較対象        差分
flutter_riverpod 2.5.1          2.4.0          ↑ newer
go_router        13.2.0         13.2.0          ─
dio              5.7.0          5.4.0          ↑ newer
```

### 設計

- ブランチ比較: `git show <branch>:pubspec.yaml` で取得してパース
- プロジェクト比較: 履歴から別プロジェクトの `pubspec.yaml` を読み込み
- **変更ファイル:** `server/pubspecChecker.js`, `server/gitStatus.js`, `public/app.js`, `public/index.html`

---

## バックログ（優先度低）

### R1: ログ正規表現フィルタ + レベルフィルタ
- キーワードフィルタは実装済み
- 残り: 正規表現モード切り替え、`ERROR`/`WARN`/`INFO` レベルバッジフィルタ

### R7: Flutter analyze ビューア
- `flutter analyze --machine` の JSON 出力をパース
- ファイル名・行番号を `vscode://` URL でリンク

### R2: Git 基本操作 UI
- ステージ・コミット・プッシュ・ブランチ切り替え
- 優先度低のため後回し

---

## 完了済み

- [x] プロセス管理 + リアルタイムログ（SSE）
- [x] PTY モード（Hot Reload / stdin 送信）
- [x] Flutter / Firebase / npm コマンドランナー（ピン留め）
- [x] Markdown ドキュメントビューア（Mermaid / ズーム / 全画面）
- [x] pubspec.yaml 依存チェック（pub.dev）
- [x] npm 依存チェック（registry）
- [x] CDN ライブラリ更新チェック
- [x] 環境変数マネージャー（マスク表示）
- [x] Git ステータス表示
- [x] Flutter DevTools 連携（VM Service URL 自動検出 / dart devtools 起動）
