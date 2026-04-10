/**
 * merge.js — src/app/ の分割ファイルを public/app.js に結合する
 *
 * 使い方: node scripts/merge.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, '../src/app');
const DEST = path.join(__dirname, '../public/app.js');

const manifestRaw  = fs.readFileSync(path.join(SRC, 'MANIFEST'), 'utf-8').split('\n').filter(Boolean);
const trailingFlag = manifestRaw.pop(); // 最終行はフラグ（'1' or '0'）
const files        = manifestRaw;

const parts = files.map(f => fs.readFileSync(path.join(SRC, f), 'utf-8'));
let   merged = parts.join('\n');
if (trailingFlag === '1') merged += '\n';

fs.writeFileSync(DEST, merged, 'utf-8');
console.log(`${files.length} ファイル → ${DEST}  (${merged.length} chars)`);
