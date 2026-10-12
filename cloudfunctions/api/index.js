// index.js —— peach /api/* 接口（Day 17 读接口 · Day 18 写接口 · Day 19 分层重构）
//
// Day 19 做了什么：**把"查数据库"那段代码从这里搬到了隔壁 db.js。**
//   现在这个文件只干两件事：
//     ① 路由层（route 函数）—— 看地址，把请求领到该去的柜台；
//     ② 业务层（handle* 函数）—— 定规矩（必填？超长？场景存在？）+ 把结果包装成响应。
//   至于"怎么跟数据库说话"，一行都不留在这儿了，全部委托给 db.js（数据访问层）。
//
//   为什么值得拆（三层比喻，记住这张图就够）：
//     ┌──────────────────────────────────────────────────────────────┐
//     │ index.js · 路由层   看地址，领请求到该去的柜台                    │  ← 像前台
//     │ index.js · 业务层   定规矩（必填/长度/场景存在）+ 包装结果         │  ← 像经理
//     │ db.js    · 数据层   只管数据怎么进出，不问你要它干嘛              │  ← 像档案室管理员
//     └──────────────────────────────────────────────────────────────┘
//   回报：以后要换一种方式连数据库（换 SDK、换连接串、换表、换库），只改 db.js；
//         换接口规则（必填变可选、加校验），只改本文件的业务层。两边互不牵扯。
//
// ---------------------------------------------------------------------------
// 一、为什么还是 Web 函数（Day 15 踩过的坑，这里再钉一遍）
//   CloudBase 的 Web 函数不是"平台调用你的 main 函数"，而是"你自己起一个 HTTP 服务，
//   平台把公网请求反向代理过来"。所以这里用 Node 内置 http 模块起服务，监听 9000 端口，
//   平台侧靠 scf_bootstrap 启动它（见同目录）。
//
// 二、云函数怎么读写数据库（Day 17 建立的路子 · Day 19 搬到 db.js）
//   简单说：不走 5432 直连，而是通过 CloudBase「数据网关」用 HTTPS 读写 PG，
//   认证靠函数环境变量里的 API Key。**所有细节都在 db.js**，本文件只 require 它。
//
// 三、接口清单（路径和字段都是契约，Day 19 一个都没动）
//   GET  /api/health            体检（Day 15 就有，保留）
//   GET  /api/scenes            场景字典：scenes 表原样端出来
//   GET  /api/library?scene=&keyword=&limit=
//                               词库查询：靠 names.scene_id → scenes.id 这根线
//   POST /api/names             （Day 18 新增）往词库写一个名字
// ---------------------------------------------------------------------------

const http = require('http');
const db = require('./db'); // ← Day 19：数据访问层（"查数据库"的代码都在这儿）

const SERVICE = 'peach-api';
const VERSION = '1.3.0'; // Day 19：分层重构版（接口形状没变，这个号只是"这批代码的出厂标记"）

// 各种上限 —— 上限必须有，否则 ?limit=999999 / 超长请求体会被人拿来拖垮服务
const DEFAULT_LIMIT = 40;   // Day 17 余力加练：GET /api/library 的默认条数
const MAX_LIMIT = 100;      // 同上，上限
const MAX_BODY = 4096;      // 请求体上限 4 KB（契约第 0 节）
const NAME_MAX = 20;        // 名字最多 20 个字（契约第 5 节）
const MEANING_MAX = 30;     // 寓意最多 30 个字（PRD A4）—— 超了截断，不报错

// ---------------------------------------------------------------------------
// 小工具（这些属于"业务层"的杂物间，和数据无关）
// ---------------------------------------------------------------------------

// CORS 不在这里做（Day 17 踩过的坑，记下来）：
//   CloudBase 的 HTTP 网关本身就会做一层 CORS——它会把你请求里的 Origin 回显到
//   Access-Control-Allow-Origin 上。如果函数里再自己塞一个 `*`，两边一拼就变成
//   "origin,*" 这种非法值（这个头只允许一个值），浏览器会直接拒绝整个响应，
//   前端看到的就是一句莫名其妙的 "Failed to fetch"。
//   所以：函数只管吐数据，跨域放行统一交给网关。

