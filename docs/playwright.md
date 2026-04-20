# ストアスクリーンショット / 動画生成（Playwright 連携）

`release.html` の「ストアスクリーンショット生成」パネルを使うには、
Playwright と（動画変換を行う場合は）ffmpeg のインストールが必要です。

---

## Playwright のインストール

Flutter プロジェクトのルートで実行します。

```bash
# Playwright パッケージをインストール
npm install -D playwright

# Chromium ブラウザをダウンロード（初回のみ）
npx playwright install chromium
```

> **注意**: Playwright はプロジェクトの `devDependencies` に追加されます。
> `node_modules/` が gitignore されていれば、`.jks` と同様にリポジトリには含まれません。

### 確認方法

FlutterBoard の release.html を開き、「ストアスクリーンショット生成」パネルの
ツールバッジが `Playwright ✓` になっていれば OK です。

---

## ffmpeg のインストール（任意）

動画（WebM）を **GIF** または **MP4** に変換する場合のみ必要です。
PNG スクリーンショットのみであれば不要です。

### Windows

#### winget（Windows 11 標準搭載）

```powershell
winget install Gyan.FFmpeg
```

インストール後、新しいターミナルを開いて `ffmpeg -version` で確認してください。

#### Chocolatey

```powershell
choco install ffmpeg
```

Chocolatey 自体のインストールは [https://chocolatey.org/install](https://chocolatey.org/install) を参照してください。

### macOS

```bash
brew install ffmpeg
```

### 確認方法

`Playwright ✓` と同様に、パネルの `ffmpeg ✓` バッジで確認できます。

---

## 使い方

1. **ベース URL** を設定する（例: `http://localhost:8080`）  
   → `flutter run -d chrome --web-port=8080` で起動した Web アプリのポートを指定

2. **撮影ルート** を追加する  
   → 名前（例: `home`）とパス（例: `/`）をセットで登録

3. **Viewport** を選択する  
   → Phone / 7" Tablet / 10" Tablet を複数選択可

4. **出力オプション** を選択する  
   → WebM 動画・GIF・MP4 は ffmpeg が必要

5. **「撮影開始」** ボタンを押す  
   → 最大120秒で完了。プロジェクト内 `screenshots/store/<タイムスタンプ>/` に保存される

---

## 出力ディレクトリ構成

```
screenshots/
  store/
    2026-04-20T10-30-00/      ← タイムスタンプごとのセッション
      phone/
        home.png
        settings.png
        home.webm             （動画オプション時）
        home.gif              （GIF 変換時）
      tablet7/
        home.png
        ...
      results.json            ← セッション再表示用インデックス
```

過去のセッションは release.html パネルのドロップダウンから再表示できます。

---

## gitignore への追加

キャプチャ画像をリポジトリに含めたくない場合は `.gitignore` に追加してください。

```
screenshots/store/
```
