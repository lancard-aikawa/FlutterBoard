'use strict';
/**
 * FlutterBoard スクリーンショット撮影スクリプト
 *
 * 使い方:
 *   node scripts/screenshot.js
 *
 * 前提: FlutterBoard が http://localhost:3210 で起動済みであること
 * 出力: docs/images/<tab-name>.png
 */

// グローバルインストールの playwright を解決
const { execSync } = require('child_process');
const globalModules = execSync('npm root -g').toString().trim();
const { chromium } = require(require('path').join(globalModules, 'playwright'));
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3210';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'images');

/** 撮影対象タブ: [data-tab 値, ファイル名] */
const TABS = [
  ['commands', 'tab_commands'],
  ['logs',     'tab_logs'],
  ['docs',     'tab_docs'],
  ['deps',     'tab_deps'],
  ['env',      'tab_env'],
  ['git',      'tab_git'],
  ['ports',    'tab_ports'],
];

/** 履歴の一番上のプロジェクトを選択してダッシュボードを表示 */
async function ensureProjectSelected(page) {
  const dashboard = page.locator('#dashboard');
  const isVisible = await dashboard.evaluate(el => !el.classList.contains('hidden')).catch(() => false);
  if (isVisible) return;

  const firstHistory = page.locator('#history-list li').first();
  const count = await firstHistory.count();
  if (count === 0) {
    throw new Error('履歴が空です。先にブラウザで一度プロジェクトを開いてください。');
  }

  console.log('  履歴から最新プロジェクトを選択中...');
  await firstHistory.click();
  await page.waitForFunction(() => !document.getElementById('dashboard').classList.contains('hidden'));
  console.log('  プロジェクト選択完了');
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  console.log(`FlutterBoard に接続: ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await ensureProjectSelected(page);

  for (const [tabId, fileName] of TABS) {
    console.log(`  撮影中: ${tabId}`);
    await page.click(`[data-tab="${tabId}"]`);
    await page.waitForTimeout(3000);
    const outPath = path.join(OUT_DIR, `${fileName}.png`);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`  -> ${outPath}`);
  }

  await browser.close();
  console.log('\n完了');
})();
