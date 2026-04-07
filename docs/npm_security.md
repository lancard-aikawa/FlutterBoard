# npm パッケージのサプライチェーンセキュリティ

## リスクの概要

npm パッケージへの攻撃は大きく 3 種類ある。

| 攻撃手法 | 説明 | 実例 |
|---|---|---|
| アカウント乗っ取り | メンテナーのアカウントを奪い悪意ある版を公開 | axios 1.7.4 (2024) — 3時間で発見・revoke |
| タイポスクワッティング | `lodash` → `1odash` のような類似名で公開 | 多数 |
| 依存汚染 | 直接依存の依存（transitive）を経由して侵入 | event-stream (2018) |

**N日ポリシー**（7〜14日が一般的）: 新バージョンが公開されてから数日は様子を見てからインストールする。悪意ある版は通常 数時間〜数日以内に検出・revoke されるため、このバッファが有効に機能する。

---

## コマンドラインでの確認方法

### 1. npm audit — 既知の脆弱性をチェック

```bash
npm audit
npm audit --audit-level=high   # HIGH 以上だけ表示
npm audit fix                   # 自動修正（破壊的変更なし）
npm audit fix --force           # major 更新も含めて修正（要注意）
```

### 2. パッケージの公開日を確認

```bash
# 特定バージョンの公開日
npm info <package>@<version> time
npm view <package> time --json   # 全バージョンの公開日一覧

# 例
npm view axios time --json | grep '"1.7.3"'
```

### 3. Provenance（来歴）を確認

```bash
# Provenance 情報の確認
npm info <package>@<version> dist.attestations
npm view <package>@<version> --json | jq '.dist.attestations'

# 例（provenance ありのパッケージ）
npm view undici@6.19.2 dist.attestations
```

Web で確認: `https://www.npmjs.com/package/<pkg>/v/<ver>` → "Provenance" セクション

### 4. package-lock.json を厳密に使う

```bash
npm ci          # package-lock.json を厳密に再現（差異があればエラー）
npm install     # package-lock.json を更新しながらインストール
```

CI/CD では常に `npm ci` を使用すること。

### 5. .npmrc で設定を強化

```ini
# .npmrc
audit=true
fund=false

# スコープ付きパッケージは公式レジストリのみ
@myorg:registry=https://registry.npmjs.org/
```

### 6. 手動でハッシュ検証

```bash
# tarball の整合性確認
npm view <package>@<version> dist.integrity
# → sha512-xxxxx... が package-lock.json の値と一致するか確認
```

---

## SLSA Provenance とは

**SLSA（Supply-chain Levels for Software Artifacts）** は Google が主導するサプライチェーン向けセキュリティフレームワーク。

| レベル | 要件 |
|---|---|
| Level 1 | ビルドプロセスのドキュメント化 |
| Level 2 | バージョン管理 + 認証済みビルドサービス（GitHub Actions 等） |
| Level 3 | 改ざん不可能なビルド環境 |

npm の `--provenance` フラグ（Level 2）:

```bash
# GitHub Actions 内で実行
npm publish --provenance
```

これにより `dist.attestations` が付与され、「どのソースコードからビルドされたか」を暗号的に証明できる。

**信頼できる条件（Level 2）:**
- `dist.attestations` が存在する
- attestation の `issuer` が `https://token.actions.githubusercontent.com`
- `buildTrigger` が `push` または `release`

---

## FlutterBoard での確認と操作方法

### 1. 依存チェックタブを開く

1. プロジェクトを選択してダッシュボードを開く
2. **依存チェック** タブをクリック
3. ソース切替で **package.json** を選択

### 2. しきい値を設定

`⚠ しきい値` 入力欄に日数を入力（デフォルト: **7日**）。  
この日数より公開が新しいバージョンは警告バッジ `⚠ N日` で表示される。  
設定値はブラウザに保存されるので次回起動時も維持される。

### 3. 更新チェックを実行

「更新チェック」ボタンを押すと pub.dev / npm registry へ問い合わせ、以下を表示する：

| 列 | 内容 |
|---|---|
| パッケージ | パッケージ名 |
| 現在 | package.json に記載のバージョン |
| 最新 | registry の最新バージョン |
| 状態 | ✓ 最新 / ↑ minor / ⚠ MAJOR |
| 公開日（現在版） | 現在バージョンが公開された日付 |
| 経過日数 | 公開日からの日数（しきい値未満は赤バッジ） |
| Provenance | ✓ SLSA（あり） / ✗（なし） / — |
| 種別 | dev / — |

### 4. 行の色分け（npm 時のみ）

左端のボーダー色で信頼レベルを判断できる：

| 色 | 信頼レベル | 条件 |
|---|---|---|
| 緑 | **信頼済み** | Provenance あり かつ 経過日数 ≥ しきい値 |
| 黄 | **一部信頼** | Provenance あり または 経過日数 ≥ しきい値（どちらか一方） |
| 赤 | **未信頼** | Provenance なし かつ 経過日数 < しきい値 |

### 5. 信頼済みパッケージのみをインストール

1. **「信頼済みのみ選択」** ボタン → 緑行（Provenance あり かつ しきい値以上）が自動チェックされる
2. 必要に応じてチェックを手動で調整
3. **「選択をインストール」** ボタンを押す
4. ログタブに切り替わり `npm install pkg1@ver1 pkg2@ver2 ...` が実行される

> **注意**: バージョン指定なしのパッケージ（`*`, `latest`）は `@` なしでインストールされる。

**全選択 / 全解除 ボタン** でまとめて操作することもできる。

### 6. 未信頼パッケージへの対応

未信頼（赤）のパッケージは以下のどちらかを選ぶ：

- **待つ**: 数日後に再チェックし、しきい値を超えてから導入
- **手動確認してインストール**: GitHub リポジトリ・差分・公式コミュニケーションを確認した上でチェックして導入

---

## 参考リンク

- [SLSA Framework](https://slsa.dev/)
- [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements)
- [npm audit docs](https://docs.npmjs.com/cli/v10/commands/npm-audit)
- [OpenSSF Scorecard](https://securityscorecards.dev/) — OSS プロジェクトのセキュリティスコア
