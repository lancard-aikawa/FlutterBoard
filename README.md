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

各タブの詳細な使い方は **[ユーザーマニュアル](docs/MANUAL.md)** を参照してください。

| タブ | 概要 |
|---|---|
| コマンド | Flutter / Firebase / npm コマンドのワンクリック実行、シーケンス管理 |
| プロセス / ログ | 起動中プロセスのリアルタイムログ監視、PTY / Hot Reload 対応 |
| ドキュメント | プロジェクト内 Markdown の閲覧（Mermaid 対応） |
| 依存チェック | pubspec / npm / CDN バージョン確認、セキュリティ診断、依存ツリー |
| 環境変数 | `.env` ファイルのマスク表示・ファイル間 diff |
| Git | ブランチ・変更・コミット履歴の確認と基本操作 |
| ポート | 指定ポートの使用状況監視・競合プロセス kill |

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
