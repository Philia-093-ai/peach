// index.js —— peach /api/health 体检接口（Day 15 · Web 函数版）
//
// 为什么是这个写法（重要）：
//   CloudBase 的 **Web 函数**不是"平台调用你的 main 函数"，而是"你起一个 HTTP 服务，
//   平台把公网请求反向代理过来"。所以这里用 Node 内置 http 模块起服务，监听 9000 端口。
//   平台侧还会用 scf_bootstrap 脚本启动它（见同目录 scf_bootstrap）。
//
// 比喻：普通云函数像"点一次外卖做一次菜"；Web 函数像"开一个常驻窗口"，
//       客人（公网请求）来了直接递给窗口，不用每次都重新开张。

const http = require('http');

// 服务标识与版本，和 docs/api-contract.md 里的约定严格一致
const SERVICE = 'peach-health';
const VERSION = '1.0.0';

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', // 体检结果不该被缓存——要的是"此刻"的状态
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  // 只放行 GET / HEAD（体检接口是只读的）
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { ok: false, error: '不支持的请求方式' });
  }

  // 平台可能把路径配成 /api/health 或 /health，两种都认；根路径也给个提示
  if (pathname === '/api/health' || pathname === '/health' || pathname === '/') {
    return json(res, 200, {
      ok: true,
      service: SERVICE,
      version: VERSION,
      time: new Date().toISOString(), // UTC ISO 8601
      runtime: 'nodejs',
      region: process.env.TENCENTCLOUD_REGION || 'ap-shanghai',
    });
  }

  return json(res, 404, { ok: false, error: '接口不存在' });
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(SERVICE + ' listening on ' + PORT);
});
