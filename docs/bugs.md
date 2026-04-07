# バグ一覧

## 修正済み

| # | 症状 | 修正内容 |
|---|---|---|
| 2 | ✕ ボタンでプロセスを閉じられない | `e.target.dataset.id` → closure 値 `p.id` に変更。remove 時に activeSSE を明示 close |
| 3 | ■ ボタンでプロセスが終わらない | node-pty 導入により PTY で Ctrl+C → 2s 後 kill。pipe モード(Windows)は taskkill /T /F |
| 4 | コマンドタブのコマンド一覧がリロード後に表示されない | `pinnedDiv` (未定義) → `document.getElementById('npm-pinned-row')` に修正 |
| - | ソーストグル切替で npm アクションが出ない | ソーストグルクリック時に即 UI 反映 + checkDeps 自動実行 |

## 未修正

| # | 症状 | 原因 | 対象ファイル |
|---|---|---|---|
| 5 | プロジェクトフォルダ内に `charCodeAt...` というファイルが生成される | FlutterBoard とは無関係の既存ファイル。手動削除が必要 | — |

## 追加修正済み

| # | 症状 | 修正内容 |
|---|---|---|
| 1 | `ls` 等の即終了コマンドが「完了」にならない | processManager.js でリスナー登録を `processes.set` より前に移動 |
| 6 | プロセス終了後も更新ループが止まらない・自動更新チェックが戻る | `_doRefresh(null)` が `selectId ?? activeId` で `selectProcess` を呼び新 SSE を開いていた。`selectId != null` の場合のみ `selectProcess` を呼ぶよう修正 |
| 7 | `onerror` が `refreshProcessList(activeId)` で不要な再接続 | `refreshProcessList(null)` に変更（リスト UI 更新のみ） |

## メモ

- **バグ 4** は確実に修正可能（1行修正）: `pinnedDiv` → `pinnedRow`
- **バグ 3** は Windows 固有。`shell:true` で生成した場合 `proc.kill()` は cmd.exe を殺すが孫プロセス（flutter等）が残る。`taskkill /T /F /PID` を使えば解決できる
- **バグ 1** は SSE の `retry` によって再接続が起き、バッファ再生で `exit` イベントが届くはずだが、`exited` フラグがリセットされないため UI が更新されない
- **バグ 5** は実際にどのパスに作られているか確認が必要（`config/` 内の pins ファイルと混同の可能性あり）
