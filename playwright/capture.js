'use strict';
// FlutterBoard — Playwright キャプチャスクリプト
// Usage: node playwright/capture.js <config-json-path>
// Config: { baseUrl, routes:[{name,path}], viewports:[{name,width,height}], recordVideo, outputDir }

const fs   = require('fs');
const path = require('path');

const SETTLE_MS   = 1500;  // Flutter 描画安定待ち（要素出現後の追加猶予）
const NAV_TIMEOUT = 30000;
const FLUTTER_TIMEOUT = 20000;  // Flutter エンジン起動待ちタイムアウト

// Flutter Web が描画完了したと判断できる要素セレクター
// CanvasKit: <canvas> / HTML renderer: <flt-glass-pane>
const FLUTTER_READY_SELECTOR = 'flt-glass-pane, canvas';

async function main() {
  const cfgPath = process.argv[2];
  if (!cfgPath) { console.error('config path required'); process.exit(1); }

  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  const { routes, viewports, recordVideo, outputDir } = cfg;
  const baseUrl = cfg.baseUrl.replace(/\/+$/, '');  // 末尾スラッシュを除去

  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    process.stderr.write('ERR_NO_PLAYWRIGHT\n');
    process.exit(2);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const results = [];

  for (const vp of viewports) {
    const vpDir = path.join(outputDir, vp.name);
    fs.mkdirSync(vpDir, { recursive: true });

    const browser = await chromium.launch();

    for (const route of routes) {
      const dpr = vp.deviceScaleFactor || 1;
      const ctxOpts = {
        viewport:          { width: vp.width, height: vp.height },
        deviceScaleFactor: dpr,
      };
      if (recordVideo) {
        ctxOpts.recordVideo = { dir: path.join(vpDir, '_vid'), size: { width: vp.width * dpr, height: vp.height * dpr } };
      }

      const ctx  = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();

      // Flutter Web の History API エラー（url_strategy 起因）を無視して撮影続行
      page.on('pageerror', () => {});

      try {
        await page.goto(baseUrl + route.path, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

        // Flutter Web エンジンが起動して DOM に描画要素を出すまで待つ
        // flt-glass-pane (HTML renderer) または canvas (CanvasKit) が現れれば描画開始
        try {
          await page.waitForSelector(FLUTTER_READY_SELECTOR, { timeout: FLUTTER_TIMEOUT });
        } catch {
          // 要素が見つからなくても時間で fallback
        }
        await page.waitForTimeout(SETTLE_MS);

        const shotPath = path.join(vpDir, `${route.name}.png`);
        await page.screenshot({ path: shotPath });
        results.push({ type: 'screenshot', viewport: vp.name, route: route.name, file: shotPath });

        if (recordVideo) {
          await page.close();
          const rawVideo = await page.video().path();
          const destVideo = path.join(vpDir, `${route.name}.webm`);
          fs.renameSync(rawVideo, destVideo);
          results.push({ type: 'video', viewport: vp.name, route: route.name, file: destVideo });
        }
      } catch (e) {
        results.push({ type: 'error', viewport: vp.name, route: route.name, message: e.message });
      } finally {
        await ctx.close();
      }
    }

    await browser.close();
  }

  process.stdout.write(JSON.stringify({ ok: true, results }) + '\n');
}

main().catch(e => {
  process.stderr.write(e.message + '\n');
  process.exit(1);
});
