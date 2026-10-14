// mock.js —— Day 8：本地假数据 + 假接口
// 作用：在第 3 周接真实模型 API 之前，先用「假的接口」把页面四种状态跑通。
// 比喻：mock 数据就像餐厅后厨的"假菜模型"——菜还没会做，但上菜的托盘、
//       菜单、传菜流程全都可以先练熟。第 3 周只把 mockRequest 换成真 fetch。

// ==== Day 17 的重大变化（只读这一段就够）====
// 词库（libraryRequest）**已经换成真接口**：数据来自云数据库（Day 16 建的 scenes / names 表）。
//   · 生成器（mockRequest）仍在用假数据 —— 真接口 /api/generate 要到 Day 18+ 才接；
//   · 所以开关分成了两套，互不影响：LIB_USE_REAL_API 管词库，MOCK_MODE 管生成器；
//   · 想回到"假词库"演练四种状态？把 LIB_USE_REAL_API 改成 false 即可。
// 比喻：以前词库是"自家冰箱里的存货"（本地写死），今天换成了"楼下超市现买"
//       （云数据库现查）—— 货架上有什么，取决于超市（=数据库）里真正上了什么货。

// ---- 生成器的开关（改这里就能看到不同状态，不用改别的代码）----
var MOCK_MODE = true;         // true = 用本地假数据；接真 /api/generate 时改成 false
var MOCK_DELAY = 800;         // 模拟网络延迟（毫秒）：让"加载状态"肉眼可见
var MOCK_FORCE_ERROR = false; // 改成 true：每次请求都失败，用来看"错误状态"

// ---- Day 17：词库的真接口开关 ----
var LIB_USE_REAL_API = true;  // true = 词库读云数据库（真数据）；false = 回到下面的假词库
// 真接口的地址：静态托管和接口不在同一个域名上，所以这里必须写完整地址（绝对路径）。
var API_BASE = 'https://apple-1-d2g1zk4836ce03980-1503730028.ap-shanghai.app.tcloudbase.com/api';

// ==== Day 23 新增：把"失败的响应"翻译成人话（三大类，前端和服务端守同一套）====
// 以前这里的写法是：if (!res.ok) throw new Error('HTTP ' + res.status);
//   两个毛病：① 用户会看到 "HTTP 500" 这种裸报错（今天要改掉的就是它）；
//            ② 服务端明明回了一句中文人话（比如「没有「美食」这个场景」），
//               却因为先判了 !res.ok，还没读 body 就把请求判死了，那句话白白丢掉。
// 现在改成：**先读响应的 body，能拿到服务端的中文就用服务端那句；实在拿不到，
//   才按状态码翻成人话**。翻译表和服务端 index.js 的 errKind 一一对应：
//     ① 请求有问题  400 / 405 / 409 / 413
//     ② 找不到      404
//     ③ 服务异常    500+
//   比喻：外卖没送到 —— 先看商家的留言（body.error），没留言才照订单状态猜个大概。
function humanizeHttp(status) {
  if (status === 404) return '没找到这条内容，可能已经被删掉了';
  if (status === 409) return '这条内容已经存在了';
  if (status >= 500) return '服务暂时不可用，请稍后重试';
  if (status >= 400) return '请求有问题，改一下再试'; // 400 / 405 / 413 …
  return '请求失败，请稍后重试';
}

// 失败时该说哪句话：服务端的人话优先，拿不到才退回按状态码翻译
function pickErrorMessage(res, body) {
  return (body && body.error) || humanizeHttp(res.status);
}

// 所有真接口调用的统一入口：发请求 → 尽力解析 JSON → 不成就把**人话**抛出去。
// 好处：以后新增接口只管写地址，错误翻译这一套自动继承，不会有人再手写 "HTTP xxx"。
function apiFetch(url, options) {
  return fetch(url, options).then(function (res) {
    return res.json().catch(function () { return null; }).then(function (body) {
      if (!res.ok || !body || !body.ok) throw new Error(pickErrorMessage(res, body));
      return body;
    });
  });
}

