# FlutterBoard ユーザーマニュアル

Flutter / Firebase プロジェクト向けのローカル Web ダッシュボード。
`http://localhost:3210` をブラウザで開いて使用します。

## ページ構成

| URL | 用途 |
|---|---|
| `/index.html` | 開発ダッシュボード（コマンド・ログ・Git・依存チェック等） |
| `/android.html` | Android 署名設定・applicationId 変更 |
| `/release.html` | Android リリース支援（Pre-flight・リリースノート・スクリーンショット生成） |

ヘッダーのナビゲーションリンクで各ページを切り替えます。

---

## 起動・停止

```
start.cmd      バックグラウンドで起動（ポート 3210）
stop.cmd       PID ファイルを読んで停止
npm run dev    ファイル変更で自動再起動（開発用）
```

---

## 画面構成

![コマンドタブ全体](images/tab_commands.png)

ヘッダーにはプロジェクト選択・Firebase 環境・FVM バージョンが常時表示されます。  
タブ切り替えで各機能を使用します。

---

## コマンド タブ

Flutter / Firebase / npm の定番コマンドをワンクリックで実行します。

![コマンドタブ](images/tab_commands.png)

### サブタブ

- **Flutter** — pub get / analyze / doctor / build / test など
- **Firebase** — emulators:start / deploy など
- **npm** — `package.json` の scripts を自動読み込み、☆ でピン留め
- **シーケンス** — 複数コマンドを順番に実行するタスクを定義・保存
- **実行ビルダー** — デバイス / フレーバー / エントリポイント / ブランチ / スタッシュを選択してコマンドを組み立て
- **Analyze** — `flutter analyze` 結果を severity フィルタ・VSCode リンク付きで一覧表示

---

## プロセス / ログ タブ

起動中のコマンドをリアルタイムで監視・操作します。

![プロセス/ログタブ](images/tab_logs.png)

### 主な機能

- 複数プロセスをタブ切り替えで管理
- SSE によるリアルタイムログ表示
- **PTY モード** — `r`（Hot Reload）・`R`（Hot Restart）等のキー入力をブラウザから送信
- **DevTools 連携** — `flutter run` のログから VM Service URL / DevTools URL を自動検出しヘッダーに表示
- **統合ビュー** — 全プロセスのログをタイムスタンプ順に統合表示
- **ログフィルタ** — キーワード / 正規表現、ERROR / WARN / INFO レベルバッジ
- **グループ化** — 特定のマーカー文字列でログをセクション（折り畳み）に分割表示
- **VM Service attach** — VSCode 等の外部ツールで起動した `flutter run` のログを後付けでキャプチャ

---

### VM Service attach（外部プロセスへの接続）

FlutterBoard から起動したプロセスだけでなく、**VSCode・ターミナル・他ツールで既に起動中の `flutter run`** のログをリアルタイムでキャプチャできます。

#### 接続手順

1. `flutter run` を起動（FlutterBoard 外でも可）
2. flutter のログに表示される VM Service URL をコピーする

   ```
   A Dart VM Service on Chrome is available at:
   http://127.0.0.1:56789/AbCdEfGhIj=/
   ```
   ※ devtools-bar の「VM Service ↗」リンクからもコピー可能

3. プロセスパネル下部の **Attach フォーム** に URL を貼り付け、`📡 Attach` ボタンを押す
4. プロセス一覧に `[VM]` バッジ付きのエントリが追加され、ログが流れ始める

#### 表示の違い

VM attach で取得したログは通常の PTY プロセスと視覚的に区別されます。

| 要素 | 通常プロセス | VM attach プロセス |
|---|---|---|
| プロセス一覧バッジ | `PTY`（青） | `VM`（teal） |
| ログエリア左端 | なし | teal のボーダーライン |
| ログエリア上部 | DevTools バー | 📡「VM Service キャプチャ中」バナー + URL |
| 停止ボタン | `■`（プロセス終了） | `⏏`（切断のみ、flutter run 本体は停止しない） |
| stdin バー | 表示（PTY のみ） | 非表示 |

#### 切断

- プロセスリストの `⏏` ボタン、または vm-bar の **「切断」** ボタンで WebSocket を切断します
- **flutter run 本体は停止しません**（あくまでログキャプチャを終了するだけ）

