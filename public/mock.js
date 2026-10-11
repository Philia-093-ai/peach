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
  return fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status); // 400 / 404 / 500 一律当失败
      return res.json();
    })
    .then(function (body) {
      if (!body || !body.ok) throw new Error((body && body.error) || '词库加载失败');
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
