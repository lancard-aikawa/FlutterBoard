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

- [ ] **S1** pubspec セキュリティ診断 — OSV.dev API で Dart パッケージの CVE 照会、discontinued/unlisted 警告
- [ ] **S2** 依存ツリービューア — `flutter pub deps` / `npm ls` をツリー描画、逆引きハイライト、競合ノードを赤表示
- [ ] **S3** 環境変数 diff — `.env.*` ファイル間のキー差分比較、片方にしかないキーを警告
- [ ] **S4** マルチプロセス横断ログ検索 — 全プロセス統合ビュー、タイムスタンプ順に並べて横断フィルタ
- [ ] **S5** ポートモニター — 指定ポートの使用状況をリアルタイム表示、競合プロセスのワンクリック kill
- [ ] **S6** FVM 連携 — `.fvm/fvm_config.json` からSDKバージョン読み取り、ヘッダーに表示
- [ ] **S7** ビルドサイズトラッカー — APK/AAB/IPA のサイズを記録・前回比で増減表示
- [ ] **S8** エミュレータ データスナップショット UI — Firebase Emulator の import/export をボタンで管理
