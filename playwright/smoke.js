'use strict';
// argv[2] = path to JSON config file
// Config: { baseUrl, routes: [{name, path}], timeout? }
// Output (stdout): JSON { ok, summary, results }

const fs = require('fs');

let playwright;
try { playwright = require('playwright'); } catch {
  process.stdout.write(JSON.stringify({ ok: false, error: 'ERR_NO_PLAYWRIGHT' }));
  process.exit(0);
}

async function main() {
  const cfgPath = process.argv[2];
  if (!cfgPath) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'config path required' }));
    return;
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  const { baseUrl, routes = [{ name: 'ホーム', path: '/' }], timeout = 15000 } = cfg;

  const browser = await playwright.chromium.launch();
  const results = [];

  for (const route of routes) {
    const url = baseUrl.replace(/\/$/, '') + route.path;
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    let routeStatus = 'ok';
    let httpStatus  = null;
    let loadError   = null;

    try {
      const response = await page.goto(url, { timeout, waitUntil: 'networkidle' });
      httpStatus = response ? response.status() : null;
      if (!httpStatus || httpStatus >= 400) {
        routeStatus = 'error';
      } else if (consoleErrors.length > 0) {
        routeStatus = 'warn';
      }
    } catch (e) {
      loadError   = e.message;
      routeStatus = 'error';
    }

    await page.close();
    results.push({
      route:         route.path,
      name:          route.name,
      status:        routeStatus,
      httpStatus,
      consoleErrors: consoleErrors.slice(0, 5),
      loadError,
    });
  }

  await browser.close();

  const hasError = results.some(r => r.status === 'error');
  const hasWarn  = results.some(r => r.status === 'warn');
  process.stdout.write(JSON.stringify({
    ok:      true,
    summary: hasError ? 'error' : hasWarn ? 'warn' : 'ok',
    results,
  }));
}

main().catch(e => {
  process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
});
