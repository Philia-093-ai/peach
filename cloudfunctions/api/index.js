// index.js —— peach /api/* 接口（Day 17 读接口 · Day 18 加写入接口）
//
// 今天要解决的问题：**别人往我库里写东西，我怎么保证写进去的是干净的？**
//   ① 必填没填 / 名字超长 / JSON 坏掉 / 请求体太大 → 明确拒绝，用中文说清错在哪；
//   ② 场景名不存在 → 拒绝（否则这条名字会变成挂在空处的孤儿数据）；
//   ③ 同一个场景里重复写同一个名字 → 拒绝。
//      注意③不是靠函数里"先查一遍"实现的 —— 那样两个请求同时进来会双双通过。
//      真正的闸门是数据库中 Day 16 建表时就埋下的唯一约束
//      names_scene_name_key (scene_id, name)：它是原子的，同一瞬间只可能有一个成功。
//      函数只负责把数据库的报错（DATABASE_23505）翻译成一句人话。
//
// 一句话记住今天：**前端校验是为了省用户的时间，服务端校验是为了保数据的干净，
//                 而数据库约束是最后一扇关得上、且关得死的门。**
//
// ---------------------------------------------------------------------------
// 一、为什么还是 Web 函数（Day 15 踩过的坑，这里再钉一遍）
//   CloudBase 的 Web 函数不是"平台调用你的 main 函数"，而是"你自己起一个 HTTP 服务，
//   平台把公网请求反向代理过来"。所以这里用 Node 内置 http 模块起服务，监听 9000 端口，
//   平台侧靠 scf_bootstrap 启动它（见同目录）。
//
// 二、云函数怎么读写数据库（Day 17 建立的路子）
//   云函数不走 5432 端口直连，而是通过 CloudBase 的「数据网关」用 HTTPS 读写 PG：
//     https://<环境ID>.api.tcloudbasegateway.com/v1/rdb/rest/<表名>?<查询条件>
//   认证靠一把 API Key，存在**函数环境变量** CLOUDBASE_API_KEY 里。
//
//   比喻：数据库是档案室，网关是门口的收发窗口。云函数递一张条子（HTTPS 请求）说明
//         "我要 names 表里 scene_id=1 的那几行"，窗口核对工作证（API Key）后把档案递出来。
//         读是 GET 条子，写是 POST 条子（Day 18 新增）。
//         坏处是：**这把钥匙绝不能出现在前端代码或仓库里**（它是 service_role 身份）。
//
// 三、接口清单
//   GET  /api/health            体检（Day 15 就有，保留）
//   GET  /api/scenes            场景字典：scenes 表原样端出来
//   GET  /api/library?scene=&keyword=&limit=
//                               词库查询：靠 names.scene_id → scenes.id 这根线
//   POST /api/names             （Day 18 新增）往词库写一个名字 —— 第一个写接口
// ---------------------------------------------------------------------------

const http = require('http');

const SERVICE = 'peach-api';
const VERSION = '1.2.0';

// 环境 ID：云端运行时能从环境变量拿到；本地调试时用默认值兜底
const ENV_ID = process.env.TCB_ENV || 'apple-1-d2g1zk4836ce03980';
const REST_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// API Key（service_role）：只在服务端用，任何情况下都不返回给前端
const API_KEY = process.env.CLOUDBASE_API_KEY || '';

// 各种上限 —— 上限必须有，否则 ?limit=999999 / 超长请求体会被人拿来拖垮服务
const DEFAULT_LIMIT = 40;   // Day 17 余力加练：GET /api/library 的默认条数
const MAX_LIMIT = 100;      // 同上，上限
const MAX_BODY = 4096;      // 请求体上限 4 KB（契约第 0 节）
const NAME_MAX = 20;        // 名字最多 20 个字（契约第 5 节）
const MEANING_MAX = 30;     // 寓意最多 30 个字（PRD A4）—— 超了截断，不报错

// ---------------------------------------------------------------------------
// 小工具
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

// 通过数据网关往 PG 写一行（Day 18 新增）
// 注意：这里**不把错误当异常抛**，而是把状态码和响应体原样交回去 ——
//       因为"重复提交"是一种**正常的业务结果**（要翻译成 409 人话），
//       而不是"服务器坏了"（那才是 500）。
async function dbInsert(table, row) {
  if (!API_KEY) throw new Error('CLOUDBASE_API_KEY is not configured');
  const r = await fetch(REST_BASE + '/' + table, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + API_KEY,
      'Content-Type': 'application/json; charset=utf-8',
      Prefer: 'return=representation', // 让网关把刚插进去的那一行回给我们（省一次查询）
    },
    body: JSON.stringify(row),
  });
  const text = await r.text();
  let body = text;
  try { body = JSON.parse(text); } catch (e) { /* 保持原样字符串，便于排查 */ }
  return { status: r.status, body: body };
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
// ---------------------------------------------------------------------------
async function handleScenes(res, ctx) {
  const rows = await dbSelect('scenes', 'select=id,name,sort_order&order=sort_order.asc');
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
  const scenes = await dbSelect('scenes',
    'select=id,name&name=eq.' + encodeURIComponent(scene));
  if (!scenes.length) {
    // 说人话，并且告诉调用者"有哪些场景可用"（而不是丢一句 500）
    const all = await dbSelect('scenes', 'select=name&order=sort_order.asc');
    return send(res, 400, {
      ok: false,
      error: '没有「' + scene + '」这个场景',
      scenes: all.map(function (s) { return s.name; }),
    }, ctx, 'bad scene');
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
  const scenes = await dbSelect('scenes',
    'select=id,name&name=eq.' + encodeURIComponent(scene));
  if (!scenes.length) {
    const all = await dbSelect('scenes', 'select=name&order=sort_order.asc');
    return send(res, 400, {
      ok: false,
      error: '没有「' + scene + '」这个场景',
      scenes: all.map(function (s) { return s.name; }),
    }, ctx, 'bad scene');
  }
  const sceneId = scenes[0].id;

  // ④ 写入（char_count 是我们自己数的，不采用请求里的值）
  const ins = await dbInsert('names', {
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
      const back = await dbSelect('names',
        'select=id,name,meaning,char_count,created_at&scene_id=eq.' + sceneId +
        '&name=eq.' + encodeURIComponent(name));
      row = back[0];
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
