// index.js —— peach /api/* 读接口（Day 17 · Web 函数版）
//
// 今天要解决的问题：**页面上那份词库，凭什么相信它是真的？**
// Day 13 之前它是浏览器里写死的假数据（public/mock.js）；今天起它来自云数据库——
// Day 16 建的 scenes / names 两张表。接口就是"把数据库里的东西端出来"的那个窗口。
//
// ---------------------------------------------------------------------------
// 一、为什么还是 Web 函数（Day 15 踩过的坑，这里再钉一遍）
//   CloudBase 的 Web 函数不是"平台调用你的 main 函数"，而是"你自己起一个 HTTP 服务，
//   平台把公网请求反向代理过来"。所以这里用 Node 内置 http 模块起服务，监听 9000 端口，
//   平台侧靠 scf_bootstrap 启动它（见同目录）。
//
// 二、云函数怎么读到数据库（Day 17 新增的关键一步）
//   云函数不走 5432 端口直连，而是通过 CloudBase 的「数据网关」用 HTTPS 读写 PG：
//     https://<环境ID>.api.tcloudbasegateway.com/v1/rdb/rest/<表名>?<查询条件>
//   认证靠一把 API Key，存在**函数环境变量** CLOUDBASE_API_KEY 里。
//
//   比喻：数据库是档案室，网关是门口的收发窗口。云函数递一张条子（HTTPS 请求）说明
//         "我要 names 表里 scene_id=1 的那几行"，窗口核对工作证（API Key）后把档案递出来。
//         好处是：云函数不用知道数据库在哪台机器、端口多少、密码是什么；
//         坏处是：**这把钥匙绝不能出现在前端代码或仓库里**（它是 service_role 身份）。
//
// 三、今天的三个接口
//   GET /api/health            体检（Day 15 就有，保留）
//   GET /api/scenes            场景字典：scenes 表原样端出来
//   GET /api/library?scene=&keyword=&limit=
//                              词库查询：靠 names.scene_id → scenes.id 这根线
// ---------------------------------------------------------------------------

const http = require('http');

const SERVICE = 'peach-api';
const VERSION = '1.1.0';

// 环境 ID：云端运行时能从环境变量拿到；本地调试时用默认值兜底
const ENV_ID = process.env.TCB_ENV || 'apple-1-d2g1zk4836ce03980';
const REST_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// API Key（service_role）：只在服务端用，任何情况下都不返回给前端
const API_KEY = process.env.CLOUDBASE_API_KEY || '';

// 返回条数的默认值与上限 —— 这就是今天的「余力加练」：
// 给接口加一个简单查询参数 ?limit=N。上限必须有，否则 ?limit=999999 会被人拿来拖垮服务。
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

// CORS 不在这里做（Day 17 踩过的坑，记下来）：
//   CloudBase 的 HTTP 网关本身就会做一层 CORS——它会把你请求里的 Origin 回显到
//   Access-Control-Allow-Origin 上。如果函数里再自己塞一个 `*`，两边一拼就变成
//   "origin,*" 这种非法值（这个头只允许一个值），浏览器会直接拒绝整个响应，
//   前端看到的就是一句莫名其妙的 "Failed to fetch"。
//   所以：函数只管吐数据，跨域放行统一交给网关。

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', // 中文必须带 charset，否则乱码
    'Cache-Control': 'no-store',                       // 词库要的是"此刻"的数据，别缓存
  });
  res.end(JSON.stringify(obj));
}

// 通过数据网关查 PG，返回数组（失败就抛错，交给调用方统一兜底）
async function dbSelect(table, query) {
  if (!API_KEY) throw new Error('CLOUDBASE_API_KEY is not configured');
  const url = REST_BASE + '/' + table + (query ? '?' + query : '');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + API_KEY } });
  if (!r.ok) {
    const body = await r.text();
    throw new Error('gateway ' + r.status + ' on ' + table + ': ' + body.slice(0, 200));
  }
  return r.json();
}

// 只保留要给前端看的字段（表格里多余的列不往外端）
function pickName(row) {
  return { id: row.id, name: row.name, meaning: row.meaning, char_count: row.char_count };
}

// ---------------------------------------------------------------------------
// 接口 1：GET /api/health —— 体检
// ---------------------------------------------------------------------------
function handleHealth(res) {
  return send(res, 200, {
    ok: true,
    service: SERVICE,
    version: VERSION,
    time: new Date().toISOString(), // UTC ISO 8601
    runtime: 'nodejs',
    region: process.env.TENCENTCLOUD_REGION || 'ap-shanghai',
  });
}

