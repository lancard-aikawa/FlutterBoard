'use strict';
const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// test/ 以下の *_test.dart ファイルを再帰走査
function scanTestDir(dir, base) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...scanTestDir(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith('_test.dart')) {
      results.push(rel);
    }
  }
  return results.sort();
}

// flutter test --machine の出力をパース
function parseMachineOutput(stdout) {
  const tests  = {};
  const suites = {};
  let success  = null;

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[')) continue;
    let evt;
    try { evt = JSON.parse(trimmed); } catch { continue; }

    if (evt.type === 'suite') {
      suites[evt.suite.id] = { path: evt.suite.path };
    } else if (evt.type === 'testStart') {
      const t = evt.test;
      tests[t.id] = {
        name: t.name, line: t.line, url: t.url, suiteId: t.suiteID,
        result: t.metadata?.skip ? 'skipped' : null,
      };
    } else if (evt.type === 'testDone') {
      const t = tests[evt.testID];
      if (!t) continue;
      if (evt.hidden) { delete tests[evt.testID]; continue; }
      t.result = evt.skipped ? 'skipped' : evt.result;
    } else if (evt.type === 'error') {
      const t = tests[evt.testID];
      if (t) { t.error = evt.error; t.stackTrace = evt.stackTrace; }
    } else if (evt.type === 'done') {
      success = evt.success;
    }
  }

  const list    = Object.values(tests);
  const passed  = list.filter(t => t.result === 'success').length;
  const failed  = list.filter(t => t.result === 'failure' || t.result === 'error').length;
  const skipped = list.filter(t => t.result === 'skipped').length;

  return { success, tests: list, passed, failed, skipped };
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

async function handleTestRunner(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const { pathname } = url;

  // GET /api/test/tree?path=<dir>
  if (pathname === '/api/test/tree' && req.method === 'GET') {
    const cwd = url.searchParams.get('path');
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const testDir = path.join(cwd, 'test');
    if (!fs.existsSync(testDir)) {
      res.writeHead(200);
      return res.end(JSON.stringify({ files: [], error: 'test/ ディレクトリが見つかりません' }));
    }
    const files = scanTestDir(testDir, '');
    res.writeHead(200);
    return res.end(JSON.stringify({ files }));
  }

  // POST /api/test/run  { cwd, target? }
  if (pathname === '/api/test/run' && req.method === 'POST') {
    const body = await readBody(req);
    const { cwd, target } = body;
    if (!cwd) { res.writeHead(400); return res.end(JSON.stringify({ error: 'cwd required' })); }

    const args = ['test', '--machine'];
    if (target) args.push(target.startsWith('test/') ? target : `test/${target}`);

    const proc = spawn('flutter', args, {
      cwd, shell: true, encoding: 'utf-8',
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', c => stdout += c);
    proc.stderr.on('data', c => stderr += c);

    proc.on('close', code => {
      const result = parseMachineOutput(stdout);
      result.exitCode = code;
      if (stderr.trim()) result.stderr = stderr.trim();
      res.writeHead(200);
      res.end(JSON.stringify(result));
    });

    proc.on('error', err => {
      res.writeHead(200);
      res.end(JSON.stringify({ error: `起動エラー: ${err.message}` }));
    });

    // 5 分タイムアウト
    setTimeout(() => {
      try { proc.kill(); } catch (_) {}
    }, 300000);
  }
}

module.exports = { handleTestRunner };
