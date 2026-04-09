'use strict';
const { spawn } = require('child_process');

// =====================================================================
// flutter analyze --machine を実行して結果をパース
// =====================================================================
// 出力形式（NDJSON）:
//   {"event":"analyze.analyzingFiles","params":{"count":N}}
//   {"event":"analyze.errors","params":{"errors":[{...}]}}
//   {"event":"analysis.flush","params":{}}
//
// 各 error オブジェクト:
//   { code, severity, type, location: { file, startLine, startColumn, length },
//     message, hasFix }
// severity: "INFO" | "WARNING" | "ERROR"

function runFlutterAnalyze(projectPath) {
  const isWin = process.platform === 'win32';
  return new Promise(resolve => {
    const child = spawn(
      isWin ? 'flutter.bat' : 'flutter',
      ['analyze', '--machine'],
      { cwd: projectPath, shell: isWin, timeout: 60000 }
    );

    let raw = '';
    child.stdout.on('data', chunk => { raw += chunk; });
    child.stderr.on('data', () => {});

    child.on('error', () => resolve({ error: 'flutter コマンドが見つかりません', issues: [] }));
    child.on('close', () => {
      const issues = [];
      let fileCount = 0;

      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          if (obj.event === 'analyze.analyzingFiles') {
            fileCount = obj.params?.count || 0;
          } else if (obj.event === 'analyze.errors') {
            for (const err of (obj.params?.errors || [])) {
              issues.push({
                severity: err.severity || 'INFO',
                code:     err.code     || '',
                message:  err.message  || '',
                file:     err.location?.file        || '',
                line:     err.location?.startLine   || 0,
                column:   err.location?.startColumn || 0,
                hasFix:   err.hasFix || false,
              });
            }
          }
        } catch { /* NDJSON の非 JSON 行は無視 */ }
      }

      // severity 順でソート: ERROR > WARNING > INFO
      const ORDER = { ERROR: 0, WARNING: 1, INFO: 2 };
      issues.sort((a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3));

      resolve({ fileCount, issues });
    });
  });
}

async function handleFlutterAnalyze(req, res, url) {
  res.setHeader('Content-Type', 'application/json');

  // GET /api/analyze?path=...
  if (url.pathname === '/api/analyze' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    const result = await runFlutterAnalyze(p);
    res.writeHead(200);
    return res.end(JSON.stringify(result));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handleFlutterAnalyze };
