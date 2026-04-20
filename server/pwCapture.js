'use strict';
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const { execFile } = require('child_process');
const { hashPath } = require('./projectInfo');

const CAPTURE_SCRIPT = path.join(__dirname, '..', 'playwright', 'capture.js');
const CONFIG_DIR     = path.join(__dirname, '..', 'config');

const VIEWPORT_PRESETS = {
  // width/height は CSS ピクセル。deviceScaleFactor × CSS サイズ = 物理解像度
  phone:    { name: 'phone',    label: 'Phone',     width: 360,  height: 800,  deviceScaleFactor: 3, physicalLabel: '1080×2400' },
  tablet7:  { name: 'tablet7',  label: '7" Tablet', width: 600,  height: 960,  deviceScaleFactor: 2, physicalLabel: '1200×1920' },
  tablet10: { name: 'tablet10', label: '10" Tablet',width: 800,  height: 1280, deviceScaleFactor: 2, physicalLabel: '1600×2560' },
};

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
  });
}

function runCmd(cmd, args, opts = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, {
      encoding: 'utf-8', shell: process.platform === 'win32',
      timeout: opts.timeout || 10000,
    }, (err, stdout, stderr) => resolve({ ok: !err, stdout: stdout.trim(), stderr: stderr.trim(), err }));
  });
}

function configPath(projectPath) {
  return path.join(CONFIG_DIR, `pw_routes_${hashPath(projectPath)}.json`);
}

function defaultConfig() {
  return {
    baseUrl:   'http://localhost:8080',
    routes:    [{ name: 'home', path: '/' }],
    viewports: ['phone'],
    recordVideo: false,
    convertGif:  false,
    convertMp4:  false,
  };
}

async function checkStatus() {
  const [pwCheck, ffCheck] = await Promise.all([
    runCmd('node', ['-e', "require('playwright');console.log('ok')"], { timeout: 5000 }),
    runCmd('ffmpeg', ['-version'], { timeout: 5000 }),
  ]);
  return {
    playwright: pwCheck.ok && pwCheck.stdout.includes('ok'),
    ffmpeg:     ffCheck.ok,
  };
}

async function convertVideo(webmPath, format, ffmpegArgs) {
  const ext  = format === 'gif' ? '.gif' : '.mp4';
  const dest = webmPath.replace(/\.webm$/, ext);
  const args = [...ffmpegArgs, '-y', '-i', webmPath, dest];
  const r = await runCmd('ffmpeg', args, { timeout: 60000 });
  return r.ok ? dest : null;
}

async function handlePwCapture(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  const pathname = url.pathname;

  // GET /api/pw/status
  if (pathname === '/api/pw/status' && req.method === 'GET') {
    const status = await checkStatus();
    res.writeHead(200);
    return res.end(JSON.stringify(status));
  }

  // GET /api/pw/presets
  if (pathname === '/api/pw/presets' && req.method === 'GET') {
    res.writeHead(200);
    return res.end(JSON.stringify({ presets: Object.values(VIEWPORT_PRESETS) }));
  }

  // GET /api/pw/config?path=
  if (pathname === '/api/pw/config' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const cfgFile = configPath(p);
    const cfg = fs.existsSync(cfgFile)
      ? JSON.parse(fs.readFileSync(cfgFile, 'utf-8'))
      : defaultConfig();
    res.writeHead(200);
    return res.end(JSON.stringify(cfg));
  }

  // POST /api/pw/config  { path, ...config }
  if (pathname === '/api/pw/config' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, ...cfg } = body;
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    fs.writeFileSync(configPath(p), JSON.stringify(cfg, null, 2), 'utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }

  // POST /api/pw/capture  { path }  — 同期実行（最大120秒）
  if (pathname === '/api/pw/capture' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p } = body;
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }

    const cfgFile = configPath(p);
    const cfg = fs.existsSync(cfgFile)
      ? JSON.parse(fs.readFileSync(cfgFile, 'utf-8'))
      : defaultConfig();

    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputDir = path.join(p, 'screenshots', 'store', ts);

    const captureConfig = {
      baseUrl:     cfg.baseUrl,
      routes:      cfg.routes,
      viewports:   (cfg.viewports || ['phone']).map(k => VIEWPORT_PRESETS[k]).filter(Boolean),
      recordVideo: cfg.recordVideo || false,
      outputDir,
    };

    const tmpCfg = path.join(os.tmpdir(), `pw_cfg_${Date.now()}.json`);
    fs.writeFileSync(tmpCfg, JSON.stringify(captureConfig), 'utf-8');

    const result = await new Promise(resolve => {
      execFile('node', [CAPTURE_SCRIPT, tmpCfg], {
        encoding: 'utf-8', timeout: 120000,
        shell: process.platform === 'win32',
      }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpCfg); } catch { /* ignore */ }
        if (err) {
          if (stderr.includes('ERR_NO_PLAYWRIGHT')) {
            return resolve({ ok: false, error: 'playwright_not_installed' });
          }
          return resolve({ ok: false, error: err.message, stderr });
        }
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve({ ok: false, error: 'parse_error', stdout });
        }
      });
    });

    if (!result.ok) {
      res.writeHead(500);
      return res.end(JSON.stringify(result));
    }

    // ffmpeg 変換
    const convResults = [];
    if ((cfg.convertGif || cfg.convertMp4) && result.results) {
      for (const r of result.results.filter(r => r.type === 'video')) {
        if (cfg.convertGif) {
          const gifPath = await convertVideo(r.file, 'gif', [
            '-vf', 'fps=10,scale=480:-1:flags=lanczos',
          ]);
          if (gifPath) convResults.push({ type: 'gif', viewport: r.viewport, route: r.route, file: gifPath });
        }
        if (cfg.convertMp4) {
          const mp4Path = await convertVideo(r.file, 'mp4', [
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
          ]);
          if (mp4Path) convResults.push({ type: 'mp4', viewport: r.viewport, route: r.route, file: mp4Path });
        }
      }
    }

    result.results = [...(result.results || []), ...convResults];
    result.outputDir = outputDir;
    // 次回セッション選択で再表示できるよう結果を保存
    fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify(result), 'utf-8');
    res.writeHead(200);
    return res.end(JSON.stringify(result));
  }

  // GET /api/pw/session?path=&ts=  — セッション結果 JSON を返す
  if (pathname === '/api/pw/session' && req.method === 'GET') {
    const p  = url.searchParams.get('path');
    const ts = url.searchParams.get('ts');
    if (!p || !ts) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path and ts required' })); }
    const rFile = path.join(p, 'screenshots', 'store', ts, 'results.json');
    if (!fs.existsSync(rFile)) { res.writeHead(404); return res.end(JSON.stringify({ error: 'not found' })); }
    res.writeHead(200);
    return res.end(fs.readFileSync(rFile));
  }

  // GET /api/pw/results?path=  — 過去キャプチャ一覧（最新10件）
  if (pathname === '/api/pw/results' && req.method === 'GET') {
    const p = url.searchParams.get('path');
    if (!p) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path required' })); }
    const storeDir = path.join(p, 'screenshots', 'store');
    if (!fs.existsSync(storeDir)) {
      res.writeHead(200);
      return res.end(JSON.stringify({ sessions: [] }));
    }
    const dirs = fs.readdirSync(storeDir)
      .filter(d => fs.statSync(path.join(storeDir, d)).isDirectory())
      .sort().reverse().slice(0, 10);
    res.writeHead(200);
    return res.end(JSON.stringify({ sessions: dirs }));
  }

  // POST /api/pw/session/delete  { path, ts } — セッションディレクトリを丸ごと削除
  if (pathname === '/api/pw/session/delete' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, ts } = body;
    if (!p || !ts) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path and ts required' })); }
    // パストラバーサル防止: ts はディレクトリ名のみ（/ を含まない）
    if (ts.includes('/') || ts.includes('\\') || ts.includes('..')) {
      res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid ts' }));
    }
    const sessionDir = path.join(p, 'screenshots', 'store', ts);
    if (!fs.existsSync(sessionDir)) { res.writeHead(404); return res.end(JSON.stringify({ error: 'not found' })); }
    fs.rmSync(sessionDir, { recursive: true, force: true });
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }

  // POST /api/pw/file/delete  { path, filePath } — 単一ファイルを削除
  if (pathname === '/api/pw/file/delete' && req.method === 'POST') {
    const body = await readBody(req);
    const { path: p, filePath } = body;
    if (!p || !filePath) { res.writeHead(400); return res.end(JSON.stringify({ error: 'path and filePath required' })); }
    // パストラバーサル防止: filePath がプロジェクトの screenshots/store/ 以下であること
    const storeDir = path.join(p, 'screenshots', 'store');
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(storeDir))) {
      res.writeHead(403); return res.end(JSON.stringify({ error: 'forbidden' }));
    }
    if (!fs.existsSync(resolved)) { res.writeHead(404); return res.end(JSON.stringify({ error: 'not found' })); }
    fs.unlinkSync(resolved);
    // results.json からも該当エントリを除去
    const resultsFile = path.join(path.dirname(resolved), '..', 'results.json');
    if (fs.existsSync(resultsFile)) {
      try {
        const r = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
        r.results = (r.results || []).filter(e => path.resolve(e.file) !== resolved);
        fs.writeFileSync(resultsFile, JSON.stringify(r), 'utf-8');
      } catch { /* 壊れていても削除自体は成功 */ }
    }
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true }));
  }

  // GET /api/pw/file?path=<absolute-path>  — ファイル配信（PNG/WebM/GIF/MP4）
  if (pathname === '/api/pw/file' && req.method === 'GET') {
    const filePath = url.searchParams.get('path');
    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'not found' }));
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = { '.png': 'image/png', '.webm': 'video/webm', '.gif': 'image/gif', '.mp4': 'video/mp4' }[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.writeHead(200);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = { handlePwCapture };
