# FlutterBoard

Flutter + Firebase プロジェクト向けのローカル Web ダッシュボード。

Node.js 組み込みモジュールのみで動作し、**npm パッケージ依存を最小化**（オプション: `node-pty`）。

---

## 必要環境

| ツール | 用途 |
|---|---|
| Node.js 18 以上 | サーバー本体 |
| Git | Git ステータス / コミット / ブランチ操作 |
| Flutter SDK | Flutter コマンド実行・依存チェック |
| Firebase CLI | Firebase コマンド実行 |
| `node-pty`（任意） | PTY モード（Hot Reload / stdin 送信） |

---

## 起動 / 停止

```
start.cmd      バックグラウンドで起動（ポート 3210）
stop.cmd       PID ファイルを読んで停止
npm run dev    ファイル変更で自動再起動（開発用）
```

ブラウザで `http://localhost:3210` を開きます。

---

## 機能一覧

### プロセス / ログ

- コマンドをブラウザから起動・停止、複数プロセスをタブ切り替えで管理
- SSE（Server-Sent Events）でログをリアルタイム表示
- **PTY モード** — node-pty があれば TTY 対応。`r`（Hot Reload）・`R`（Hot Restart）等のキー入力をブラウザから送信。未インストール時はパイプモードで自動フォールバック
- **Flutter DevTools 連携** — `flutter run` のログから VM Service URL / DevTools URL を自動検出し、ヘッダーバーにボタンを表示
- **全プロセス統合ビュー（S4）** — 実行中の全プロセスのログをタイムスタンプ順に統合表示、横断フィルタ
- **ログ正規表現フィルタ（R1）** — キーワード / 正規表現モード切り替え、ERROR / WARN / INFO レベルバッジフィルタ
- **ロググループ化（R8）** — `debugPrint('[FB:SCREEN] ScreenName')` マーカーでセクション折り畳み

### コマンドランナー

- **Flutter** — pub get / analyze / doctor / build / test 等のワンクリック実行
- **Firebase** — emulators:start / deploy 等
- **npm** — `package.json` の scripts を自動読み込み、☆ でピン留め
- **コマンドシーケンス（R3）** — 複数コマンドを順番に実行するタスクを定義・保存
- **実行ビルダー（R9）** — デバイス / フレーバー / エントリポイント / ブランチ / スタッシュを取得してコマンドを組み立て
- **Flutter analyze ビューア（R7）** — `flutter analyze --machine` をパースし severity フィルタ・VSCode リンク付きで一覧表示
- **エミュレータ スナップショット（S8）** — `emu-snapshots/` ディレクトリでスナップショットを管理。新規作成・読み込み起動・削除をUI化

### ドキュメント

- `README.md` をデフォルト表示
- `docs/` 以下の Markdown ファイルをサイドバーに一覧表示
- コードブロックのシンタックスハイライト（highlight.js）
- Mermaid 記法のダイアグラムをインラインレンダリング（ズーム / パン対応）
- 全画面表示モード / ページズームコントロール

### 依存チェック

- **pubspec.yaml** — pub.dev API で最新バージョンを確認、MAJOR / minor / 最新 をバッジ表示
- **package.json** — npm registry で最新バージョンを確認、Provenance バッジ付き
- **CDN ライブラリ** — HTML 内の cdnjs / jsDelivr / unpkg バージョンを確認
- **npm audit（R6）** — severity 別バッジ表示、折り畳み詳細、audit fix 実行
- **pubspec セキュリティ診断（S1）** — OSV.dev API で Dart パッケージの既知 CVE を照会
- **依存ツリービューア（S2）** — `flutter pub deps` / `npm ls` をツリー描画、逆引きハイライト、競合ノード赤表示
- **プロジェクト・ブランチ間依存比較（R5）** — 別ブランチ / 別プロジェクトと pubspec・npm を横断比較

### 環境変数