---

### グループ化（ログセクション分割）

長時間稼働するプロセス（`flutter run` など）のログを、画面遷移やフェーズ単位に折り畳んで整理できます。

#### 有効化

ログエリア上部のツールバーにある **「グループ化」チェックボックス** をオンにします。  
チェックをオンにすると右側にマーカー入力欄が表示されます（デフォルト: `[FB:SCREEN]`）。

設定は localStorage に保存され、次回起動時も引き継がれます。

#### 仕組み

マーカー文字列を含むログ行が届くと、その行を区切りとして **新しいセクション** が作られます。  
マーカー行自体はセクションのヘッダー名として使われ、ログ本文には含まれません。  
前のセクションは自動的に折り畳まれます。

```
[11:00:00] ▶ 起動          42行          （折り畳み済み）
[11:00:05] ▼ HomeScreen    18行  ● ライブ （展開中・記録中）
  ... ログ行 ...
```

| 表示要素         | 意味                                         |
|------------------|----------------------------------------------|
| `▶` / `▼`       | クリックで折り畳み / 展開                     |
| `[HH:MM:SS]`    | セクション開始時刻                            |
| セクション名     | マーカー直後のテキスト（例: `HomeScreen`）    |
| `N行`            | そのセクションのログ行数                      |
| `● ライブ`      | 現在記録中のセクション（最新のみ表示）         |

最初のマーカーが来る前のログは **「起動」セクション** として自動的にまとめられます。

#### アプリ側の実装例（Flutter）

`debugPrint` でマーカーを出力するだけで動作します。

```dart
// 画面に遷移するタイミングで呼ぶ
debugPrint('[FB:SCREEN] HomeScreen');
debugPrint('[FB:SCREEN] ProfileScreen');
```

マーカー文字列は自由に変更できます。例:

| 用途                   | マーカー例           |
|------------------------|----------------------|
| 画面遷移               | `[FB:SCREEN]`        |
| API リクエスト単位     | `[FB:API]`           |
| テストケース単位       | `[FB:TEST]`          |
| 任意の区切り           | `--- PHASE ---`      |

#### グループ化 ON/OFF 切り替え

チェックボックスを切り替えると、バッファに蓄積済みのログ全体が即時に再描画されます。  
OFF にすると通常のフラット表示に戻ります。

#### ログフィルタとの併用

グループ化中も「Filter...」テキストボックスや E / W / I レベルボタンは有効です。  
各セクション内のログ行に対して個別にフィルタが適用されます。

---

## ドキュメント タブ

プロジェクト内の Markdown ファイルをブラウザで閲覧します。

![ドキュメントタブ](images/tab_docs.png)

### 主な機能

- `README.md` をデフォルト表示
- `docs/` 以下のファイルをサイドバーに一覧表示
- コードブロックのシンタックスハイライト
- Mermaid ダイアグラムのインラインレンダリング（ズーム / パン対応）
- 全画面表示・ページズームコントロール

---

## 依存チェック タブ

pubspec.yaml / package.json / CDN ライブラリのバージョンを一括確認します。

![依存チェックタブ](images/tab_deps.png)

### サブタブ

- **pubspec.yaml** — pub.dev API で最新バージョンを確認、MAJOR / minor / 最新 をバッジ表示
- **package.json** — npm registry で最新バージョンを確認、Provenance バッジ付き
- **CDN** — HTML 内の cdnjs / jsDelivr / unpkg バージョンを確認
- **npm audit** — severity 別バッジ表示、audit fix 実行
- **セキュリティ診断** — OSV.dev API で Dart パッケージの既知 CVE を照会
- **依存ツリー** — `flutter pub deps` / `npm ls` をツリー描画、逆引きハイライト、競合ノード赤表示
- **依存比較** — 別ブランチ / 別プロジェクトと pubspec・npm を横断比較

---

## 環境変数 タブ

`.env` ファイルの内容を安全に確認・比較します。

![環境変数タブ](images/tab_env.png)

### 主な機能

- `.env` / `.env.development` / `.env.staging` / `.env.production` 等を一覧表示
- パスワード・API キー等の機密値をデフォルトでマスク
- **差分比較** — 2 ファイル間のキー差分を横並び表示、片方にしかないキーを警告表示
- Firebase Emulator UI（`:4000`）へのリンク

