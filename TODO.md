# FlutterBoard — 実装計画

RC.md の機能要望をもとにした実装順序と設計メモ。

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
- [x] **R3** コマンドシーケンス（タスクランナー） — flutter clean → pub get → run の定型フロー保存・実行
- [x] **R9** コンテキスト対応コマンドビルダー — デバイス/フレーバー/エントリポイント/ブランチ/スタッシュを取得してコマンド組み立て
- [x] **R4** Firebase 環境切り替えパネル — ヘッダーに常時表示、firebase use / .env.* 切り替え、prod 確認ダイアログ
- [x] **R6** npm audit 表示 — severity 別バッジ + 折り畳み詳細パネル（パッケージ・影響範囲・fix 有無）
- [x] **R8** ログ画面グループ化 — `[FB:SCREEN]` マーカーでセクション折り畳み、ライブインジケーター、グループ化トグル
- [x] **R5** プロジェクト・ブランチ間依存比較 — git ブランチ / 別プロジェクトと pubspec・npm を横断比較
- [x] **R1** ログ正規表現フィルタ + レベルフィルタ — 正規表現モード切り替え、ERROR/WARN/INFO レベルバッジフィルタ
- [x] **R7** Flutter analyze ビューア — `flutter analyze --machine` パース、severity フィルタ、vscode:// リンク
- [x] **R2** Git 基本操作 UI — ファイル個別 stage/unstage、全 add/unstage、コミット、pull/push

---

## 第二弾 — 未着手

優先度は RC.md の `[S*]` 番号を参照。

- [x] **S1** pubspec セキュリティ診断 — OSV.dev API で Dart パッケージの CVE 照会（pubspec.lock 使用）
- [x] **S2** 依存ツリービューア — `flutter pub deps` / `npm ls` をツリー描画、逆引きハイライト、競合ノードを赤表示
- [x] **S3** 環境変数 diff — `.env.*` ファイル間のキー差分比較、片方にしかないキーを警告
- [x] **S4** マルチプロセス横断ログ検索 — 全プロセス統合ビュー、タイムスタンプ順に並べて横断フィルタ
- [x] **S5** ポートモニター — 指定ポートの使用状況をリアルタイム表示、競合プロセスのワンクリック kill
- [x] **S6** FVM 連携 — `.fvm/fvm_config.json` からSDKバージョン読み取り、ヘッダーに表示
- [x] **S7** ビルドサイズトラッカー — APK/AAB/IPA のサイズを記録・前回比で増減表示
- [x] **S8** エミュレータ データスナップショット UI — Firebase Emulator の import/export をボタンで管理

---

## 第三弾 — 計画中

### VM Service 連携（外部プロセスへの attach）

**背景・課題**
`flutter run -d chrome` を PTY 経由で操作する現行方式は Windows の制約（flutter.bat・Ctrl+C プロンプト・node-pty バグ）により不安定。
VSCode のデバッグコンソール等、外部で起動した flutter run のログを FlutterBoard で取得・操作できれば PTY 依存を排除できる。

**方針**
Dart VM Service（WebSocket JSON-RPC）を使い、flutter run が既に公開している口に後付けで接続する。
VM Service URL はすでに自動検出済み（`vmServiceUrl` フィールド）なので基盤はある。

**実装フェーズ**

- [x] **V1** VM Service 接続 + ログミラーリング
  - `ws://<vmServiceUrl>` に接続し `streamListen('Stdout')` / `streamListen('Stderr')` でログ受信
  - 受信ログを既存の SSE ログ配信（`broadcast`）に流し込む
  - PTY ログと VM Service ログを排他制御（どちらか一方が有効）

- [x] **V2** Hot Reload / Hot Restart を VM Service 経由に切り替え
  - `r` ボタン → `reloadSources()` RPC（詰まらない、応答が明確）
  - `R` ボタン → `callServiceExtension(ext.flutter.reassemble)` RPC
  - vm-bar に r/R ボタンを追加（isVm プロセス選択中のみ表示）
  - PTY プロセスは従来の stdin 送信のまま（変更なし）

- [x] **V3** 外部プロセスへの手動 attach UI
  - 「Attach」ボタン → VM Service URL を入力
  - 🔍 スキャンボタン → Dart が書き込む dart-service*.json を走査して URL 自動検出
  - 複数検出時はドロップダウンで選択、1件のみは自動入力
  - VSCode・ターミナルで起動した `flutter run` にも接続可能