// ctx 是这次请求的日志上下文（Day 18 余力加练），可选传
function send(res, status, obj, ctx, note) {
  if (ctx && note) ctx.note = note;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', // 中文必须带 charset，否则乱码
    'Cache-Control': 'no-store',                       // 词库要的是"此刻"的数据，别缓存
  });
  res.end(JSON.stringify(obj));
}

// Day 18 余力加练：每次请求打一条结构化日志，方便以后排查
//   "[peach-api][req] {"t":"…","method":"POST","path":"/names","status":201,"ms":83,"ok":true,"note":"created id=75"}"
//   为什么要记 status / ms / note：出问题时能一眼看出"哪个请求、多久、成没成、为什么"，
//   不用去翻整个函数的源码猜。
function requestLog(ctx, res, ms) {
  console.log('[peach-api][req] ' + JSON.stringify({
    t: new Date().toISOString(),
    method: ctx.method,
    path: ctx.path,
    status: res.statusCode,
    ms: ms,
    ok: res.statusCode >= 200 && res.statusCode < 300,
    note: ctx.note || undefined,
  }));
}

// 按"人眼看到的字符"数数（Array.from 按码位拆，中文汉字 / emoji 都算 1 个）
function countChars(s) {
  return Array.from(String(s)).length;
}

// 只保留要给前端看的字段（表格里多余的列不往外端）
function pickName(row) {
  return { id: row.id, name: row.name, meaning: row.meaning, char_count: row.char_count };
}

// ---------------------------------------------------------------------------
// 接口 1：GET /api/health —— 体检
// ---------------------------------------------------------------------------
function handleHealth(res, ctx) {
  return send(res, 200, {
    ok: true,
    service: SERVICE,
    version: VERSION,
    time: new Date().toISOString(), // UTC ISO 8601
    runtime: 'nodejs',
    region: process.env.TENCENTCLOUD_REGION || 'ap-shanghai',
  }, ctx);
}

// ---------------------------------------------------------------------------
// 接口 2：GET /api/scenes —— 场景字典（scenes 表原样列出）
//   Day 19 前后对比：以前这里写的是 dbSelect('scenes', 'select=id,name,sort_order&…')，
//   现在只写 db.listScenes()——"怎么查"交给数据层，"查什么"一句话说清。
// ---------------------------------------------------------------------------
async function handleScenes(res, ctx) {
  const rows = await db.listScenes();
  return send(res, 200, { ok: true, count: rows.length, data: rows }, ctx, 'scenes=' + rows.length);
}

// ---------------------------------------------------------------------------
// 接口 3：GET /api/library —— 词库查询（Day 17 的主接口）
//
// 流程就四步，每一步都能说清"为什么要这么做"：
//   ① 把前端传来的「场景名」（如"品牌"）换成「场景编号」——因为表里靠编号关联
//   ② 拿编号去 names 表里取这个名字场景下的所有词条
//   ③ 有关键词就在内存里过滤（名字或寓意里带这几个字就算命中）
//   ④ 排序、按 limit 截断，返回
// ---------------------------------------------------------------------------
async function handleLibrary(q, res, ctx) {
  const scene = (q.scene || '品牌').trim();
  const keyword = (q.keyword || '').trim();
  let limit = parseInt(q.limit, 10);
  if (!limit || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  // ① 场景名 → 场景编号
  const sceneRow = await db.findSceneByName(scene);
  if (!sceneRow) {
    // 说人话，并且告诉调用者"有哪些场景可用"（而不是丢一句 500）
    const all = await db.listSceneNames();
    return send(res, 400, {
      ok: false,
      error: '没有「' + scene + '」这个场景',
      scenes: all,
    }, ctx, 'bad scene');
  }
  const sceneId = sceneRow.id;

  // ② 用关联字段 scene_id 取名字（这根线就是 Day 16 定的 names.scene_id → scenes.id）
  const rows = await db.listNamesByScene(sceneId);

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
  }, ctx, scene + '/' + data.length + 'of' + hit.length);
}

