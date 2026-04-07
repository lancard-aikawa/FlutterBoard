# FlutterBoard - TODO

Flutter + Firebase プロジェクト向け Web ダッシュボード。
Node.js バックエンド + SSE でプロセス管理・ログ表示・コマンド実行を行う。
フロントエンドは Vanilla JS + ブラウザのみ。Electron/Tauri は使用しない。
**npm パッケージ依存ゼロ** — Node.js 組み込みモジュールのみで実装（サプライチェーンリスク排除）。

---

## フェーズ 1: プロジェクト初期化

- [x] `npm init` でプロジェクト作成
- [ ] 依存パッケージは使用しない — Node.js 組み込みで代替
  - `http` — Web サーバー (express の代替)
  - `fs.watch` — ファイル監視 (chokidar の代替)
  - `child_process` — プロセス管理
  - `path`, `fs`, `os` — ファイル操作
  - SSE (Server-Sent Events) — リアルタイム通信 (WebSocket の代替)
  - marked.js — CDN 経由でブラウザ側のみ (npm インストール不要)
  - `.env` パース — 手書き実装 (dotenv の代替)
  - `process.argv` パース — 手書き実装 (commander の代替)
- [ ] ディレクトリ構成を決める

```
FlutterBoard/
  server/
    index.js          # Express + WebSocket サーバー
    processManager.js # プロセス起動・停止・ログ管理
    projectScanner.js # 対象Flutterプロジェクトのスキャン
    folderBrowser.js  # サーバーサイドフォルダブラウザ API
    commands.js       # Flutter / npm コマンド定義
  public/
    index.html        # メイン画面
    app.js            # フロントエンド JS
    style.css
  config/
    default.json      # デフォルト設定
    history.json      # プロジェクト履歴(自動生成)
  package.json
  TODO.md
```

---

## フェーズ 1.5: プロジェクトフォルダ選択

ブラウザからOSのファイルシステムパスが取得できないため、サーバーサイドでフォルダをブラウズするAPIを実装する。

- [ ] `GET /api/browse?path=C:/` — ディレクトリ一覧を返すAPI
  - フォルダのみ表示(ファイルは除外)
  - ドライブルート一覧(Windows対応)
- [ ] フロントエンド: フォルダブラウザUI
  ```
  ┌──────────────────────────────────────────┐
  │ [フォルダを開く]  C:/Repos/my_app   [開く] │
  │  📁 Repos > 📁 mywork > 📁 my_app         │
  │  ├ 📁 lib         ├ 📁 test               │
  │  └ 📁 android     └ 📁 ios                │
  ├──────────────────────────────────────────┤
  │ 最近使ったプロジェクト                      │
  │  ・my_app    2026/04/07                   │
  │  ・shop_app  2026/04/06                   │
  └──────────────────────────────────────────┘
  ```
  - クリックで階層を降りる/上がる
  - パスを直接入力・貼り付けも可能
- [ ] `config/history.json` にプロジェクト履歴を保存
  - 最大10件、最終オープン日時を記録
  - 履歴一覧からワンクリックで再オープン
- [ ] 選択したフォルダを「現在のプロジェクト」としてサーバー側に保持

---

## フェーズ 2: コア機能 — プロセス管理 + リアルタイムログ ★最優先

- [ ] `processManager.js` の実装
  - `child_process.spawn` でコマンド実行
  - stdout / stderr を WebSocket でブラウザにストリーミング
  - プロセスの起動・停止・再起動
  - 複数プロセスの並列管理(IDで識別)
- [ ] WebSocket サーバーの実装
  - クライアントへのログ送信
  - クライアントからのコマンド受信(start/stop)
- [ ] フロントエンド: ログ表示エリア
  - タブ切り替えでプロセスごとのログを表示
  - エラー行をハイライト(stderr は赤表示)
  - ログのクリア・スクロール追従

---

## フェーズ 3: コマンドランナー

- [ ] npm scripts ランナー
  - 対象プロジェクトの `package.json` を読み込み scripts を一覧表示
  - ボタンクリックで実行
  - よく使うコマンドをピン留め
- [ ] Flutter コマンドボタン
  - `flutter pub get`
  - `flutter analyze`
  - `flutter doctor`
  - `flutter build apk`
  - `flutter build web`
