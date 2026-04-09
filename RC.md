# FlutterBoard — 課題・要望リスト

Flutter / Firebase / Node 開発でよく遭遇する「困った・面倒」と、それを解消する機能の実装候補。

---

## よくある困った・面倒

### Flutter

| # | 課題 | 状況 |
|---|------|------|
| F1 | `flutter pub get` / `pub upgrade` が遅い・失敗してもログが流れて消える | 対応済（プロセスタブで常時確認可） |
| F2 | 謎のビルドエラーで `flutter clean` → `pub get` の儀式が必要 | — |
| F3 | `pubspec.yaml` のバージョン競合がどのパッケージか特定しづらい | 対応済（依存チェックタブで MAJOR/minor バッジ表示） |
| F4 | `flutter pub upgrade` で破壊的変更が混入してもすぐ気づけない | 対応済（MAJOR 更新を別バッジで警告） |
| F5 | `flutter run` 中の Hot Reload / Hot Restart をターミナルなしで行えない | 対応済（PTY モードで `r`/`R` 等を送信可） |
| F6 | ビルドフレーバー（dev/staging/prod）の切り替えを毎回オプションで指定するのが面倒 | 対応済（R9 コンテキストビルダーでフレーバー選択） |
| F7 | `flutter analyze` の結果をまとめて確認できる場所がない | → **[R7]** |
| F8 | iOS の Pod 周りエラーで `pod install` のやり直しが必要になる | 対応済（R3 シーケンスに組み込み可） |

### Firebase

| # | 課題 | 状況 |
|---|------|------|
| F9 | flutter run 中の DevTools に素早くアクセスしたい | 対応済（VM Service URL 自動検出 → DevTools 起動ボタン） |
| B1 | Emulator 起動コマンドが長い・オプションが多い | 対応済（コマンドランナーでピン留め可） |
| B2 | Emulator UI（:4000）への導線が分散している | 対応済（環境変数タブにリンク） |
| B3 | `firebase use` によるプロジェクト切り替え忘れで本番に影響が出る | → **[R4]** |
| B4 | 複数環境（dev / staging / prod）の `.env` 切り替えが手作業 | → **[R4]** |
| B5 | Emulator のログが長くなると見づらい | → **[R1]** |
| B6 | Cloud Functions のデプロイログが流れて結果だけ確認できない | 対応済（プロセスタブでバッファ保持） |
| B7 | Firestore rules / Functions のエラーが Emulator ログに埋もれる | → **[R1]** |

### npm / Node

| # | 課題 | 状況 |
|---|------|------|
| N1 | `package.json` の scripts 名を毎回確認しに行く | 対応済（コマンドランナーで自動読み込み＋ピン留め） |
| N2 | CDN ライブラリのバージョンが古いまま放置される | 対応済（CDN 更新チェック） |
| N3 | `npm audit` の脆弱性情報を別途確認しに行く必要がある | → **[R6]** |
| N4 | `node_modules` が肥大化していても気づかない | — |
| N5 | `package-lock.json` のコンフリクト解消が面倒 | — |

### 共通 / 開発フロー

| # | 課題 | 状況 |
|---|------|------|
| C1 | 複数プロセスを並行して走らせると管理が困難 | 対応済（マルチプロセスタブ管理） |
| C2 | ログをあとから見返せない・検索できない | → **[R1]** |
| C3 | Git の変更状況を確認するためにターミナルへ移動する必要がある | 対応済（Git ステータスタブ） |
| C4 | Git のコミット・プッシュも GUI でやりたい | → **[R2]** |
| C5 | `.env` の中身を確認するためにエディタを開く必要がある | 対応済（環境変数タブでマスク表示） |
| C6 | 複数プロジェクトで同じコマンドシーケンスを毎回打ち直す | 対応済（R3 コマンドシーケンスで保存・再実行） |
| C7 | 複数プロジェクトの依存バージョンを横断して比較できない | → **[R5]** |

---

## 実装・解決したい機能リスト

### [R1] ログ検索・フィルタ
- プロセスログをキーワード（正規表現）で絞り込み
- `ERROR` / `WARNING` / `INFO` レベルフィルタ
- ログのファイルへのエクスポート（`.txt` / `.log`）
- 解決する課題: **B5, B7, C2**

### [R2] Git 基本操作 UI ※低優先
- ステージング・アンステージ
- コミットメッセージ入力 → コミット
- `git push` / `git pull`
- ブランチ一覧・切り替え
- 解決する課題: **C4**

### [R3] コマンドシーケンス（タスクランナー） ✅ 実装済
- 複数コマンドを順番に実行するタスクを定義・保存
- 例: `flutter clean` → `flutter pub get` → `flutter run --flavor dev`
- フレーバー・ターゲットのプリセット登録
- 解決する課題: **F2, F6, F8, C6**

