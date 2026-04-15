# Git タブ UI 設計メモ

GitHub 連携（G1/G2）実装に向けた Git タブの UI 設計。

---

## 現状のレイアウト

```
Git タブ
├── 左サイドバー
│   ├── ブランチ
│   ├── 変更サマリー
│   ├── スタッシュ
│   ├── クイックアクション（checkout / merge / stash pop）
│   ├── コミット（stage / unstage / commit message / commit）
│   ├── リモート（pull / push）
│   └── 更新ボタン
└── 右メイン
    ├── 変更ファイル + diff パネル
    └── コミット履歴 + 詳細
```

---

## 拡張方針

### サブタブ構成

Git タブ内に **[ローカル] / [リモート]** の 2 サブタブを追加する。

```
Git タブ
├── [ローカル]  （現状のまま）
└── [リモート]  （新規、gh 検出時のみ有効化）
```

**左サイドバーは両タブ共通**で常時表示する。  
ブランチ・スタッシュ・クイックアクションはどちらのコンテキストでも参照するため。

---

### [ローカル] タブ — 変更なし

現状の右メインエリアをそのまま使用。

- 変更ファイル一覧 + diff パネル
- コミット履歴 + 詳細

---

### [リモート] タブ — 新規

`gh` コマンドが検出された場合のみ有効。未検出時はタブ自体を非表示にする。

右メインエリアを以下のセクションで構成（スクロール、タブ分割はしない）。

#### セクション 1: 同期

```
↓ pull   ↑ push
[結果メッセージエリア]
```

現状の「リモート」カードをサイドバーから移動。

---

#### セクション 2: PR

```
現在ブランチの PR:
  #42  feat/login  ⏳ CI running  ↗
  （なければ「PR なし」と表示）

[PR を作成]
  タイトル: [________________]
  base:     [main ▼]
  本文:     直前のコミット一覧を自動挿入（編集可）
  [作成する]
```

使用コマンド:
```
gh pr status --json number,title,state,url,statusCheckRollup
gh pr create --title "..." --body "..." --base <branch>
```

---

#### セクション 3: Issues

```
[Issue を作成]
  タイトル: [________________]
  本文:     [________________]
  [作成する]

最近の Open Issues（5件）:
  #38  ログ画面が重い
  #35  Android ビルド失敗
  ...
```

コミット入力欄で `#` を入力すると上記リストで補完。

使用コマンド:
```
gh issue create --title "..." --body "..."
gh issue list --limit 10 --json number,title,state
```

---

#### セクション 4: CI / Actions

```
最近の workflow runs（現在ブランチ）:
  ✓  build        push  2h ago   ↗
  ✗  test         push  2h ago   ↗
  ⏳ deploy       push  just now ↗
```

詳細は GitHub へのリンクで飛ぶ。ログをダッシュボード内には持たない。

使用コマンド:
```
gh run list --branch <current> --limit 5
  --json status,conclusion,name,workflowName,url,createdAt
```

---

### リモートタブが空になるケース

| 状態 | 表示 |
|---|---|
| `gh` 未インストール | タブ非表示 |
| `gh auth login` 未実施 | 「gh auth login を実行してください」メッセージ |
| GitHub リポジトリでない | タブ非表示（`git remote` に github.com がない） |

---

## 更新タイミング

| 情報 | 更新タイミング |
|---|---|
| PR ステータス・CI | push 実行後 + 手動更新ボタン |
| Issues 一覧 | リモートタブを開いたとき + 手動更新 |
| コミット補完候補 | リモートタブを開いたとき（キャッシュ）|

ポーリングは行わない（push したタイミングが明確なため）。