- [ ] Firebase コマンドボタン
  - `package.json` から Firebase 起動コマンドを自動検出
  - Firebase Emulator 起動/停止
  - `firebase deploy --only hosting` 等

---

## フェーズ 4: Markdown ビューア

- [ ] プロジェクトフォルダの `README.md` をデフォルト表示
- [ ] `docs/` 以下の `.md` ファイルをサイドバー一覧表示
- [ ] Markdown 内リンクのナビゲーション対応
- [ ] コードブロックのシンタックスハイライト

---

## フェーズ 5: pubspec.yaml 依存チェック

- [ ] `pubspec.yaml` の読み込みとパース
- [ ] pub.dev API でパッケージの最新バージョンを取得
- [ ] バージョン比較結果をテーブル表示
  ```
  firebase_core  2.0.0 → 3.1.0  [MAJOR - 破壊的変更あり]
  cloud_firestore 4.8.0 → 4.9.2  [minor]
  ```
  - 最新 / minor 更新あり / **MAJOR 更新あり(破壊的変更)**
  - Firebase パッケージ群のバージョン整合性チェック
- [ ] `flutter pub get` / `flutter pub upgrade` をワンクリック実行

---

## フェーズ 6: 環境変数マネージャー

- [ ] `.env.development` / `.env.staging` / `.env.production` の読み込み
- [ ] 現在有効な環境の表示・切り替え
- [ ] 値のマスク表示(パスワード・APIキー等)
- [ ] Firebase Emulator UI (port 4000) へのリンク

---

## フェーズ 7: Git ステータス表示

- [ ] 現在のブランチ名表示
- [ ] 変更ファイル一覧(`git status`)
- [ ] 最新コミット数件の表示(`git log`)

---

## 起動方法(目標)

```bash
# 対象 Flutter プロジェクトを指定して起動
npx flutterboard --project /path/to/flutter/project

# または対象フォルダで実行
cd /path/to/flutter/project
npx flutterboard
```

ブラウザで `http://localhost:3210` を開くとダッシュボードが表示される。

---

## 技術スタック

| 用途 | ライブラリ |
|------|-----------|
| Web サーバー | Node.js 組み込み `http` |
| リアルタイム通信 | SSE (Server-Sent Events) — 組み込み `http` |
| プロセス管理 | 組み込み `child_process` |
| ファイル監視 | 組み込み `fs.watch` |
| Markdown | marked.js (CDN、npmインストールなし) |
| フロントエンド | Vanilla JS (シンプルに保つ) |
| フォルダ選択 | サーバーサイドブラウザ API (Electron不要) |
| 履歴管理 | config/history.json |
| npm依存 | **ゼロ** |

---

## フェーズ 8: AI 支援機能(将来)

- [ ] Claude API を使った多言語(l10n)ARBファイル自動生成
  - 英語 ARB → 日本語・中国語・韓国語等を自動翻訳
  - `flutter gen-l10n` と連携
- [ ] `flutter analyze` 結果の AI 解説・修正提案
- [ ] pubspec MAJOR 更新時の移行ガイド生成

---

## 既知の課題

### プロセスへの stdin 入力（インタラクティブ操作）

`flutter run` 実行中の `r`（Hot Reload）・`R`（Hot Restart）・`q`（終了）のようなキー入力をブラウザから送りたい。

- **問題:** `flutter run` は TTY（疑似ターミナル）を期待しており、通常の `child_process.spawn` では `stdin.write('r\n')` を送っても反応しない場合がある
- **解決策1:** `proc.stdin.write()` でまず試す（追加パッケージ不要）
- **解決策2:** `node-pty`（疑似ターミナルライブラリ）を使う — npm依存ゼロ方針と相反するため要検討
- **UI案:** Flutter の主要キーをボタン化 + 任意テキスト入力欄

---

## 実装優先順位

1. フェーズ 1 — プロジェクト初期化
2. フェーズ 1.5 — プロジェクトフォルダ選択・履歴
3. フェーズ 2 — プロセス管理 + リアルタイムログ ← **コアの価値**
4. フェーズ 3 — コマンドランナー
5. フェーズ 4 — Markdown ビューア
6. フェーズ 5 — pubspec 依存チェック
7. フェーズ 6 — 環境変数マネージャー
8. フェーズ 7 — Git ステータス
9. フェーズ 8 — AI 支援機能(将来)
