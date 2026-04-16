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

### [T1] build_runner 管理 UI ✅

- `dart run build_runner build` / `watch` をコマンドランナーから1クリック実行
- `--delete-conflicting-outputs` 付き再ビルドをボタンで提供
- 生成ファイル（`.g.dart` / `.freezed.dart`）の一覧と最終生成日時を表示
- 解決する課題: **freezed / riverpod / json_serializable 等を使うプロジェクトでの毎回の手作業**
- VSCode との差: コマンド実行は可能だが生成状態の確認 UI がない

---

### [T2] pubspec.lock 変更サマリー ✅

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

### [T5] コマンド実行履歴 ＋ サーバー再起動後のカード復元 ✅

- 実行したコマンドをプロジェクト別・タイムスタンプ付きで `config/history_<hash>.json` に保存
- コマンドタブの入力欄の下に最近の履歴リストを表示
- ワンクリックで入力欄にセット
- 成功（exit 0）/ 失敗（exit non-0）をアイコンで記録
- 解決する課題: **「さっき動かしたコマンドが何だったか忘れる」問題**
- VSCode との差: terminal の history はセッション跨ぎで消える・プロジェクト別管理なし

**再起動後のカード復元（docs/reload_problem.md 対策 A+B）**

- `config/procmeta_<hash>.json` にプロセスのメタ情報（label/cmd/cwd/startedAt/exitCode 等）を保存
- `/api/process/list` でメモリが空でも JSON から過去のカードを返す（running→unknown 扱い）
- UI 側は空レスポンス時に既存カードを即消去しない（対策案 A）
- 解決する課題: **`node --watch` 再起動でログ画面のカードが消える問題**

---

### [T7] ログファイルビューア

- ログタブに「ログファイルを開く ▶」ボタンを追加
- ファイルブラウザでパスを指定して `.log` / `.txt` など任意のテキストファイルを読み込む
- 読み込んだ内容を仮想プロセスエントリ（静的カード）としてプロセス一覧に追加し、ログビューアに表示
- 既存のグループ化（`[FB:SCREEN]` マーカー）・フィルタ・キーワード検索がそのまま使える
- 大きなファイルは末尾 2000 行を読み込む（`LOG_BUFFER_MAX` と統一）
- 解決する課題: **ビルドログや CI ログを手元で整形・検索しにくい**
- VSCode との差: テキスト表示のみでグループ化・ログレベルフィルタがない

---

### [T6] node_modules / pub cache サイズ分析

- **npm**: `node_modules` 以下のトップパッケージをサイズ降順でリスト表示
- **Flutter**: `flutter pub cache list` で pub キャッシュの使用量を表示
- 肥大化しているパッケージをハイライト、`npm prune` / `flutter pub cache clean` をワンクリック実行
- 解決する課題: **ディスク圧迫に気づかない・どのパッケージが重いか不明**
- VSCode との差: 標準機能なし

---

## 第三弾 — 連携フロー改善候補

> **単体で困る**（ツール自体が使いにくい）= T1〜T6  
> **連携で困る**（ツール間を往復する手間）= G*/FC*/W* ← FlutterBoard の強みが出る領域

---

### [G1] コミット後の Issue / PR 作成（gh CLI 経由）✅
### [G2] PR ステータス + CI 状態表示（gh CLI 経由）✅

UI 設計 → [docs/RC_UI_git.md](docs/RC_UI_git.md)  
アーキテクチャ設計 → [docs/RC_arch_github.md](docs/RC_arch_github.md)

- `gh` コマンド経由（API トークン不要、`gh auth login` 済みで即動作）
- Git タブに **[ローカル] / [リモート]** サブタブを追加
- リモートタブに 同期・PR・Issues・CI の各セクションを配置
- `gh` 未検出またはリモートが GitHub でない場合はタブ非表示

---

### [FC1] Firebase Remote Config 値確認

- `firebase remoteconfig:get` で現在の本番 Remote Config をパネルに表示
- ローカルの `.env.*` やコード内のデフォルト値と突き合わせて乖離を可視化
- 個別キーの値を確認するためだけにコンソールを開く必要をなくす
- 解決する困りごと: **本番値とローカル値がズレているか確認するたびに Firebase コンソールへ移動**
- VSCode との差: 標準機能なし

