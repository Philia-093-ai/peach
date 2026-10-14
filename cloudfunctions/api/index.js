// index.js —— peach /api/* 接口（Day 17 读接口 · Day 18 写接口 · Day 19 分层重构 · Day 22 改/删/恢复 · Day 23 错误提示统一）
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
//   GET    /api/health            体检（Day 15 就有，保留）
//   GET    /api/scenes            场景字典：scenes 表原样端出来
//   GET    /api/library?scene=&keyword=&limit=
//                                 词库查询：靠 names.scene_id → scenes.id 这根线
//   POST   /api/names             （Day 18 新增）往词库写一个名字
//   PATCH  /api/names/:id         （Day 22 新增）改一条：只改传进来的字段
//   DELETE /api/names/:id?confirm=<名字>&mode=soft|hard
//                                 （Day 22 新增）删一条：**默认软删除**，可恢复
//   POST   /api/names/:id/restore （Day 22 新增）把软删除的那条找回来
//
// 四、Day 22 的一条硬规矩：删除必须"两把钥匙"
//   「新增」错了顶多留一条废数据，「删除」错了就没了 —— 所以删除这条路设了两道确认：
//     ① 服务端：必须带 ?confirm=<这个名字>，且必须和库里那条的名字一字不差，
//        少一个字都不删（200 字 → 不是"能不能删"的问题，是"你到底删的是哪条"）；
//     ② 前端：词库页的删除按钮点一下只变成「确认删除？」，再点一下才真的发请求。
//   再加一层兜底：默认走**软删除**（只翻标记，数据还在），真要抹掉得显式写 mode=hard。
//
// 五、Day 23：错误也讲"三大类"（今天的新规矩）
//   以前每个报错各写各的，用户看到的是一句句孤立的话，分不清"我该改哪里"。今天把错误
//   归成**三大类**，同一个接口里出现哪一类，说的话都长一个样（都带一个 type 标签）：
//     ┌────────────────────────────────────────────────────────────────┐
//     │ ① 请求有问题  400 / 405 / 409 / 413   —— 你发来的东西不对，改一改再来  │
//     │ ② 找不到      404                     —— 你要的那条不在（可能被删了）  │
//     │ ③ 服务异常    500                     —— 不是你的问题，稍后再试       │
//     └────────────────────────────────────────────────────────────────┘
//   为什么值得统一：**「重试有没有用」是分界线**——① 和 ② 重试一百次都一样，界面就不该给
//   重试按钮；③ 是"这次不走运"，给重试才有意义。顺带一提，前端也照这三类把状态码翻译成
//   人话（见 public/mock.js 的 humanizeHttp），两边用同一套分类，才不会各说各话。
//   实现上只在 send() 里补一个 type 字段（响应形状仍向后兼容，老前端忽略它就行）。
// ---------------------------------------------------------------------------

const http = require('http');
const db = require('./db'); // ← Day 19：数据访问层（"查数据库"的代码都在这儿）

const SERVICE = 'peach-api';
const VERSION = '1.5.0'; // Day 23：错误提示统一成三大类（响应形状向后兼容，接口契约不变）

// 各种上限 —— 上限必须有，否则 ?limit=999999 / 超长请求体会被人拿来拖垮服务
const DEFAULT_LIMIT = 40;   // Day 17 余力加练：GET /api/library 的默认条数
const MAX_LIMIT = 100;      // 同上，上限
const MAX_BODY = 4096;      // 请求体上限 4 KB（契约第 0 节）
const NAME_MAX = 20;        // 名字最多 20 个字（契约第 5 节）
const MEANING_MAX = 30;     // 寓意最多 30 个字（PRD A4）—— 超了截断，不报错

// ---------------------------------------------------------------------------
// Day 23：错误三大类 —— 话术与形状的统一就靠这一小段
// ---------------------------------------------------------------------------
// 分类只看状态码，不看是哪个接口：同一个数字，不管出现在读、写还是删，
// 说的都是同一类话。这样用户（和前端）面对任何一条报错，都只需判断三件事之一。
function errKind(status) {
  if (status >= 500) return '服务异常'; // ③ 不是你的问题，稍后再试
  if (status === 404) return '找不到';   // ② 你要的那条不在（可能已经被删了）
  return '请求有问题';                   // ① 400 / 405 / 409 / 413 … 改一改再来
}

