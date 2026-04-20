'use strict';
/*
 * D-CL: テストリリース チェックリスト
 *
 * プロジェクト別に config/checklist_<hash>.md を永続化する。
 * ファイルが存在しない場合はデフォルトテンプレートを返す。
 */

const fs   = require('fs');
const path = require('path');

const { hashPath } = require('./projectInfo');

const CONFIG_DIR = path.resolve(__dirname, '..', 'config');

const DEFAULT_CHECKLIST = `## テストリリース手順

### 1. Pre-flight チェック
- [ ] バージョン番号を確認（pubspec / build.gradle / Info.plist が一致しているか）
- [ ] Android release 署名設定を確認（debug 鍵が使われていないか）
- [ ] applicationId が com.example.* でないことを確認
- [ ] print / debugPrint の残存がないことを確認
- [ ] ▶ Pre-flight チェックを実行して全項目グリーンにする

### 2. リリースノート作成
- [ ] 直前タグからのコミット一覧を確認
- [ ] リリースノートを生成して内容を編集
- [ ] ストア / 案内文用テキストにコピー

### 3. ビルド
- [ ] flutter clean を実行（任意）
- [ ] flutter build appbundle --release を実行
- [ ] ビルド成功・署名を確認

### 4. 配布
- [ ] Firebase App Distribution / Play Internal Testing にアップロード
- [ ] 配布 URL を本ページに登録
- [ ] テスターへ案内文を送付

### 5. 動作確認
- [ ] テスターからの動作報告を収集
- [ ] クラッシュ・重大な不具合がないことを確認
- [ ] 問題なければ次のトラック（Alpha / Beta）への昇格を検討
`;

function checklistFile(projectPath) {
  return path.join(CONFIG_DIR, `checklist_${hashPath(projectPath)}.md`);
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 512 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

async function handleChecklist(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  const p = url.searchParams.get('path');
  if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

  const file = checklistFile(p);

  if (url.pathname === '/api/checklist' && req.method === 'GET') {
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      content = DEFAULT_CHECKLIST;
    }
    res.writeHead(200);
    return res.end(JSON.stringify({ content, isDefault: !fs.existsSync(file) }));
  }

  if (url.pathname === '/api/checklist' && req.method === 'POST') {
    const body = await readBody(req);
    if (typeof body.content !== 'string') {
      res.writeHead(400); return res.end(JSON.stringify({ error: 'content required' }));
    }
    ensureConfigDir();
    fs.writeFileSync(file, body.content, 'utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleChecklist };
