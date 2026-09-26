// server.js —— peach MVP 后端（Day 7 版）
// 只有两件事：① 把 public/ 目录作为静态站点；② 提供 1 个接口 POST /api/generate
// 运行：node server.js   （无需 npm install，全部用 Node 内置模块）

const http = require('http');
const fs = require('fs');
const path = require('path');
const { generate } = require('./lib/generator');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TIMEOUT_MS = 10000; // PRD A3/A8：10 秒时效在服务端兜底

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

// 接口：场景 + 关键词 → 名字列表（失败返回人类能看懂的一句话，绝不返回堆栈）
function handleGenerate(res, raw) {
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    sendJson(res, 504, { ok: false, error: '生成超时，请重试' });
  }, TIMEOUT_MS);
  const finish = (fn) => {
    if (timedOut) return;
    clearTimeout(timer);
    fn();
  };

  let data;
  try {
    data = JSON.parse(raw.toString('utf-8') || '{}');
  } catch {
    return finish(() => sendJson(res, 400, { ok: false, error: '请求格式不对，请刷新页面重试' }));
  }

  const scene = typeof data.scene === 'string' && data.scene.trim() ? data.scene.trim() : '品牌';
  const keyword = typeof data.keyword === 'string' ? data.keyword.trim() : '';

  if (!keyword) {
    return finish(() => sendJson(res, 400, { ok: false, error: '关键词不能为空' }));
  }
  if ([...keyword].length > 20) {
    return finish(() => sendJson(res, 400, { ok: false, error: '关键词最多 20 个字' }));
  }

  let names;
  try {
    names = generate(scene, keyword, 6);
  } catch {
    return finish(() => sendJson(res, 500, { ok: false, error: '生成失败，请重试' }));
  }
  if (!names || names.length === 0) {
    return finish(() => sendJson(res, 500, { ok: false, error: '生成失败，请重试' }));
  }

  return finish(() => sendJson(res, 200, { ok: true, scene, keyword, names }));
}

// 静态文件：只允许读 public/ 里面的东西
function serveStatic(pathname, res) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 Bad Request');
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendJson(res, 400, { ok: false, error: '请求地址不对' });
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    let size = 0;
    const chunks = [];
    let broken = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > 4096) {
        broken = true;
        sendJson(res, 413, { ok: false, error: '请求内容太大' });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!broken) handleGenerate(res, Buffer.concat(chunks));
    });
    req.on('error', () => {});
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { ok: false, error: '不支持的请求方式' });
  }
  serveStatic(url.pathname, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`peach MVP 已启动：http://localhost:${PORT}`);
  console.log('按 Ctrl+C 停止服务');
});