// ---------------------------------------------------------------------------
// 接口 4：POST /api/names —— 往词库写一个名字（Day 18 的主接口）
//
// 顺序很重要，而且每一步都对应"防住一种脏数据"：
//   ① 格式层：必填在不在？名字超长没？—— 缺的当场说清，进不了库
//   ② 关联层：这个场景真的存在吗？—— 不存在就拒绝（否则写入的名字会挂空）
//   ③ 归一化：char_count 由**服务端**数（前端传的一律不信）；
//              寓意超 30 字**截断**而不是报错（能兜住的不为难用户）
//   ④ 数据层：交给数据库唯一约束挡重复；把 23505 翻译成 409 中文
//          （"交给数据库拦"这件事写在 db.js 里——业务层只管把结果翻译成人话）
// ---------------------------------------------------------------------------
async function handleCreateName(payload, res, ctx) {
  // ① 格式层：必填 + 长度
  const scene = typeof payload.scene === 'string' ? payload.scene.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const rawMeaning = typeof payload.meaning === 'string' ? payload.meaning.trim() : '';

  if (!scene) {
    return send(res, 400, { ok: false, error: '缺少必填字段：scene（场景）' }, ctx, 'missing scene');
  }
  if (!name) {
    return send(res, 400, { ok: false, error: '缺少必填字段：name（名字）' }, ctx, 'missing name');
  }
  const nameLen = countChars(name);
  if (nameLen > NAME_MAX) {
    return send(res, 400, { ok: false, error: '名字最多 ' + NAME_MAX + ' 个字' }, ctx, 'name too long');
  }

  // ③ 归一化：寓意超长就截断（能兜住的不为难用户）
  let meaning = rawMeaning;
  let truncated = false;
  if (countChars(meaning) > MEANING_MAX) {
    meaning = Array.from(meaning).slice(0, MEANING_MAX).join('');
    truncated = true;
  }

  // ② 关联层：场景名 → 场景编号（这一步同时把"场景不存在"挡在门外）
  const sceneRow = await db.findSceneByName(scene);
  if (!sceneRow) {
    const all = await db.listSceneNames();
    return send(res, 400, {
      ok: false,
      error: '没有「' + scene + '」这个场景',
      scenes: all,
    }, ctx, 'bad scene');
  }
  const sceneId = sceneRow.id;

  // ④ 写入（char_count 是我们自己数的，不采用请求里的值）
  const ins = await db.insertName({
    scene_id: sceneId,
    name: name,
    meaning: meaning,
    char_count: nameLen,
  });

  // 成功：网关回 201 + 刚插入的那一行
  if (ins.status === 201) {
    let row = Array.isArray(ins.body) ? ins.body[0]
      : (ins.body && typeof ins.body === 'object' && ins.body.id ? ins.body : null);
    if (!row) {
      // 万一网关没带回插入行，就自己再查一次 —— 也就是"写入后读回"的双保险
      row = await db.findNameInScene(sceneId, name);
    }
    if (row) {
      return send(res, 201, {
        ok: true,
        data: {
          id: row.id,
          scene: scene,
          name: row.name,
          meaning: row.meaning,
          char_count: row.char_count,
          // 库里返回的是带 +08:00 的时间，按契约统一归一化成 UTC ISO 8601
          created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
        },
      }, ctx, 'created id=' + row.id + (truncated ? ' (meaning truncated)' : ''));
    }
    // 极罕见：写成功了但拿不到那一行 —— 也回 201，只是不带 data
    return send(res, 201, { ok: true, data: null }, ctx, 'created (no row returned)');
  }

  // 重复提交：数据库唯一约束 names_scene_name_key 拦下的
  //   翻译成人话 + 409 Conflict（"你要的东西已经在那儿了"）
  if (ins.status === 409 || String((ins.body && ins.body.code) || '').indexOf('23505') > -1) {
    return send(res, 409, {
      ok: false,
      error: '「' + scene + '」场景下已经有「' + name + '」这个名字了',
    }, ctx, 'duplicate');
  }

  // 其它：不是业务问题，是服务端/平台的错 → 抛出去走统一 500 兜底
  throw new Error('insert failed status=' + ins.status + ' body=' + JSON.stringify(ins.body).slice(0, 300));
}