// ---- 假数据：每个场景 6 个名字（和真实接口的返回形状一模一样）----
var MOCK_BATCHES = {
  '品牌': [
    { name: '浪屿',   meaning: '想象一座海上小岛，安静得只听得见浪。' },
    { name: '晨野',   meaning: '清晨的原野，一切刚刚开始的样子。' },
    { name: '白鹿纪', meaning: '像白鹿一样干净、有灵气的品牌气质。' },
    { name: '野柿子', meaning: '带点野趣和甜味，容易记住也容易亲近。' },
    { name: '南风集', meaning: '南风吹来的市集，温暖、松弛、有人情味。' },
    { name: '拾光',   meaning: '把好时光一点点拾起来的意思，温柔好记。' }
  ],
  '店铺': [
    { name: '半山书角', meaning: '开在半山腰的读书角落，安静不赶时间。' },
    { name: '一勺晚风', meaning: '一勺子舀起晚风，适合甜品小店的松弛感。' },
    { name: '灯下人',   meaning: '夜里亮着灯的那家店，总有人在等你。' },
    { name: '慢半拍',   meaning: '承认自己慢，反而成了最舒服的节奏。' },
    { name: '苔痕',     meaning: '青苔爬上台阶的小店，低调又有岁月感。' },
    { name: '口袋月光', meaning: '小小的店，装得下一口袋的温柔月光。' }
  ],
  '宠物': [
    { name: '汤圆',   meaning: '白白软软一团，黏人又甜。' },
    { name: '煤球',   meaning: '黑得发亮的小家伙，越看越精神。' },
    { name: '布丁',   meaning: '抖一抖会晃的小圆子，可爱值拉满。' },
    { name: '来福',   meaning: '老一辈起名的智慧：健康平安就是福。' },
    { name: '雪碧',   meaning: '气泡一样的性子，蹦蹦跳跳停不下来。' },
    { name: '年糕',   meaning: '软糯黏人，谁摸谁上瘾。' }
  ],
  '网络昵称': [
    { name: '熬夜冠军', meaning: '自嘲式幽默，一看就是个夜猫子。' },
    { name: '一半海水', meaning: '安静里藏着汹涌，有故事感的昵称。' },
    { name: '脆皮打工人', meaning: '又丧又好笑，打工人秒懂。' },
    { name: '柠檬气泡', meaning: '酸酸爽爽，很有夏日元气感。' },
    { name: '慢速飞船', meaning: '慢，但一直在飞——温柔的倔强。' },
    { name: '困困兽',   meaning: '永远睡不醒的小兽，萌感十足。' }
  ]
};

// ---- 假接口：和真实 fetch 的用法一致（Promise，成功 resolve，失败 reject）----
// 第 3 周接真 API 时，app.js 里只需要把 mockRequest(...) 换成 fetch(...)，
// 页面的四种状态代码一行都不用动——这就是 mock 的价值。
function mockRequest(scene, keyword) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      if (MOCK_FORCE_ERROR) {
        reject(new Error('mock：模拟一次失败'));
        return;
      }
      var batch = MOCK_BATCHES[scene] || MOCK_BATCHES['品牌'];
      // 把关键词轻轻"揉"进寓意里，让假结果看起来和你的输入有关
      var names = batch.map(function (item) {
        var tail = keyword ? '——接住「' + keyword + '」的感觉' : '';
        var meaning = item.meaning + tail;
        if (meaning.length > 30) meaning = meaning.slice(0, 30);
        return { name: item.name, meaning: meaning };
      });
      resolve({ ok: true, scene: scene, keyword: keyword, names: names });
    }, MOCK_DELAY);
  });
}

// ---- Day 13：词库的"假接口"（词库视图在用）----
// 词库就是本地这份名字库，本来不依赖模型；照样包成"假接口"，
// 是为了让词库视图的四种状态（空 / 加载 / 错误 / 正常）能像真接口一样被演练一遍。
// 比喻：真实接口是"外卖"，词库是"自家冰箱"——但先按点外卖的流程练一遍，
//       等以后词库真搬到服务器上，页面代码一行都不用改。
var MOCK_LIB_FORCE_ERROR = false; // 改成 true：词库每次请求都失败，用来看"错误状态"

// Day 17：词库的统一入口。真接口 / 假接口在这里分岔，上层（library.js）一行都不用改。
function libraryRequest(scene, keyword) {
  return LIB_USE_REAL_API ? realLibraryRequest(scene, keyword) : fakeLibraryRequest(scene, keyword);
}

// ---- Day 17 新增：真接口 —— 直接问云端要数据（数据来自 Day 16 建的 scenes / names 两张表）----
// 比喻：以前打开自家冰箱拿剩菜（本地假数据），现在改成打电话给楼下超市现买（云端现查）。
function realLibraryRequest(scene, keyword) {
  var url = API_BASE + '/library'
    + '?scene=' + encodeURIComponent(scene)
    + '&keyword=' + encodeURIComponent((keyword || '').trim());
  // 这个请求没加任何自定义请求头 → 属于浏览器的"简单请求"，不会先发一趟预检
  // Day 23：错误翻译一律交给 apiFetch（服务端的中文优先，绝不再抛出 "HTTP xxx"）
  return apiFetch(url).then(function (body) {
    // 把接口的形状统一成"上层认识的样子"：{ ok, scene, keyword, data }
    return { ok: true, scene: body.scene, keyword: body.keyword, data: body.data || [] };
  });
}

