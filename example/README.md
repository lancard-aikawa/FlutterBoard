# flutterboard_example

FlutterBoard のデモ用 Flutter + Firebase サンプルプロジェクト。

---

## 概要

このプロジェクトは FlutterBoard の各機能（コマンド実行・依存チェック・環境変数管理・Git 操作など）を
実際のプロジェクトで試すためのサンプルです。

---

## 必要環境

| ツール | バージョン |
|---|---|
| Flutter SDK | 3.x 以上 |
| Dart SDK | 3.0.0 以上 |
| Firebase CLI | 最新 |
| Node.js | 18 以上 |

---

## セットアップ

```bash
# Flutter パッケージ取得
flutter pub get

# Firebase Functions の依存インストール
cd functions && npm install

# Firebase エミュレータ起動
firebase emulators:start
```

---

## 起動

```bash
# デバッグ実行
flutter run

# Web 向け
flutter run -d chrome

# リリースビルド（Android）
flutter build apk --release
```

---

## 環境変数

`.env` ファイルをプロジェクトルートに作成して使用します。

```
FIREBASE_PROJECT_ID=your-project-id
API_BASE_URL=https://api.example.com
```

`.env.staging` / `.env.production` で環境別に切り替えられます。

---

## ディレクトリ構成

```
example/
  lib/
    main.dart
  android/
  ios/
  functions/       Firebase Functions
  pubspec.yaml
  firebase.json
```

---

## ライセンス

MIT