- `.env` / `.env.development` / `.env.staging` / `.env.production` 等を一覧表示
- パスワード・APIキー等の機密値をデフォルトでマスク
- **環境変数 diff（S3）** — 2ファイル間のキー差分を横並び比較、片方にしかないキーを警告表示
- Firebase Emulator UI（`:4000`）へのリンク

### Git

- ブランチ表示、変更ファイル一覧（staged / unstaged / untracked）
- diff インライン表示（クリックでファイル別）
- スタッシュ一覧
- コミット履歴（15件、詳細パネル）
- **Git 基本操作（R2）** — ファイル個別 stage/unstage、全 add、コミット、pull / push
- クイックアクション — ブランチ checkout / merge、スタッシュ pop / apply

### Firebase 環境切り替え（R4）

- ヘッダーに現在の Firebase プロジェクト（alias）と `.env` ファイルを常時表示
- ワンクリックで `firebase use` 切り替え、prod 操作時は確認ダイアログ

### ポートモニター（S5）

- よく使うポートの使用中 / 空き状態をリアルタイム表示（3秒自動更新）
- 競合プロセスのワンクリック kill
- 監視ポートの追加 / 除外

### FVM 連携（S6）

- `.fvm/fvm_config.json` からプロジェクトの Flutter SDK バージョンを読み取り
- ヘッダーに `FVM: 3.x.x` バッジを表示
- グローバルの `flutter` とバージョンが異なる場合は警告色で表示

### ビルドサイズトラッカー（S7）

- APK / AAB / IPA / Web ビルドの成果物サイズをスキャン
- ビルドごとにサイズを `config/` に記録
- 前回比・履歴比のサイズ増減（+/- 表示）

---

## セキュリティ方針

- npm パッケージ依存を最小化（サプライチェーン攻撃リスクの低減）
- Node.js 組み込みモジュール（`http`, `fs`, `child_process`, `https` 等）を使用
- サーバーは `127.0.0.1`（ローカルのみ）にバインド
- 各 API にパストラバーサル防止チェックを実装
- コマンドは直接 exec せずターミナル入力欄にセット、ユーザーが確認後に実行

---

## ファイル構成

```
FlutterBoard/
  server/
    index.js            HTTP サーバー（ポート 3210）
    api.js              API ルーター
    processManager.js   プロセス管理 + SSE ログ配信
    projectInfo.js      package.json 解析・ピン留め・hashPath
    folderBrowser.js    フォルダブラウザ
    history.js          プロジェクト履歴
    markdownHandler.js  Markdown 読み込み
    pubspecChecker.js   pubspec.yaml + pub.dev API
    npmChecker.js       package.json + npm registry
    cdnChecker.js       HTML 内 CDN バージョン確認
    devtoolsManager.js  dart devtools 起動・VM Service URL 検出
    envManager.js       .env ファイル管理
    gitStatus.js        Git コマンド実行
    sequenceRunner.js   コマンドシーケンス
    contextProvider.js  デバイス / フレーバー / ブランチ取得
    firebaseEnv.js      Firebase 環境切り替え
    depCompare.js       プロジェクト・ブランチ間依存比較
    flutterAnalyze.js   flutter analyze ビューア
    osvCheck.js         pubspec OSV.dev セキュリティ診断
    depsTree.js         依存ツリービューア
    portMonitor.js      ポートモニター（S5）
    fvmInfo.js          FVM 連携（S6）
    buildSize.js        ビルドサイズトラッカー（S7）
    emuSnapshot.js      エミュレータ スナップショット（S8）
  public/
    index.html
    app.js
    style.css
  config/               実行時に自動生成（.gitignore 済み）
    history.json
    pins_*.json
    seq_*.json
    buildsize_*.json
    ports_watched.json
  start.cmd
  stop.cmd
  README.md
  TODO.md               実装計画
  RC.md                 機能要望の背景・課題・UI イメージ
  review.md             コードレビュー & リファクタリング記録
```

---

## ライセンス

MIT