// ---------------------------------------------------------------------------
// 请求体读取：带 4 KB 上限（契约第 0 节的硬约定）
//   返回 Promise<对象>；超限抛 {peachHttp:413}，JSON 坏抛 {peachHttp:400}，
//   由上层翻译成中文响应。
// ---------------------------------------------------------------------------
function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_BODY) {
        // 超限：不再往内存里存（剩下的数据照样收完、丢掉），
        // 等 'end' 再回 413 —— 如果这里直接 destroy，客户端会收到"连接被重置"
        // 而不是我们那句中文的「请求内容太大」。
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () {
      if (tooLarge) {
        return reject(Object.assign(new Error('body too large'), { peachHttp: 413 }));
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve({}); // 空体：当作"什么都没填"，交给字段校验给中文提示
      let obj;
      try {
        obj = JSON.parse(text);
      } catch (e) {
        return reject(Object.assign(new Error('bad json'), { peachHttp: 400 }));
      }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return reject(Object.assign(new Error('bad shape'), { peachHttp: 400 }));
      }
      resolve(obj);
    });
    req.on('error', function (e) { reject(e); });
  });
}

// ---------------------------------------------------------------------------
// 路由 + 服务本体
// ---------------------------------------------------------------------------
async function route(req, res, ctx) {
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
  ctx.path = pathname;

  // 浏览器的跨域预检：交给网关的 CORS 层应答，函数里不掺和
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // ---- 读：GET / HEAD ----
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (pathname === '/health' || pathname === '/') return handleHealth(res, ctx);
    if (pathname === '/scenes') return await handleScenes(res, ctx);
    if (pathname === '/library') return await handleLibrary(q, res, ctx);
    // 知道这个地址存在，但读它没意义 → 405（比 404 更能说清楚问题）
    if (pathname === '/names') {
      return send(res, 405, { ok: false, error: '该地址只接受 POST 请求' }, ctx, 'method not allowed');
    }
    return send(res, 404, { ok: false, error: '接口不存在' }, ctx, 'not found');
  }

  // ---- 写：POST ----
  if (req.method === 'POST') {
    if (pathname === '/names') {
      let payload;
      try {
        payload = await readJsonBody(req);
      } catch (e) {
        if (e && e.peachHttp === 413) {
          return send(res, 413, { ok: false, error: '请求内容太大' }, ctx, 'body too large');
        }
        if (e && e.peachHttp === 400) {
          return send(res, 400, { ok: false, error: '请求格式不对，请刷新页面重试' }, ctx, 'bad json');
        }
        throw e;
      }
      return await handleCreateName(payload, res, ctx);
    }
    // 读接口不接受 POST
    if (pathname === '/health' || pathname === '/scenes' || pathname === '/library') {
      return send(res, 405, { ok: false, error: '该地址只接受 GET 请求' }, ctx, 'method not allowed');
    }
    return send(res, 404, { ok: false, error: '接口不存在' }, ctx, 'not found');
  }

  // 其它动词（PUT / PATCH / DELETE …）：第 4 周才做，今天明确拒绝
  return send(res, 405, { ok: false, error: '不支持的请求方式' }, ctx, 'method not allowed');
}

const server = http.createServer(function (req, res) {
  const started = Date.now();
  const ctx = { method: req.method, path: '-', note: '' };
  route(req, res, ctx)
    .catch(function (err) {
      // 打日志给自己看（控制台能看到），返回给用户的一律是人话 —— A8 的硬要求
      console.error('[peach-api][err] ' + ((err && err.stack) || err));
      if (!res.headersSent) {
        send(res, 500, { ok: false, error: '词库读取失败，请稍后重试' }, ctx, 'server error');
      }
    })
    .finally(function () {
      requestLog(ctx, res, Date.now() - started);
    });
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, '0.0.0.0', function () {
  console.log(SERVICE + ' listening on ' + PORT);
});