// ---------------------------------------------------------------------------
// 接口 2：GET /api/scenes —— 场景字典（scenes 表原样列出）
// ---------------------------------------------------------------------------
async function handleScenes(res) {
  const rows = await dbSelect('scenes', 'select=id,name,sort_order&order=sort_order.asc');
  return send(res, 200, { ok: true, count: rows.length, data: rows });
}

// ---------------------------------------------------------------------------
// 接口 3：GET /api/library —— 词库查询（今天的正主）
//
// 流程就四步，每一步都能说清"为什么要这么做"：
//   ① 把前端传来的「场景名」（如"品牌"）换成「场景编号」——因为表里靠编号关联
//   ② 拿编号去 names 表里取这个名字场景下的所有词条
//   ③ 有关键词就在内存里过滤（名字或寓意里带这几个字就算命中）
//   ④ 排序、按 limit 截断，返回
// ---------------------------------------------------------------------------
async function handleLibrary(q, res) {
  const scene = (q.scene || '品牌').trim();
  const keyword = (q.keyword || '').trim();
  let limit = parseInt(q.limit, 10);
  if (!limit || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  // ① 场景名 → 场景编号
  const scenes = await dbSelect('scenes',
    'select=id,name&name=eq.' + encodeURIComponent(scene));
  if (!scenes.length) {
    // 说人话，并且告诉调用者"有哪些场景可用"（而不是丢一句 500）
    const all = await dbSelect('scenes', 'select=name&order=sort_order.asc');
    return send(res, 400, {
      ok: false,
      error: '没有「' + scene + '」这个场景',
      scenes: all.map(function (s) { return s.name; }),
    });
  }
  const sceneId = scenes[0].id;

  // ② 用关联字段 scene_id 取名字（这根线就是 Day 16 定的 names.scene_id → scenes.id）
  const rows = await dbSelect('names',
    'select=id,name,meaning,char_count&scene_id=eq.' + sceneId);

  // ③ 关键词过滤
  const hit = keyword
    ? rows.filter(function (r) {
        return r.name.indexOf(keyword) > -1 || r.meaning.indexOf(keyword) > -1;
      })
    : rows;

  // ④ 排序（短名字在前、同长度按编号）+ 截断到 limit
  hit.sort(function (a, b) { return (a.char_count - b.char_count) || (a.id - b.id); });
  const data = hit.slice(0, limit).map(pickName);

  return send(res, 200, {
    ok: true,
    scene: scene,
    keyword: keyword,
    count: data.length,
    total: hit.length,   // 过滤后一共几条（count 是被 limit 截过的条数）
    limit: limit,
    data: data,
  });
}

// ---------------------------------------------------------------------------
// 服务本体
// ---------------------------------------------------------------------------
const server = http.createServer(function (req, res) {
  Promise.resolve().then(async function () {
    const u = new URL(req.url || '/', 'http://localhost');
    const q = {};
    u.searchParams.forEach(function (v, k) { q[k] = v; });

    // 路径归一化（Day 17 部署时踩的坑，记在这里免得下次再踩）：
    //   CloudBase 的 HTTP 网关有个「路径传递（EnablePathTransmission）」开关。
    //   关着的时候，网关会把匹配到的前缀 /api 切掉再转给函数——
    //   于是 /api/scenes 到了函数里变成 /scenes，按 /api/scenes 去比就全 404 了。
    //   这里统一归一化成"去掉 /api 前缀"的短路径，开关开着关着都能对上。
    let pathname = u.pathname.replace(/\/+$/, '');      // 去掉结尾多余的 /
    pathname = pathname.replace(/^\/api(?=\/|$)/, '');  // 去掉开头的 /api（/api → 空）
    if (pathname === '') pathname = '/';

    // 浏览器的跨域预检：交给网关的 CORS 层应答，函数里不掺和
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    // 读接口：只放行 GET / HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { ok: false, error: '不支持的请求方式' });
    }

    try {
      if (pathname === '/health' || pathname === '/') {
        return handleHealth(res);
      }
      if (pathname === '/scenes') {
        return await handleScenes(res);
      }
      if (pathname === '/library') {
        return await handleLibrary(q, res);
      }
      return send(res, 404, { ok: false, error: '接口不存在' });
    } catch (err) {
      // 打日志给自己看（控制台能看到），返回给用户的一律是人话 —— A8 的硬要求
      console.error('[peach-api] ' + ((err && err.stack) || err));
      return send(res, 500, { ok: false, error: '词库读取失败，请稍后重试' });
    }
  });
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, '0.0.0.0', function () {
  console.log(SERVICE + ' listening on ' + PORT);
});
