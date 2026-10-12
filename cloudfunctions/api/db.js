// db.js —— 数据访问层（Day 19 从 index.js 里拆出来的「查数据库」那段代码 · Day 22 加改/删/恢复）
//
// 这一层只回答一个问题：**「怎么跟数据库说话？」**
//   它不知道什么是"接口"、什么是"HTTP 状态码"、什么是"前端"；
//   它只做一件事：把数据取回来 / 存进去，然后原样交给调用者。
//
// 为什么值得单独拆成一个文件？（一张三层图，记住就够）
//   ┌─────────────────────────────────────────────────────────┐
//   │ index.js · 路由层   —— 看地址（/library），把请求领到该去的柜台   │  ← 像前台
//   │ index.js · 业务层   —— 定规矩（必填？超长？场景存在？）+ 包装结果 │  ← 像经理
//   │ db.js    · 数据层   —— 只管数据怎么进出，不问你要它干嘛          │  ← 像档案室管理员
//   └─────────────────────────────────────────────────────────┘
//
//   回报：以后要换一种方式连数据库（换成 CloudBase SDK、换成连接串、换张表、换库），
//         只改 db.js 一个文件，业务代码一行都不用动。这就是"分层"最实在的价值。
//
// ---------------------------------------------------------------------------
// 云函数怎么读到这个 PG 库（Day 17 铺的路，Day 19 原样搬过来）
//   云函数不走 5432 端口直连，而是通过 CloudBase 的「数据网关」用 HTTPS 读写：
//     https://<环境ID>.api.tcloudbasegateway.com/v1/rdb/rest/<表名>?<查询条件>
//   认证靠一把 API Key（service_role 身份），存在**函数环境变量** CLOUDBASE_API_KEY 里。
//
//   比喻：数据库是档案室，网关是门口的收发窗口。这里递一张条子（HTTPS 请求）说明
//         "我要 names 表里 scene_id=1 的那几行"，窗口核对工作证（API Key）后把档案递出来。
//         读是 GET 条子，写是 POST 条子。
//   注意：**这把钥匙绝不能出现在前端代码或仓库里**——所以它只从环境变量读，不写死在这儿。
// ---------------------------------------------------------------------------

// 环境 ID：云端运行时能从环境变量拿到；本地调试时用默认值兜底
const ENV_ID = process.env.TCB_ENV || 'apple-1-d2g1zk4836ce03980';
const REST_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// API Key（service_role）：只在服务端用，任何情况下都不返回给前端
const API_KEY = process.env.CLOUDBASE_API_KEY || '';

// Day 22：软删除之后，"读数据"一律只认活着的行（行还在、只是标记成已删除）
//   写成常量而不是到处手抄，是为了不漏：所有查询都从这一个地方引用它。
const LIVE = 'is_deleted=eq.false';

// ---------------------------------------------------------------------------
// 底层：一次网关调用
//   返回 { status, body }（body 尽量解析成 JSON，解析不了就保持原样字符串）。
//   注意这里**不抛错、不判成败**——因为同样是 409，在"查询"里是致命错误，
//   在"写入"里却是一个正常的业务结果（重复提交）。判成败是**业务层**的事，数据层不越权。
// ---------------------------------------------------------------------------
async function gwCall(method, path, payload) {
  if (!API_KEY) throw new Error('CLOUDBASE_API_KEY is not configured');
  const headers = { Authorization: 'Bearer ' + API_KEY };
  const opts = { method: method };
  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    headers.Prefer = 'return=representation'; // 让网关把刚插进去的那一行回给我们（省一次查询）
    opts.body = JSON.stringify(payload);
  }
  opts.headers = headers;

  const r = await fetch(REST_BASE + path, opts);
  const text = await r.text();
  let body = text;
  try { body = JSON.parse(text); } catch (e) { /* 保持原样字符串，便于排查 */ }
  return { status: r.status, body: body };
}

// 查询：返回数组；失败就抛错（查询失败＝真出错，交给业务层统一兜底成 500）
async function dbSelect(table, query) {
  const res = await gwCall('GET', '/' + table + (query ? '?' + query : ''));
  if (res.status < 200 || res.status >= 300) {
    const raw = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
    throw new Error('gateway ' + res.status + ' on ' + table + ': ' + String(raw).slice(0, 200));
  }
  return res.body;
}

// ---------------------------------------------------------------------------
// 语义化查询：**业务层调用下面这几个，不用自己拼 REST 查询串**
//   好处是业务层彻底不认识"网关 URL / select= / eq. / encodeURIComponent"这些细节——
//   这些知识全部锁在这一层里。想换表名、换查询写法，只动这里。
// ---------------------------------------------------------------------------

