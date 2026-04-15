# FlutterBoard — 課題・要望リスト

Flutter / Firebase / Node.js 開発で「困った・面倒」を解消する機能の実装候補。

---

## 完了済み機能

| ID | 機能 |
|----|------|
| R1 | ログ正規表現フィルタ + ERROR/WARN/INFO レベルフィルタ |
| R2 | Git 基本操作 UI（stage / unstage / commit / push / pull） |
| R3 | コマンドシーケンス（flutter clean → pub get → run 等の定型フロー） |
| R4 | Firebase 環境切り替えパネル（ヘッダー常時表示・prod 確認ダイアログ） |
| R5 | プロジェクト・ブランチ間依存比較（pubspec / npm 横断比較） |
| R6 | npm audit 表示（severity バッジ・折り畳み詳細） |
| R7 | Flutter analyze ビューア（severity フィルタ・vscode:// リンク） |
| R8 | ログ画面グループ化（`[FB:SCREEN]` マーカーでセクション折り畳み） |
| R9 | コンテキスト対応コマンドビルダー（デバイス/フレーバー/ブランチ選択） |
| S1 | pubspec セキュリティ診断（OSV.dev API で CVE 照会） |
| S2 | 依存ツリービューア（pub deps / npm ls・逆引きハイライト・競合赤表示） |
| S3 | 環境変数 diff（.env.* 間のキー差分比較） |
| S4 | マルチプロセス横断ログ検索（タイムスタンプ統合ビュー） |
| S5 | ポートモニター（使用中ポートのリアルタイム表示・ワンクリック kill） |
| S6 | FVM 連携（.fvm/fvm_config.json からSDKバージョン表示） |
| S7 | ビルドサイズトラッカー（APK/AAB/IPA の前回比増減表示） |
| S8 | エミュレータ データスナップショット UI（import/export をボタン管理） |
| V1 | VM Service 接続 + ログミラーリング（外部 flutter run にアタッチ） |
| V2 | VM Service r/R アクション（web 非対応判明のためボタン削除、API のみ残置） |
| V3 | VM Service スキャン UI（dart-service*.json 自動検出） |

---

## 第三弾 — 実装候補

### [T1] build_runner 管理 UI

- `dart run build_runner build` / `watch` をコマンドランナーから1クリック実行
- `--delete-conflicting-outputs` 付き再ビルドをボタンで提供
- 生成ファイル（`.g.dart` / `.freezed.dart`）の一覧と最終生成日時を表示
- 解決する課題: **freezed / riverpod / json_serializable 等を使うプロジェクトでの毎回の手作業**
- VSCode との差: コマンド実行は可能だが生成状態の確認 UI がない

---

### [T2] pubspec.lock 変更サマリー

- `git diff HEAD pubspec.lock`（または任意のブランチ/コミット）をパースして人間が読みやすい形に整形
- 「パッケージ名 / 旧バージョン → 新バージョン / 変更種別（MAJOR/minor/patch）」を一覧
- MAJOR 変更を赤でハイライト、追加・削除パッケージも明示
- 既存の依存チェックタブ or Git タブに「lock diff」ボタンを追加
- 解決する課題: **`flutter pub upgrade` 後に何が変わったか把握しにくい**
- VSCode との差: diff エディタは行単位で読みづらい

---

### [T3] テストランナー UI

- `test/` 以下のテストファイルをツリー表示
- 個別ファイル / ディレクトリ / 全テストをワンクリックで実行
- `flutter test --machine` の JSON 出力をパースして PASSED / FAILED / SKIPPED を色分け表示
- 失敗テストの行番号 → `vscode://` リンク
- 解決する課題: **テスト実行のたびにターミナルで打ち直す手間**
- VSCode との差: Test Explorer はあるが FlutterBoard の他情報（ログ/Git）と同一画面で見られない

---

### [T4] 証明書・キーストア有効期限チェック

- **Android**: `keytool -printcert -file <keystore>` で `.jks` / `.keystore` の有効期限を取得・表示
- **iOS**（macOS のみ）: `security find-identity` でプロビジョニングプロファイルの有効期限を取得
- 期限 30日以内: 警告（黄）、期限切れ: エラー（赤）をヘッダーまたは依存チェックタブに表示
- 解決する課題: **リリース直前に証明書切れに気づく最悪パターンの防止**
- VSCode との差: 標準機能なし

---

### [T5] コマンド実行履歴

- 実行したコマンドをプロジェクト別・タイムスタンプ付きで `config/history_<hash>.json` に保存
- コマンドタブの入力欄の下に最近の履歴リストを表示
- ワンクリックで入力欄にセット
- 成功（exit 0）/ 失敗（exit non-0）をアイコンで記録
- 解決する課題: **「さっき動かしたコマンドが何だったか忘れる」問題**
- VSCode との差: terminal の history はセッション跨ぎで消える・プロジェクト別管理なし

---

### [T6] node_modules / pub cache サイズ分析

- **npm**: `node_modules` 以下のトップパッケージをサイズ降順でリスト表示
- **Flutter**: `flutter pub cache list` で pub キャッシュの使用量を表示
- 肥大化しているパッケージをハイライト、`npm prune` / `flutter pub cache clean` をワンクリック実行
- 解決する課題: **ディスク圧迫に気づかない・どのパッケージが重いか不明**
- VSCode との差: 標準機能なし

---

## 優先度の考え方

```
高優先（毎日使う・ミス防止）
  T1 build_runner 管理 UI     — freezed/riverpod プロジェクトでの必須操作を省力化
  T2 pubspec.lock 変更サマリー — pub upgrade 後の破壊的変更の見落とし防止
  T3 テストランナー UI         — テスト実行 → 結果確認のコンテキストスイッチを削減

中優先（あると便利）
  T4 証明書有効期限チェック    — リリース前の安心感
  T5 コマンド実行履歴          — 小さいが体験改善

低優先
  T6 サイズ分析                — たまに使う程度
```
