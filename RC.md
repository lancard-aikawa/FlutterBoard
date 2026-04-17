# FlutterBoard — 課題・要望リスト

Flutter / Firebase / Node.js 開発で「困った・面倒」を解消する機能の実装候補。

---

## 完了済み機能

| ID | 機能 |
|----|------|
| T3 | テストランナー UI（test/ ツリー表示・flutter test --machine パース・vscode:// リンク） |
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

### [T3] テストランナー UI ✅

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

### [T7] ログファイルビューア ✅

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

## 第四弾 — 実装候補

### [T8] flutter pub outdated ビューア

- `flutter pub outdated --json` をパースしてパッケージ別に **Current / Resolvable / Latest** を一覧表示
- 乖離の大きさで色分け（MAJOR=赤 / minor=黄 / patch=緑）、Breaking 可能性をバッジ化
- 個別パッケージを `flutter pub upgrade <name>` / 全体を `--major-versions` でワンクリック更新
- 解決する課題: **依存パッケージの老朽度を手動コマンドで毎回確認する手間・どこまで上げるのが安全か判断できない**
- VSCode との差: Dart 拡張の Code Action は1行1パッケージずつで、全体俯瞰できない

---

### [T9] アセット管理パネル

- `pubspec.yaml` の `flutter.assets` エントリと `assets/` 以下の実ファイルを双方向突合
- 未登録アセット（実ファイルはあるが pubspec 漏れ）、宙ぶらりん参照（pubspec にあるがファイル無し）を赤/黄で強調
- 画像ファイルはサムネイル表示、pubspec.yaml への1クリック追記ボタン
- 解決する課題: **画像追加後に pubspec.yaml への追記を忘れて実行時に気づく典型的バグ**
- VSCode との差: 画像プレビュー拡張はあるが pubspec との突合チェック機能はない

---

### [T10] L10n / ARB 翻訳抜け検出

- `lib/l10n/*.arb`（または任意ディレクトリ）を横断スキャンしてキー集合を抽出
- 基準言語（`intl_en.arb` 等）に対して他言語の欠損キーをグリッドでハイライト
- 欠損率・件数サマリーを各言語ごとに表示、未翻訳キーのみ抽出して CSV エクスポート
- 解決する課題: **多言語対応で特定言語だけキー翻訳漏れが残り、リリース後にユーザー報告で気づく**
- VSCode との差: ARB 拡張はあるが複数言語横断の未翻訳一覧ビューは弱い

---

### [T11] バージョン統合ビューア

- `pubspec.yaml` / `android/app/build.gradle`（versionCode/Name）/ `ios/Runner/Info.plist`（CFBundleVersion/ShortVersionString）を1画面に並置
- 不整合があれば警告、ワンクリックで3ファイル一斉 bump（patch / minor / major / build-only）
- 最新 git tag `vX.Y.Z+N` との乖離も表示
- 解決する課題: **リリース前に versionCode 更新を忘れて Play Store リジェクト、3ファイルを手で揃える手間**
- VSCode との差: 各ファイルを個別に開いて目視同期するしかない

---

### [T12] Android Logcat 統合表示

- `adb logcat` を起動中の `flutter run` と同画面にマージし、タイムスタンプで時系列統合（S4 の横断検索と連携）
- アプリパッケージフィルタ、ログレベル（V/D/I/W/E/F）、タグフィルタ
- ANR / FATAL 発生時にバナー通知
- 解決する課題: **Flutter ログと native クラッシュ情報を別ウィンドウで突き合わせる手間、`adb` コマンド引数の覚え直し**
- VSCode との差: Android 拡張は Flutter プロジェクトで統合表示できず、ターミナル2窓運用になりがち

---

### [T13] TODO / FIXME コレクター

- プロジェクト全体の `// TODO` / `// FIXME` / `// HACK` / `// XXX` コメントを収集しリスト表示
- `// TODO(name):` 記法で担当者別グループ化、Git blame で作成者・日付を併記
- `vscode://` ジャンプリンク、既に Issue 化済みのものは `#番号` でリンク（G1 連携）
- 解決する課題: **技術負債・先送りメモが散在して棚卸しできない、誰がいつ書いたか追えない**
- VSCode との差: Todo Tree 拡張はあるが Git blame・Issue 連動がない

---

### [T14] ビルドキャッシュクリア ダッシュボード

- `.dart_tool/` / `build/` / `~/.gradle/caches/` / `~/Library/Developer/Xcode/DerivedData/` / `~/.pub-cache/` のサイズを一覧
- 任意選択でチェックしてワンクリック削除、削除前後の解放サイズ表示
- 解決する課題: **「動かない」→ flutter clean → それでも直らない → どのキャッシュを消すか毎回思い出すサイクル**
- VSCode との差: 標準機能なし、複数ディレクトリ横断のサイズ把握はコマンド手打ち

---

## 第四弾 — 連携フロー改善候補

### [G3] Git tag + GitHub Release 作成フロー

- 最新 pubspec.yaml の version から tag 名（`vX.Y.Z+N`）を自動提案
- 前回 tag 以降のコミットから CHANGELOG を自動生成（Conventional Commits 対応）
- `git tag` → `git push --tags` → `gh release create` を連続実行、ドラフト保存にも対応
- 解決する課題: **リリースごとにタグ付け → CHANGELOG 作成 → GitHub Release 作成を3ステップで手動実行する手間**
- VSCode との差: 標準機能なし、gh 拡張はコマンド単位の呼び出しのみ

---

### [FC4] Firestore / Auth エミュレータ統合

- `firebase.json` を読んで設定済みエミュレータを検出、起動/停止をワンボタン
- ローカル Firestore データをテーブル表示、コレクション/ドキュメント単位で簡易編集
- シードデータの import/export、現在状態のスナップショット保存
- 解決する課題: **エミュレータ UI（localhost:4000）を常時開いておく必要、起動コマンドや seed の手順を毎回思い出す**
- VSCode との差: Firebase 拡張にエミュレータ GUI はなく、ブラウザを別窓で開く運用になる

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
  高: T1 build_runner / T2 pubspec.lock diff / T3 テストランナー
       T8 pub outdated ビューア / T11 バージョン統合ビューア / T12 Android Logcat 統合
  中: T4 証明書有効期限 / T5 コマンド履歴 / T9 アセット管理 / T10 L10n 翻訳抜け
       T14 ビルドキャッシュクリア
  低: T6 サイズ分析 / T13 TODO/FIXME コレクター

連携で困る（ツール間往復・コンテキストスイッチ）← FlutterBoard の差別点
  高: G1 GitHub Issues / G2 PR+CI 状態 / G3 Release 作成フロー
  中: FC1 Remote Config / FC2 App Distribution / FC4 Firestore エミュレータ / W2 Firestore Rules
  低: FC3 Crashlytics / W1 workspaces
```