---

### [FC2] App Distribution ワンクリック配布

- ビルドサイズトラッカー（S7）のビルド成果物一覧から `firebase appdistribution:distribute` を実行
- 配布先グループ・リリースノートをフォームで入力してワンクリック
- 配布後のダウンロード URL をログに表示
- 解決する困りごと: **ビルド → ファイルパス確認 → コマンド組み立て → 実行 という複数ステップの連続操作**
- VSCode との差: 標準機能なし

---

### [FC3] Crashlytics 直近クラッシュ表示

- Firebase REST API で直近 24h のクラッシュ件数・上位 issue をヘッダーバッジに表示
- クリックで Firebase コンソールの該当ページを開く
- 0件 → 緑、1件以上 → 件数バッジ（赤）
- 解決する困りごと: **開発中「本番クラッシュ増えてないか」の確認のためにコンソールを開く習慣的コンテキストスイッチ**
- VSCode との差: 標準機能なし。Crashlytics 拡張も現状ない

---

### [W1] npm workspaces 対応コマンドビルダー

- `package.json` の `workspaces` フィールドを検出してパッケージ一覧を表示
- 特定ワークスペースを選択して `npm run <script> --workspace=<pkg>` をコマンド欄にセット
- `npm link` で繋がっているローカルパッケージの一覧表示・解除ボタン
- 解決する困りごと: **モノレポでパッケージを個別操作するたびにターミナルで cd しながらコマンドを打つ**
- VSCode との差: ワークスペース横断のスクリプト実行 UI がない

---

### [W2] Firestore Rules 編集 → 検証 → デプロイサイクル

- `firestore.rules` のライブプレビュー（変更を検知して自動バリデーション）
- `firebase emulators:exec --only firestore "echo ok"` で構文チェック結果を表示
- 問題なければそのまま `firebase deploy --only firestore` ボタン
- 解決する困りごと: **rules を編集 → エミュレータ再起動 → 確認 → deploy という断続的な作業**
- VSCode との差: Firebase 拡張の rules エディタはあるが、エミュレータ連携・デプロイまで一貫した UI がない

---

## ナビゲーション設計方針

### トップタブ構成（確定）

```
[プロセス/ログ][ツール][ドキュメント][依存チェック][Git][ポート]
```

「コマンド」→「**ツール**」に改名。Firebase サブタブが設定閲覧・モニタリングを含むようになるため、「コマンドを打つ場所」という印象の名称から変更する。「DevTool」は Flutter DevTools と混同するため不採用。

### 各タブの配置方針（確定）

| 機能 | 配置 |
|---|---|
| Firebase Remote Config / App Distribution / Crashlytics | ツールタブ内 Firebase サブタブに統合 |
| npm workspace 情報表示 | 依存チェックタブ内 |
| npm workspace コマンド実行 | R9 コンテキストビルダー（ツールタブ）|
| Node コマンド（まれな例外） | 自由入力のまま。専用タブ・サブタブは作らない |
| GitHub Issues / PR / CI | Git タブ内に `[ローカル][リモート]` サブタブを追加 |
| トップタブの増減 | 6 タブのまま維持 |

詳細設計 → [docs/RC_UI_git.md](docs/RC_UI_git.md) / [docs/RC_arch_github.md](docs/RC_arch_github.md)

---

## 優先度の考え方

```
単体で困る（ツール単体の使いにくさ）
  高: T1 build_runner 管理 UI / T2 pubspec.lock 変更サマリー / T3 テストランナー UI
  中: T4 証明書有効期限 / T5 コマンド実行履歴
  低: T6 サイズ分析

連携で困る（ツール間往復・コンテキストスイッチ）← FlutterBoard の差別点
  高: G1 GitHub Issues 連携（analyze → Issue 起票）/ G2 PR+CI 状態表示
  中: FC1 Remote Config 確認 / FC2 App Distribution 配布 / W2 Firestore Rules サイクル
  低: FC3 Crashlytics 表示 / W1 workspaces 対応
```