### [R4] Firebase 環境切り替えパネル
- `firebase use` で有効なプロジェクトを表示・切り替え
- `.env` ファイルの環境切り替え（dev / staging / prod）をワンクリックで
- 現在の環境を常に画面上部に表示して誤操作を防止
- 解決する課題: **B3, B4**

### [R5] 複数プロジェクト依存比較 + ブランチ間比較
- 開いたことがあるプロジェクトの `pubspec.yaml` / `package.json` を横断比較
- 同一パッケージのバージョン差分をハイライト
- **ブランチ比較**: 別ブランチの `pubspec.yaml` と現在のバージョンを比較（`git show branch:pubspec.yaml`）
- 解決する課題: **C7**

### [R6] npm audit 表示
- `npm audit --json` の結果を依存チェックタブに統合
- 脆弱性の severity（critical / high / moderate / low）をバッジ表示
- 解決する課題: **N3**

### [R7] Flutter analyze 結果ビューア
- `flutter analyze` をバックグラウンド実行し、エラー・警告を一覧表示
- ファイル名・行番号へのリンク（VSCode `vscode://` URL）
- 解決する課題: **F7**

---

### [R8] ログ画面グループ化（スクリーンセクション折り畳み）
- `flutter run` のログをナビゲーション単位で折り畳みセクションに分割
- カスタムマーカー `debugPrint('[FB:SCREEN] ScreenName')` を検出してセクション区切り
- 過去のスクリーンは折り畳み済み、現在のスクリーンはライブ展開
- マーカー文字列はダッシュボード側で設定変更可能

---

### [R9] コンテキスト対応コマンドパネル（動的コマンドビルダー） ✅ 実装済

静的なボタンでは対応できない「その場で情報を取得して組み立てる」定例フローをUI化する。  
実行前に選択肢を提示 → ワンクリックでコマンド入力欄にセット（または即実行）する形。

#### Flutter

| パターン | 取得元 | 組み立てるコマンド例 |
|----------|--------|----------------------|
| デバイス選択 → run | `flutter devices --machine` | `flutter run -d emulator-5554` |
| デバイス選択 → attach | `flutter devices --machine` | `flutter attach -d RQ8A...` |
| フレーバー選択 → run | `pubspec.yaml` の `flavors:` | `flutter run --flavor staging -d <device>` |
| エントリポイント選択 → run | `lib/main*.dart` をスキャン | `flutter run -t lib/main_dev.dart` |
| フレーバー × デバイス → build | 上記2つの組み合わせ | `flutter build apk --flavor prod` |
| テストファイル選択 → test | `test/` 以下を一覧 | `flutter test test/login_test.dart` |
| Dart スクリプト実行 | `tool/*.dart` をスキャン | `dart run tool/generate.dart` |

#### Firebase

| パターン | 取得元 | 組み立てるコマンド例 |
|----------|--------|----------------------|
| プロジェクト切り替え | `.firebaserc` の aliases | `firebase use staging` |
| Emulator の種別選択 | `firebase.json` の emulators | `firebase emulators:start --only auth,firestore` |
| Hosting ターゲット選択 | `firebase.json` の hosting targets | `firebase deploy --only hosting:app` |
| Functions ログ閲覧 | `firebase.json` の functions | `firebase functions:log --only onUserCreate` |
| Functions 個別デプロイ | `firebase.json` の functions | `firebase deploy --only functions:onUserCreate` |

#### Git

| パターン | 取得元 | 組み立てるコマンド例 |
|----------|--------|----------------------|
| ブランチ選択 → checkout | `git branch -a` | `git checkout feature/login` |
| スタッシュ選択 → pop | `git stash list` | `git stash pop stash@{1}` |
| タグ選択 → checkout | `git tag` | `git checkout v1.2.3` |
| リモートブランチ → pull | `git branch -r` | `git pull origin feature/login` |

#### 設計方針

- **取得 → 選択 → 実行** の3ステップUI。選択はドロップダウンまたはクリックリスト
- コマンドは常に入力欄にセットして確認・編集してから実行（直接実行はしない）
- 接続デバイスのように変化する情報は「更新」ボタンで再取得
- 情報が取れない場合（Flutter SDK なし等）はフォールバックで手入力
- Flutter タブ・Firebase タブ・Git タブにそれぞれ対応セクションを追加する形で実装

---

## 優先度の考え方

```
高優先（毎日使う・ミス防止）
  R3 コマンドシーケンス        — clean → get の儀式を自動化  ✅ 実装済
  R9 コンテキスト対応コマンド  — デバイス/フレーバー/ブランチを取得してコマンド組み立て  ✅ 実装済
  R4 Firebase 環境切り替え     — 本番誤操作のリスク軽減

中優先（あると便利）
  R6 npm audit            — セキュリティ確認の省力化
  R8 ログ画面グループ化   — デバッグ効率向上
  R5 プロジェクト・ブランチ間依存比較

低優先
  R1 ログ正規表現フィルタ + レベルフィルタ（キーワードは実装済）
  R7 Flutter analyze ビューア
  R2 Git 基本操作 UI
```