// 场景字典（按 sort_order 排好）：[{ id, name, sort_order }]
function listScenes() {
  return dbSelect('scenes', 'select=id,name,sort_order&order=sort_order.asc');
}

// 场景名列表：['品牌','店铺',...]（给"场景不存在"的报错带上"有哪些可选"）
async function listSceneNames() {
  const rows = await dbSelect('scenes', 'select=name&order=sort_order.asc');
  return rows.map(function (r) { return r.name; });
}

// 按场景名找场景：找得到返回那一行，找不到返回 null
async function findSceneByName(name) {
  const rows = await dbSelect('scenes', 'select=id,name&name=eq.' + encodeURIComponent(name));
  return rows.length ? rows[0] : null;
}

// 按编号找场景（Day 22）：拿到 scene_id 之后要把它翻回场景名给前端看
async function findSceneById(id) {
  const rows = await dbSelect('scenes', 'select=id,name&id=eq.' + id);
  return rows.length ? rows[0] : null;
}

// 某场景下的所有词条（靠 Day 16 定的那根线：names.scene_id → scenes.id）
// Day 22：加上 LIVE —— 软删掉的名字从此不会再被读出来
function listNamesByScene(sceneId) {
  return dbSelect('names', 'select=id,name,meaning,char_count&scene_id=eq.' + sceneId + '&' + LIVE);
}

// 某场景下、某个名字那一条（写入后的"读回"用）：找不到返回 null
async function findNameInScene(sceneId, name) {
  const rows = await dbSelect('names',
    'select=id,name,meaning,char_count,created_at&scene_id=eq.' + sceneId +
    '&name=eq.' + encodeURIComponent(name) + '&' + LIVE);
  return rows.length ? rows[0] : null;
}

// 写入一个词条：**原样把网关的结果交回去**（{ status, body }），
// 由业务层决定"201 是成功、409 是重复"，数据层不替业务层下结论。
function insertName(row) {
  return gwCall('POST', '/names', row);
}

// ---------------------------------------------------------------------------
// Day 22：改 / 删 / 恢复（第 4 周）
//   一句话原则：**这一层不判断"该不该做"，只负责"怎么做"**——
//   删除是软删还是真删、确认够不够，都是业务层的事；这里只提供动作。
// ---------------------------------------------------------------------------

// 「活着的行」这个条件 Day 22 起每个查询都要带（常量 LIVE 定义在文件顶部）：
//   软删除 = 行还在、只是 is_deleted 翻成了 true；查询一律过滤掉它，
//   于是"删掉的名字"对用户来说就是真的消失了（但数据一点没丢）。

// 按编号取一条（软删掉的算"不存在"：业务上它确实不该再被读到）
async function findNameById(id) {
  const rows = await dbSelect('names',
    'select=id,scene_id,name,meaning,char_count,created_at&id=eq.' + id + '&' + LIVE);
  return rows.length ? rows[0] : null;
}

// 按编号取一条【含已软删除的】（只有"恢复"这一步需要看得到它们）
async function findDeletedNameById(id) {
  const rows = await dbSelect('names',
    'select=id,scene_id,name,meaning,char_count,created_at&id=eq.' + id + '&is_deleted=eq.true');
  return rows.length ? rows[0] : null;
}

// 部分更新（PATCH 语义：只改传进来的字段，没传的原样不动）
//   和 insertName 一样**原样交回网关结果** { status, body }，让业务层去判 200 / 404 / 409。
function updateName(id, fields) {
  return gwCall('PATCH', '/names?id=eq.' + id + '&' + LIVE, fields);
}

// 软删除：把标记翻成 true + 记下删除时间（行留着，可恢复）
function softDeleteName(id) {
  return gwCall('PATCH', '/names?id=eq.' + id + '&' + LIVE,
    { is_deleted: true, deleted_at: new Date().toISOString() });
}

// 真删除：把行从表里抹掉（不可逆 —— 只有显式要 hard 才会走到这里）
function hardDeleteName(id) {
  return gwCall('DELETE', '/names?id=eq.' + id);
}

// 恢复：把软删除标记翻回 false、清掉删除时间
function restoreName(id) {
  return gwCall('PATCH', '/names?id=eq.' + id + '&is_deleted=eq.true',
    { is_deleted: false, deleted_at: null });
}

module.exports = {
  listScenes: listScenes,
  listSceneNames: listSceneNames,
  findSceneByName: findSceneByName,
  findSceneById: findSceneById,
  listNamesByScene: listNamesByScene,
  findNameInScene: findNameInScene,
  findNameById: findNameById,
  findDeletedNameById: findDeletedNameById,
  insertName: insertName,
  updateName: updateName,
  softDeleteName: softDeleteName,
  hardDeleteName: hardDeleteName,
  restoreName: restoreName,
};