// ---- Day 13 的假接口（留着当对照；把 LIB_USE_REAL_API 改成 false 就回到它）----
function fakeLibraryRequest(scene, keyword) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      if (MOCK_LIB_FORCE_ERROR) {
        reject(new Error('mock：模拟一次词库加载失败'));
        return;
      }
      var batch = MOCK_BATCHES[scene] || [];
      var kw = (keyword || '').trim();
      // 关键词在名字或寓意里出现就算命中；没填关键词就返回整个场景
      var names = batch.filter(function (item) {
        return !kw || item.name.indexOf(kw) > -1 || item.meaning.indexOf(kw) > -1;
      });
      resolve({ ok: true, scene: scene, keyword: kw, data: names });
    }, MOCK_DELAY);
  });
}

// ==== Day 20 新增：首页也接上真库 ====
// 词库（libraryRequest）Day 17 就走了真接口；今天轮到**首页**——
// 首页那块「名字库实时数据」要让访客一眼看到：页面上的数字和名字，是数据库此刻的样子。
// 比喻：以前首页是"宣传海报"（写死的图），今天在门口摆了一块"实时大屏"，
//       屏幕上的数字来自仓库里真正的库存，仓库变了大屏就变。

// 一个到处能用的「真接口 GET」helper —— Day 23 起复用 apiFetch：连错误翻译也一起沿用
function apiGet(path) {
  return apiFetch(API_BASE + path);
}

// Day 20：首页实时数据 —— 一次把该问的都问清楚
//   ① /health   → 云函数自检（服务名 + 版本）+ 服务端时间（用来显示「最后更新时间」）
//   ② /scenes   → 数据库里有哪些场景
//   ③ 每个场景各问一次 /library?limit=1 → 只取 total（这个场景库里到底有几个名字）
//   把各场景的 total 加起来 = 数据库此刻的名字总数。
//   请求**并发发出**（Promise.all）：7 个请求一起走，比一个一个排队快得多。
function liveDataRequest() {
  var startedAt = Date.now();
  return apiGet('/health').then(function (health) {
    return apiGet('/scenes').then(function (scenes) {
      var list = (scenes.data || []).slice(0, 12); // 保护：场景再多也不狂发请求
      var jobs = list.map(function (s) {
        return apiGet('/library?scene=' + encodeURIComponent(s.name) + '&limit=1')
          .then(function (r) { return { scene: s.name, count: r.total || 0 }; })
          .catch(function () { return { scene: s.name, count: null }; }); // 单个场景失败不拖垮整块
      });
      return Promise.all(jobs).then(function (rows) {
        var total = rows.reduce(function (a, r) { return a + (r.count || 0); }, 0);
        return {
          ok: true,
          service: health.service,
          version: health.version,
          serverTime: health.time,   // 服务端此刻时间（UTC ISO 字符串）
          elapsedMs: Date.now() - startedAt,
          scenes: rows,              // [{ scene: '品牌', count: 7 }, ...]
          sceneCount: list.length,
          totalNames: total,
        };
      });
    });
  });
}

// Day 20：取某个场景的头几条名字（首页那块大屏的"名字预览"用它）
function previewRequest(scene, limit) {
  return apiGet('/library?scene=' + encodeURIComponent(scene) + '&limit=' + (limit || 4))
    .then(function (r) { return r.data || []; });
}

// ==== Day 22 新增：删除一个名字（走真接口 DELETE）====
// 比喻：删除是把东西**扔进碎纸机**，不是"从抽屉里拿出来放一边"——
//       所以服务端要求把"要删的那个名字"原样再念一遍（?confirm=），念错了就不删。
//       前端这两道确认（先点一次亮红、再点一次才发）是"人这一侧"的那道。
function deleteNameRequest(id, name) {
  var url = API_BASE + '/names/' + encodeURIComponent(id)
    + '?confirm=' + encodeURIComponent(name);
  // Day 23：删除失败也说人话 —— 服务端的中文原样带上来，拿不到才按状态码翻译；
  //   不再出现「删除失败（HTTP 500）」这种带状态码的半裸报错。
  return apiFetch(url, { method: 'DELETE' }); // { ok, mode:'soft', recoverable:true, data:{...} }
}
