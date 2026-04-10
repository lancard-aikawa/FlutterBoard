/**
 * split.js — public/app.js を src/app/ に分割する
 *
 * セパレータ形式:
 *   // =====================================================================
 *   // セクション名
 *   // =====================================================================
 *
 * 使い方: node scripts/split.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, '../public/app.js');
const DEST = path.join(__dirname, '../src/app');

const content        = fs.readFileSync(SRC, 'utf-8');
const trailingNewline = content.endsWith('\n') ? '1' : '0';
// trailing newline があると split で末尾に空文字列が生じるので除去
const raw    = trailingNewline === '1' ? content.slice(0, -1) : content;
const lines  = raw.split('\n');
const DIVIDER = /^\/\/ ={60,}/;

// セクション開始行（0-indexed）とセクション名を収集
const sections = [];
for (let i = 0; i < lines.length - 2; i++) {
  if (DIVIDER.test(lines[i]) && DIVIDER.test(lines[i + 2])) {
    const name = lines[i + 1].replace(/^\/\/\s*/, '').trim();
    sections.push({ idx: i, name });
    i += 2; // 3行ヘッダーをスキップ
  }
}

fs.mkdirSync(DEST, { recursive: true });

const manifest = [];

sections.forEach((sec, n) => {
  // 先頭セクションはプリアンブル（'use strict' 等）を含めてファイル冒頭から開始
  const startIdx = n === 0 ? 0 : sec.idx;
  const endIdx   = n + 1 < sections.length ? sections[n + 1].idx : lines.length;
  const chunk    = lines.slice(startIdx, endIdx);
  const safe    = sec.name.replace(/[^\w\u3040-\u9FFF\u30A0-\u30FF\u4E00-\u9FFF]/g, '_');
  const fname   = `${String(n + 1).padStart(2, '0')}_${safe}.js`;
  const fpath   = path.join(DEST, fname);

  // 各チャンクは trailing newline なしで保存（merge 側で結合時に復元）
  fs.writeFileSync(fpath, chunk.join('\n'), 'utf-8');
  manifest.push(fname);
  console.log(`  ${fname}  (${chunk.length} 行)`);
});

fs.writeFileSync(path.join(DEST, 'MANIFEST'), manifest.join('\n') + '\n' + trailingNewline + '\n', 'utf-8');

console.log(`\n${sections.length} セクション → ${DEST}/`);
console.log('編集後: node scripts/merge.js');