// ③ 服务异常时，按"这次在做什么事"换一句话说 —— 比一句万能话更贴切
//   （同样是数据库连不上："读"是取不到数据，"写"是没保存上，"删"是没删成功）
const ERR500 = {
  read:  '词库读取失败，请稍后重试',
  write: '词条写入失败，请稍后重试',
  del:   '删除没有完成，请稍后重试',
};

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
//
// Day 23：「三类错误统一」就落在这个函数里 —— 凡是 4xx / 5xx 的响应，
//   自动补上一个 type 标签（请求有问题 / 找不到 / 服务异常）。
//   为什么要在这里统一而不是每个报错手写：手写就有写漏、写岔的可能；
//   放在唯一的出口上，**一条错误都跑不掉**，格式也不可能不一致。
function send(res, status, obj, ctx, note) {
  if (ctx && note) ctx.note = note;
  if (status >= 400 && obj && typeof obj === 'object' && obj.ok === false && !obj.type) {
    obj = Object.assign({ type: errKind(status) }, obj); // { type, ok:false, error } —— 新字段向后兼容
  }
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
// Day 22 的小工具：把「地址里的编号」这件事收拢在一处
// ---------------------------------------------------------------------------

// 从路径里取出 /names/<编号> 的编号；不是这个形状就返回 null
//   /names/12        → '12'
//   /names/12/restore→ null（restore 由 POST 分支单独比对）
function matchNameId(pathname) {
  const m = /^\/names\/([^\/]+)$/.exec(pathname || '');
  return m ? m[1] : null;
}

// 编号必须是正整数：'12' → 12；'abc' / '-3' / '1.5' / '1e3' → null
//   为什么自己判而不靠数据库：地址写错了要说"地址写错了"（400），
//   而不是含混地回一句 404，让人以为是"数据没了"。
function parseId(raw) {
  if (!/^\d+$/.test(String(raw || ''))) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

// 地址里的编号不对时，统一回这一句（并且示范一个正确写法）
function badId(raw, res, ctx) {
  return send(res, 400, {
    ok: false,
    error: '地址里的编号不对：需要一个正整数，例如 /api/names/12（你给的是「' + raw + '」）',
  }, ctx, 'bad id');
}

// 读请求体 + 把 413/400 翻译成中文（POST 与 PATCH 共用，行为与 Day 18 完全一致）
//   返回 { payload } 或 null（null 表示已经回过错误响应了，调用方直接 return）
async function readBody(req, res, ctx) {
  try {
    return { payload: await readJsonBody(req) };
  } catch (e) {
    if (e && e.peachHttp === 413) {
      send(res, 413, { ok: false, error: '请求内容太大' }, ctx, 'body too large');
      return null;
    }
    if (e && e.peachHttp === 400) {
      send(res, 400, { ok: false, error: '请求格式不对，请刷新页面重试' }, ctx, 'bad json');
      return null;
    }
    throw e;
  }
}

// 把库里的 scene_id 翻成前端看得懂的场景名（响应里带场景名，前端才好显示"哪个场景下的"）
async function sceneNameOf(sceneId) {
  const s = await db.findSceneById(sceneId);
  return s ? s.name : null;
}

// 一条词条 → 响应里的 data（POST / PATCH / DELETE / restore 共用同一张脸）
async function namePayload(row, sceneName) {
  return {
    id: row.id,
    scene: sceneName || (await sceneNameOf(row.scene_id)),
    name: row.name,
    meaning: row.meaning,
    char_count: row.char_count,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
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
// 接口 5：PATCH /api/names/:id —— 改一条（Day 22 的主接口之一）
//
// 「PATCH」和「PUT」的区别，一句话：PATCH 是"补一块"，PUT 是"整份替换"。
//   这里用 PATCH：只想改寓意就只传 meaning，名字一个字都不会被动到。
//
// 顺序和 POST 一样，一步挡一种脏数据：
//   ① 编号：地址里那个必须是正整数（400）
//   ② 字段：至少要有一个可改字段（name / meaning）；改名字要过"非空 + ≤20 字"
//   ③ 存在性：这条还在不在？软删掉的也算不在 → 404（说清楚"可能已经被删了"）
//   ④ 一致性：改了名字要**重算 char_count**（服务端自己数，不信前端）
//   ⑤ 唯一性：同场景里改成已有的名字 → 交给数据库部分唯一索引挡 → 409 中文
// ---------------------------------------------------------------------------
async function handlePatchName(id, payload, res, ctx) {
  // ② 字段层：只认 name / meaning 两个可改字段
  const hasName = Object.prototype.hasOwnProperty.call(payload, 'name');
  const hasMeaning = Object.prototype.hasOwnProperty.call(payload, 'meaning');
  if (!hasName && !hasMeaning) {
    return send(res, 400, {
      ok: false,
      error: '没有要修改的字段（可改：name 名字 / meaning 寓意）',
    }, ctx, 'no updatable field');
  }

  const fields = {};

  if (hasName) {
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) {
      return send(res, 400, { ok: false, error: '名字不能改成空的' }, ctx, 'empty name');
    }
    const nameLen = countChars(name);
    if (nameLen > NAME_MAX) {
      return send(res, 400, { ok: false, error: '名字最多 ' + NAME_MAX + ' 个字' }, ctx, 'name too long');
    }
    fields.name = name;
    fields.char_count = nameLen; // ④ 改名字必须同时重算字数，否则词库筛选会筛错
  }

  let truncated = false;
  if (hasMeaning) {
    let meaning = typeof payload.meaning === 'string' ? payload.meaning.trim() : '';
    if (countChars(meaning) > MEANING_MAX) {
      meaning = Array.from(meaning).slice(0, MEANING_MAX).join('');
      truncated = true;
    }
    fields.meaning = meaning;   // 空字符串是允许的：那就是"这条暂时没有寓意"
  }

  // ③ 存在性：软删掉的那条也算不存在（它不该被改，要改先恢复）
  const row = await db.findNameById(id);
  if (!row) {
    return send(res, 404, {
      ok: false,
      error: '没有编号为 ' + id + ' 的名字（它可能已经被删掉了）',
    }, ctx, 'not found');
  }

  // ⑤ 落库
  const upd = await db.updateName(id, fields);

  if (upd.status === 200 || upd.status === 204) {
    let fresh = Array.isArray(upd.body) ? upd.body[0] : null;
    if (!fresh) fresh = await db.findNameById(id); // 网关没带回新行就自己读一次（双保险）
    return send(res, 200, {
      ok: true,
      data: await namePayload(Object.assign({}, row, fresh || {}), null),
    }, ctx, 'updated id=' + id + (truncated ? ' (meaning truncated)' : ''));
  }

  // 改名撞上同场景里已有的名字（部分唯一索引 names_scene_name_live_key 挡下的）
  if (upd.status === 409 || String((upd.body && upd.body.code) || '').indexOf('23505') > -1) {
    return send(res, 409, {
      ok: false,
      error: '「' + (await sceneNameOf(row.scene_id) || '这个场景') + '」里已经有一个叫「' + fields.name + '」的名字了',
    }, ctx, 'duplicate');
  }

  throw new Error('update failed status=' + upd.status + ' body=' + JSON.stringify(upd.body).slice(0, 300));
}

// ---------------------------------------------------------------------------
// 接口 6：DELETE /api/names/:id —— 删一条（Day 22 的主接口之二 · 今天要掌握的那件事）
//
// **为什么删除比新增更容易出事**：新增错了，多一行废数据，删掉就完事；删除错了，数据没了，
// 用户的东西找不回来。所以这条路设了两道确认 + 一层兜底：
//   ① 服务端确认：必须带 ?confirm=<这条的名字>，且和库里一字不差 → 否则 400，不删
//      （防的是"脚本少写了个条件""改地址栏手抖"这类误删）
//   ② 前端确认：删除按钮点一下只变「确认删除？」，再点一下才真发请求（人这一侧的一道）
//   ③ 兜底：默认 **软删除**（只把 is_deleted 翻成 true，数据还在，restore 能找回来）；
//      真要抹掉必须显式写 mode=hard —— 危险动作要"明说"才做得成。
//
// 回执里带上被删的那条（id / 场景 / 名字 / 寓意）：删除是破坏性操作，
// 至少让调用方留下"我删了什么"的证据。
// ---------------------------------------------------------------------------
async function handleDeleteName(id, q, res, ctx) {
  const confirm = (q.confirm || '').trim();
  const mode = q.mode === 'hard' ? 'hard' : 'soft';

  // ③ 先查（软删掉的也算不存在 → 再删一次会是 404，而不是"删了个空气"）
  const row = await db.findNameById(id);
  if (!row) {
    return send(res, 404, {
      ok: false,
      error: '没有编号为 ' + id + ' 的名字（它可能已经被删掉了）',
    }, ctx, 'not found');
  }

  // ① 服务端确认：把要删的名字原样写一遍，写错了就不删
  if (!confirm) {
    return send(res, 400, {
      ok: false,
      error: '删除需要确认：请在地址里带上 ?confirm=名字，且要和库里的名字完全一致',
    }, ctx, 'confirm missing');
  }
  if (confirm !== row.name) {
    return send(res, 400, {
      ok: false,
      error: '确认值「' + confirm + '」和编号 ' + id + ' 的名字「' + row.name + '」不一致，没有删除',
    }, ctx, 'confirm mismatch');
  }

  const del = mode === 'hard' ? await db.hardDeleteName(id) : await db.softDeleteName(id);
  if (del.status >= 200 && del.status < 300) {
    return send(res, 200, {
      ok: true,
      mode: mode,
      recoverable: mode === 'soft',
      data: await namePayload(row, null),
    }, ctx, (mode === 'hard' ? 'hard-deleted' : 'soft-deleted') + ' id=' + id);
  }

  throw new Error('delete failed status=' + del.status + ' body=' + JSON.stringify(del.body).slice(0, 300));
}

// ---------------------------------------------------------------------------
// 接口 7：POST /api/names/:id/restore —— 把软删除的那条找回来（余力加练的落点）
//   只有软删除才谈得上"找回"；已经真删掉的行是查不到的（那正是它不可逆的地方）。
// ---------------------------------------------------------------------------
async function handleRestoreName(id, res, ctx) {
  const row = await db.findDeletedNameById(id);
  if (!row) {
    return send(res, 404, {
      ok: false,
      error: '没有编号为 ' + id + ' 的已删除名字（只有软删除的才找得回来）',
    }, ctx, 'not found');
  }

  const back = await db.restoreName(id);
  if (back.status === 200 || back.status === 204) {
    let fresh = Array.isArray(back.body) ? back.body[0] : null;
    if (!fresh) fresh = await db.findNameById(id);
    return send(res, 200, {
      ok: true,
      restored: true,
      data: await namePayload(Object.assign({}, row, fresh || {}), null),
    }, ctx, 'restored id=' + id);
  }

  // 恢复时如果同场景里已经又有一个同名的"活着的"名字，就会撞唯一索引（409）
  if (back.status === 409 || String((back.body && back.body.code) || '').indexOf('23505') > -1) {
    return send(res, 409, {
      ok: false,
      error: '「' + (await sceneNameOf(row.scene_id) || '这个场景') + '」里现在已经有一个「' + row.name + '」了，先把那条处理掉再恢复',
    }, ctx, 'duplicate on restore');
  }

  throw new Error('restore failed status=' + back.status + ' body=' + JSON.stringify(back.body).slice(0, 300));
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

  // Day 23：先记下这次"在做什么"（读 / 写 / 删），万一走到 500 兜底，
  //   好挑一句贴切的人话（"读失败 / 没保存上 / 没删成功"是三件事）。
  ctx.op = req.method === 'DELETE' ? 'del'
    : (req.method === 'GET' || req.method === 'HEAD') ? 'read' : 'write';

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
    // Day 22：/names 和 /names/<编号> 都是"只写"的地址，顺手把正确用法写出来
    if (pathname === '/names' || matchNameId(pathname)) {
      return send(res, 405, {
        ok: false,
        error: '该地址只接受写操作：新增用 POST /api/names，改/删用 PATCH / DELETE /api/names/<编号>',
      }, ctx, 'method not allowed');
    }
    return send(res, 404, { ok: false, error: '接口不存在' }, ctx, 'not found');
  }

  // ---- 写：POST（新增一个名字 / 恢复一个被软删除的名字）----
  if (req.method === 'POST') {
    // POST /api/names/<编号>/restore —— 把软删除的那条找回来
    const mRestore = /^\/names\/([^\/]+)\/restore$/.exec(pathname);
    if (mRestore) {
      const id = parseId(mRestore[1]);
      if (!id) return badId(mRestore[1], res, ctx);
      return await handleRestoreName(id, res, ctx);
    }
    if (pathname === '/names') {
      const b = await readBody(req, res, ctx);
      if (!b) return;
      return await handleCreateName(b.payload, res, ctx);
    }
    // 读接口不接受 POST
    if (pathname === '/health' || pathname === '/scenes' || pathname === '/library') {
      return send(res, 405, { ok: false, error: '该地址只接受 GET 请求' }, ctx, 'method not allowed');
    }
    return send(res, 404, { ok: false, error: '接口不存在' }, ctx, 'not found');
  }

  // ---- 改：PATCH /api/names/<编号>（Day 22）----
  if (req.method === 'PATCH') {
    if (pathname === '/names') {
      return send(res, 400, {
        ok: false,
        error: '改哪一条？请在地址里带上编号，例如 PATCH /api/names/12',
      }, ctx, 'id missing');
    }
    const raw = matchNameId(pathname);
    if (raw !== null) {
      const id = parseId(raw);
      if (!id) return badId(raw, res, ctx);
      const b = await readBody(req, res, ctx);
      if (!b) return;
      return await handlePatchName(id, b.payload, res, ctx);
    }
    if (pathname === '/health' || pathname === '/scenes' || pathname === '/library') {
      return send(res, 405, { ok: false, error: '该地址只接受 GET 请求' }, ctx, 'method not allowed');
    }
    return send(res, 404, { ok: false, error: '接口不存在' }, ctx, 'not found');
  }

  // ---- 删：DELETE /api/names/<编号>?confirm=<名字>&mode=soft|hard（Day 22）----
  if (req.method === 'DELETE') {
    if (pathname === '/names') {
      return send(res, 400, {
        ok: false,
        error: '删哪一条？请在地址里带上编号和确认值，例如 DELETE /api/names/12?confirm=浪屿',
      }, ctx, 'id missing');
    }
    const raw = matchNameId(pathname);
    if (raw !== null) {
      const id = parseId(raw);
      if (!id) return badId(raw, res, ctx);
      return await handleDeleteName(id, q, res, ctx);
    }
    if (pathname === '/health' || pathname === '/scenes' || pathname === '/library') {
      return send(res, 405, { ok: false, error: '该地址只接受 GET 请求' }, ctx, 'method not allowed');
    }
    return send(res, 404, { ok: false, error: '接口不存在' }, ctx, 'not found');
  }

  // 其它动词（PUT 等）：不支持（Day 22 起支持 GET / POST / PATCH / DELETE 四种）
  return send(res, 405, {
    ok: false,
    error: '不支持的请求方式（支持 GET / POST / PATCH / DELETE）',
  }, ctx, 'method not allowed');
}

const server = http.createServer(function (req, res) {
  const started = Date.now();
  const ctx = { method: req.method, path: '-', note: '' };
  route(req, res, ctx)
    .catch(function (err) {
      // 打日志给自己看（控制台能看到），返回给用户的一律是人话 —— A8 的硬要求
      console.error('[peach-api][err] ' + ((err && err.stack) || err));
      if (!res.headersSent) {
        // Day 23：③ 服务异常 —— 文案随"这次在做什么"变，但永远是一句不带技术细节的人话
        send(res, 500, { ok: false, error: ERR500[ctx.op] || ERR500.read }, ctx, 'server error');
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
