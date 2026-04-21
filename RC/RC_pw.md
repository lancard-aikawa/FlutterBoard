# FlutterBoard × Playwright — 連携アイデアメモ

Playwright はブラウザ自動化ツール。FlutterBoard との接点は大きく 3 つある。

1. **Flutter Web ビルドを対象にする** — Flutter Web アプリを Playwright でテスト・スクリーンショット
2. **FlutterBoard 自体を操作する** — FlutterBoard の UI を Playwright で駆動・自動化
3. **FlutterBoard が Playwright を呼び出す** — FlutterBoard のプロセス管理から Playwright を起動・結果表示

---

## 連携案

---

### [PW1] Flutter Web スモークテスト（pre-flight 連携）

**課題**  
`flutter build web` や `firebase deploy` が成功しても、実際に画面が動くかは手で確認している。
特定画面が壊れていても CD パイプラインでは気づかない。

**実装済み（release.html 内 Web スモークテストパネル）**  
- ベース URL・確認ルートを UI で設定、設定は `config/pwsmoke_<hash>.json` に保存
- `playwright/smoke.js` を `execFile` で呼び出し、結果を JSON で受け取り表示
- 結果は ok / warn / error バッジで表示

**確認内容: HTTP 200 / コンソールエラーなし のみ**  
当初「特定テキストの存在」確認も設計に含めていたが **廃止**。

> **廃止理由**: Flutter Web の CanvasKit レンダラーはすべての描画を `<canvas>` に行うため、
> `page.content()`・`page.innerText()` では Widget のテキストを取得できない。
> Tab キー押下によるセマンティクスツリー起動も、ヘッドレス Playwright では機能しなかった。
> DOM にテキストが存在しない以上、テキスト一致チェックは常に失敗し意味がない。

**廃止した付随機能**  
- `mustContain` 入力欄（ルート行に存在した）
- 失敗時スクリーンショット取得（画像では内容の確認にならないため）
- `waitAfterLoad`（描画待機 ms 設定）— テキスト取得が不要になったため不要

**実装上の注意点**  
- `node -e "require('playwright')"` は CWD 依存。`execFile` に `cwd: path.join(__dirname, '..')` を必ず指定する
- Playwright は FlutterBoard の `devDependencies` に入れる（ユーザープロジェクトには追加しない）

---

### [PW2] ストアスクリーンショット自動生成

**課題**  
Play Store / App Store 用のスクリーンショットは手で撮影・リサイズしている。
画面変更のたびに撮り直しが発生し、忘れてリリースすることもある。

**実装済み（release.html 内 ストアスクリーンショット生成パネル）**  
- ベース URL・撮影ルート・Viewport（Phone / 7" / 10"）・出力オプションを UI で設定
- `playwright/capture.js` を `execFile` で呼び出し、PNG / WebM / GIF / MP4 を生成
- 生成結果はセッション単位でギャラリー表示、ダウンロード・削除可能
- ffmpeg で WebM → GIF / MP4 変換（オプション）

**ffmpeg 検出の問題と対処**  
WinGet でインストールした ffmpeg は `C:\Users\...\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe` に置かれるが、
Node.js サーバープロセスが古い PATH を引き継いでいると `execFile('ffmpeg', ...)` で見つからない。

> **対処**: `config/tools.json` に `ffmpegPath` を保存する手動設定 UI を追加。
> 自動検索は `where.exe ffmpeg`（Windows）で絶対パスを解決してキャッシュ。
> 優先順位: 手動設定 → `where.exe` 自動検索。
> `ffmpegPath` は `POST /api/pw/tools` で保存、`GET /api/pw/status` のレスポンスに含めて UI に反映。

**実装上の注意点**  
- `ffmpeg` の変換実行も `where.exe` で解決したフルパスを使う（`runCmd` の `cwd` オプション経由）
- `release.html` の IIFE は `async function` にする（内部で `await` を使うため）

---

### [PW3] Playwright タブ（テストランナー UI）

**課題**  
Flutter Web を持つプロジェクトで `npx playwright test` を実行するたびにターミナルを別途開いている。
テスト結果の HTML レポートも別ウィンドウで確認しており、FlutterBoard から離れる。

**案（未実装）**  
- FlutterBoard に「Playwright」タブを追加
- `playwright.config.*` を検出して有効・無効を切り替え
- `npx playwright test` をプロセスマネージャー経由で実行し、ログをリアルタイム表示
- 失敗したテストのスクリーンショット・トレースをパネル内サムネイルで表示

**特徴**  
- [T3] テストランナーとアーキテクチャを共有（`--reporter=json`）
- playwright が未インストールの場合はタブ非表示 or インストール案内

---

### [PW4] FlutterBoard 自身の E2E テスト（開発用）

**課題**  
FlutterBoard は機能が増えるにつれて回帰バグが増える。現状は手動確認のみ。

**案（未実装）**  
- `playwright/tests/flutterboard/` に FlutterBoard 自身の操作テストを置く
- `npm run test:e2e` でサーバーを起動 → Playwright でタブ操作 → アサーション

**特徴**  
- FlutterBoard 開発者向け（ユーザー向け機能ではない）
- 既存の `sandbox/playwright/` ディレクトリを活用

---

## 優先度・依存関係まとめ

| ID | 価値 | 難易度 | 状態 | 前提 |
|----|------|--------|------|------|
| PW1 | ★★★ リリース品質向上 | 中 | **実装済み** | Flutter Web ターゲット / Playwright インストール |
| PW2 | ★★★ 毎リリースの手間削減 | 中 | **実装済み** | Flutter Web ターゲット |
| PW3 | ★★ テスト習慣の定着 | 高 | 未実装 | Playwright テストがある程度整備済み |
| PW4 | ★ 開発品質保証 | 中 | 未実装 | ― |

---

## Flutter CanvasKit の制約（重要）

PW1・PW2 で判明した制約をまとめる。

| やりたいこと | CanvasKit | HTML レンダラー |
|---|---|---|
| `page.content()` でテキスト取得 | ✗ canvas に描画 | △ flt-text 要素に一部あり |
| `page.innerText('body')` | ✗ 空文字 | △ |
| Tab キーでセマンティクス起動 | ✗ ヘッドレスでは不可 | 未確認 |
| スクリーンショット取得 | ✓ | ✓ |
| HTTP ステータス確認 | ✓ | ✓ |
| コンソールエラー検出 | ✓ | ✓ |

**結論**: スモークテストでできることは「ページが開くか・JS エラーが出ないか」の疎通確認に限定される。
内容の検証が必要な場合は Flutter の統合テスト（`flutter test integration_test/`）を別途整備する。

---

## 技術的な前提・注意点

- **Flutter Web 依存**: PW1〜PW3 は Flutter Web ビルドが前提。モバイル専用プロジェクトでは適用外
- **Playwright のインストール**: FlutterBoard の `devDependencies` に `playwright` を追加済み。`node_modules` が存在すれば動作する
- **`require('playwright')` の解決**: `execFile` で子プロセスを起動する際は `cwd` を FlutterBoard ルートに指定しないと `require` が失敗する
- **ffmpeg パス**: WinGet / scoop 等でインストールした場合、サーバープロセスの PATH に入っていないことがある。UI から手動設定するか、再起動で解消
- **CI との棲み分け**: FlutterBoard の Playwright 連携はあくまでローカル開発支援。CI では既存の `playwright test` コマンドをそのまま使う
- **非同期 IIFE**: `release.html` のエントリスクリプトは `(async function () { ... })()` にしないと内部の `await` が SyntaxError になる
