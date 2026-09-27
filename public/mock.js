// mock.js —— Day 8：本地假数据 + 假接口
// 作用：在第 3 周接真实模型 API 之前，先用「假的接口」把页面四种状态跑通。
// 比喻：mock 数据就像餐厅后厨的"假菜模型"——菜还没会做，但上菜的托盘、
//       菜单、传菜流程全都可以先练熟。第 3 周只把 mockRequest 换成真 fetch。

// ---- 两个开关（改这里就能看到不同状态，不用改别的代码）----
var MOCK_MODE = true;         // true = 用本地假数据；第 3 周接真 API 时改成 false
var MOCK_DELAY = 800;         // 模拟网络延迟（毫秒）：让"加载状态"肉眼可见
var MOCK_FORCE_ERROR = false; // 改成 true：每次请求都失败，用来看"错误状态"

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