---

## Git タブ

ブランチ・変更ファイル・コミット履歴の確認と基本 Git 操作を行います。

![Git タブ](images/tab_git.png)

### 主な機能

- ブランチ表示、リモートとの ahead / behind 件数を常時表示
- 変更ファイル一覧（staged / unstaged / untracked）
- diff インライン表示
- スタッシュ一覧
- コミット履歴（15 件、詳細パネル）
- ファイル個別 stage / unstage、全 add、コミット、pull / push
- ブランチ checkout / merge、スタッシュ pop / apply

---

## ポート タブ

指定ポートの使用状況をリアルタイムで監視します。

![ポートタブ](images/tab_ports.png)

### 主な機能

- 使用中 / 空き状態を 3 秒ごとに自動更新
- 競合プロセスのワンクリック kill
- 監視ポートの追加 / 除外

---

## Android 設定（`/android.html`）

Android アプリのリリース準備に必要な設定を管理します。

### applicationId パネル

`build.gradle` の `applicationId` と `namespace` を確認・変更します。

### key.properties パネル

Android 署名キーの設定ファイルを作成・編集します。

- ファイルが未作成の場合はテンプレートを自動生成
- パスワード欄はデフォルトでマスク表示（👁 ボタンで切り替え）
- `storeFile` のバックスラッシュを自動でスラッシュに変換（`\t` 誤解釈を防止）

### build.gradle パネル

現在の `build.gradle` / `build.gradle.kts` の署名設定をハイライト表示します。

---

## Android リリース（`/release.html`）

Internal Testing や Firebase App Distribution への提出前チェックを支援します。

### テストリリース手順

Markdown 形式のカスタムチェックリストを作成・編集できます。  
チェックボックスをクリックして進捗を管理します（状態はセッション内のみ保持）。

### Pre-flight チェック

「チェック実行 ▶」ボタンで以下の項目を自動検査します。

| チェック項目 | 内容 |
|---|---|
| versionCode / versionName | pubspec / build.gradle 間の整合性 |
| Android release 署名設定 | `signingConfigs.release` が設定されているか |
| applicationId | `com.example` のままになっていないか |
| print / debugPrint 残存 | `lib/` 以下の print 文を検出 |

各項目の `?` ボタンで対処方法のヘルプを表示します。

### リリースノート自動生成

git タグ間のコミット履歴から Markdown 形式のリリースノートを生成します。

1. 基準タグを選択（省略時は全履歴）
2. 「生成 ▶」ボタンを押す
3. 生成された Markdown を確認・編集して「📋 Markdown をコピー」

### ストアスクリーンショット生成

Playwright を使って Flutter Web アプリを自動撮影します。  
→ 詳細は **[Playwright インストール手順](playwright.md)** を参照してください。

#### 設定

| 項目 | 説明 |
|---|---|
| ベース URL | 撮影対象の Flutter Web アプリの URL（`flutter run --web-port=8080` で固定推奨） |
| 撮影ルート | 撮影する画面の名前とパス（例: `home` / `/`） |
| Viewport | Phone（DPR=3 / 物理 1080×2400）・7" / 10" Tablet から複数選択可 |
| 動画 (WebM) | 各ページの読み込みを録画 |
| GIF / MP4 変換 | ffmpeg がインストールされている場合に変換可能 |

#### 操作

1. ベース URL と撮影ルートを設定して「設定を保存」
2. Flutter Web アプリを起動
3. 「撮影開始 ▶」を押す（最大 120 秒）
4. 完了後にギャラリーに画像を表示
5. 各ファイルの「PNG ↓」ボタンでダウンロード、🗑 ボタンで個別削除
6. セッション選択ドロップダウンで過去の撮影結果を再表示、🗑 でセッションごと削除

出力先: `{プロジェクト}/screenshots/store/{タイムスタンプ}/`

### 配布 URL / テスター管理

Internal Testing の配布 URL とテスター情報を登録・管理します。  
「📋 案内文をコピー」で配布案内文をクリップボードにコピーできます。

---

## セキュリティ方針

- サーバーは `127.0.0.1`（ローカルのみ）にバインド。外部からはアクセス不可
- コマンドは直接実行せず入力欄にセット、ユーザーが確認後に実行
