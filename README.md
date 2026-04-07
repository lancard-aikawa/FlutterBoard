# FlutterBoard

Flutter + Firebase プロジェクト向けのローカル Web ダッシュボード。

Node.js 組み込みモジュールのみで動作し、**npm パッケージ依存ゼロ**。

---

## 必要環境

- Node.js 18 以上
- Git（Git ステータス機能を使う場合）
- Flutter SDK（Flutter コマンドを実行する場合）

---

## 起動 / 停止

```cmd
# 起動（ブラウザが自動で開きます）
start.cmd

# 停止
stop.cmd

# または npm から直接起動
npm start
```

ブラウザで `http://localhost:3210` を開きます。

---

## 機能

### フォルダ選択
- サーバーサイドフォルダブラウザでプロジェクトを選択
- パスを直接入力してフォルダを指定
- 最近使ったプロジェクトの履歴（最大10件）

### プロセス / ログ
- コマンドをブラウザから実行
- SSE（Server-Sent Events）でログをリアルタイム表示
- 複数プロセスをタブ切り替えで管理
- 実行中は ■ 停止、終了後は ✕ 削除

### コマンドランナー
- Flutter コマンド（pub get / analyze / doctor / build / test 等）
- Firebase コマンド（emulators:start / deploy 等）
- npm scripts を `package.json` から自動読み込み、☆ でピン留め

### ドキュメント
- `README.md` をデフォルト表示
- `docs/` 以下の Markdown ファイルをサイドバーに一覧表示
- コードブロックのシンタックスハイライト
- Markdown 内リンクでファイル間を移動

### 依存チェック
- `pubspec.yaml` を読み込み pub.dev API で最新バージョンを確認
- MAJOR / minor / 最新 をバッジで表示
- `flutter pub get` / `flutter pub upgrade` をワンクリック実行

### 環境変数
- `.env` / `.env.development` / `.env.staging` / `.env.production` 等を一覧表示
- パスワード・APIキー等の機密値をデフォルトでマスク
- Firebase Emulator UI（`:4000`）へのリンク

### Git ステータス
- 現在のブランチ名
- 変更ファイル一覧（staged / unstaged / untracked）
- 最新コミット履歴（15件）
- スタッシュ一覧

---

## セキュリティ方針

- **npm パッケージ依存ゼロ** — サプライチェーン攻撃のリスクを排除
- Node.js 組み込みモジュール（`http`, `fs`, `child_process`, `https` 等）のみ使用
- Markdown レンダリングは CDN 経由（marked.js / highlight.js）
- サーバーは `127.0.0.1`（ローカルのみ）にバインド
- パストラバーサル防止チェックを各 API に実装

---

## 既知の課題

### プロセスへのキー入力（stdin）

`flutter run` 実行中の `r`（Hot Reload）・`R`（Hot Restart）等のインタラクティブ操作はブラウザから送れない。

- Flutter は TTY（疑似ターミナル）を必要とするため、通常の `stdin.write` では反応しない場合がある
- 解決策として `node-pty` ライブラリが有効だが、npm 依存ゼロ方針と相反するため要検討

---

## ファイル構成

```
FlutterBoard/
  server/
    index.js          # HTTP サーバー
    api.js            # API ルーター
    folderBrowser.js  # フォルダブラウザ API
    history.js        # プロジェクト履歴
    processManager.js # プロセス管理 + SSE
    projectInfo.js    # package.json 解析・ピン留め
    markdownHandler.js# Markdown 読み込み
    pubspecChecker.js # pubspec.yaml + pub.dev API
    envManager.js     # .env ファイル管理
    gitStatus.js      # Git コマンド実行
  public/
    index.html
    app.js
    style.css
  config/             # 実行時に自動生成（.gitignore 済み）
    history.json
    pins_*.json
  start.cmd           # 起動スクリプト
  stop.cmd            # 停止スクリプト
  TODO.md             # 実装計画
  README.md
```

---

## ライセンス

MIT
