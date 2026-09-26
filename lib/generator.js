// lib/generator.js —— 本地词库生成器（Day 7 版）
//
// 说明（如实记录，不夸大）：
// PRD 假设最终依赖「文本生成模型 API」；今天还没有接入任何模型 Key，
// 所以先用「关键词联想 + 场景风格」的本地规则生成第一版。
// 接口形态与模型版完全一致：输入（场景 + 关键词）→ 输出 [{name, meaning}]。
// 将来接模型时，只需要改 server.js 里调用 generate 的这一小段。

// 常见虚词：不适合当名字的字
const STOP = new Set('的了吗呢吧呀啊哦么之乎者得很太最是在和与及或有无不用了个把被让'.split(''));
// 不吉字：出现就过滤
const BAD = new Set('死病亏输赔惨哭凶衰晦丧坟孤苦穷'.split(''));

// 意象联想表：关键词里出现这些词，就把对应的「字 + 一句话字义」加进字池
const IMAGERY = [
  { w: ['海', '海边', '海洋', '海景'], g: [['海', '辽阔'], ['浪', '奔涌'], ['屿', '自成一岛'], ['汐', '来去守时'], ['潮', '生生不息'], ['澜', '自有波澜']] },
  { w: ['山', '山里', '山间', '山景'], g: [['山', '稳重'], ['峰', '出众'], ['岚', '山间雾气'], ['岭', '绵延']] },
  { w: ['云', '天空', '天台'], g: [['云', '自在'], ['朵', '可爱'], ['霄', '高远']] },
  { w: ['风', '通风', '清爽'], g: [['风', '自由'], ['吟', '低唱'], ['息', '生生不息']] },
  { w: ['光', '灯', '亮'], g: [['光', '明亮'], ['曦', '晨光'], ['暖', '有温度']] },
  { w: ['月', '月亮', '夜'], g: [['月', '温柔'], ['皎', '明亮'], ['望舒', '月神的雅称']] },
  { w: ['星', '星空'], g: [['星', '闪耀'], ['辰', '时光']] },
  { w: ['雨', '下雨'], g: [['雨', '清新'], ['霖', '甘霖'], ['滴', '精准']] },
  { w: ['雪', '下雪', '冬天'], g: [['雪', '干净'], ['凛', '凌厉']] },
  { w: ['花', '鲜花', '花店'], g: [['花', '绽放'], ['蕊', '花心'], ['芳', '香气'], ['菲', '芳菲']] },
  { w: ['草', '植物', '绿植'], g: [['芽', '新生'], ['萌', '萌芽'], ['植', '种下']] },
  { w: ['木', '原木', '木头'], g: [['木', '踏实'], ['森', '自然'], ['林', '茂盛'], ['枝', '伸展'], ['叶', '生机']] },
  { w: ['水', '河边', '溪'], g: [['水', '灵动'], ['清', '纯粹'], ['泉', '源头'], ['溪', '不息']] },
  { w: ['火', '烧烤', '辣'], g: [['焰', '热情'], ['沸', '沸腾']] },
  { w: ['金', '金属', '五金'], g: [['金', '贵重'], ['钰', '珍宝'], ['锐', '锐利']] },
  { w: ['玉', '玉石'], g: [['玉', '温润'], ['瑾', '美玉'], ['琢', '打磨']] },
  { w: ['咖啡', '咖啡店', '咖啡厅', '拿铁'], g: [['焙', '烘焙'], ['豆', '颗颗精选'], ['醇', '香醇'], ['咖', '直白点题']] },
  { w: ['茶', '茶馆', '奶茶', '茶叶'], g: [['茗', '好茶'], ['露', '清露'], ['叶', '舒展']] },
  { w: ['书', '书店', '阅读', '读书'], g: [['书', '博学'], ['卷', '沉淀'], ['墨', '书香'], ['言', '表达']] },
  { w: ['甜', '甜品', '蛋糕', '糖'], g: [['甜', '美好'], ['糖', '甜蜜'], ['蜜', '黏人'], ['果', '实诚']] },
  { w: ['酒', '酒吧', '小酌'], g: [['酌', '小酌'], ['醺', '微醺'], ['酿', '酝酿']] },
  { w: ['猫', '猫咪'], g: [['喵', '软萌'], ['绒', '柔软'], ['团', '圆滚滚']] },
  { w: ['狗', '狗狗', '宠物'], g: [['旺', '兴旺'], ['汪', '热情'], ['忠', '忠诚']] },
  { w: ['鸟', '鸟', '鹦鹉'], g: [['羽', '轻盈'], ['啼', '婉转']] },
  { w: ['鱼', '鱼', '钓鱼'], g: [['鱼', '自在'], ['游', '畅快']] },
  { w: ['春', '春天'], g: [['春', '希望'], ['芽', '破土']] },
  { w: ['夏', '夏天'], g: [['夏', '热烈'], ['荷', '清雅'], ['鸣', '酣畅']] },
  { w: ['秋', '秋天'], g: [['秋', '丰收'], ['枫', '层林尽染'], ['实', '成果']] },
  { w: ['冬', '冬天'], g: [['冬', '沉静'], ['炉', '温暖']] },
  { w: ['家', '家庭', '回家', '民宿'], g: [['家', '归处'], ['栖', '安顿'], ['巢', '港湾']] },
  { w: ['路', '旅行', '远方', '出走'], g: [['行', '出发'], ['途', '风景'], ['野', '旷']] },
  { w: ['快', '快递', '急送'], g: [['迅', '神速'], ['捷', '利落'], ['驰', '奔驰']] },
  { w: ['慢', '慢生活', '悠闲'], g: [['悠', '从容'], ['缓', '不急'], ['然', '自若']] },
  { w: ['新', '科技', '智能', '软件', '程序'], g: [['新', '初生'], ['启', '开启'], ['元', '万物之始'], ['智', '聪明']] },
  { w: ['手作', '手工', '自制'], g: [['拙', '守拙'], ['作', '亲手做'], ['匠', '匠心']] },
  { w: ['睡', '睡眠', '晚安', '枕'], g: [['眠', '安睡'], ['梦', '有梦'], ['枕', '依靠']] },
  { w: ['健身', '运动', '跑步'], g: [['力', '有力'], ['衡', '平衡'], ['动', '活力']] },
  { w: ['音乐', '唱歌', '琴'], g: [['音', '悦耳'], ['律', '有调'], ['声', '成曲']] },
  { w: ['画', '摄影', '拍照'], g: [['影', '留光'], ['拾', '捡拾'], ['帧', '定格']] },
  { w: ['美妆', '化妆', '口红'], g: [['黛', '眉色'], ['颜', '容颜'], ['妆', '点睛']] },
  { w: ['衣服', '服装', '穿搭', '裁缝'], g: [['衣', '合身'], ['裁', '剪裁'], ['裳', '衣裳']] },
  { w: ['教育', '学习', '课堂', '培训'], g: [['学', '求知'], ['知', '明白'], ['蒙', '启蒙']] },
  { w: ['医疗', '健康', '养生'], g: [['康', '安康'], ['安', '平安'], ['和', '调匀']] },
  { w: ['法律', '律师', '咨询'], g: [['正', '秉正'], ['衡', '权衡'], ['明', '明察']] },
  { w: ['游戏', '电竞'], g: [['趣', '有趣'], ['玩', '尽兴']] },
  { w: ['城市', '街', '夜市'], g: [['城', '栖息'], ['市', '烟火'], ['里', '街巷']] },
  { w: ['绿', '环保', '有机'], g: [['绿', '生机'], ['澄', '清澈']] },
];

// 通用好字兜底（字 + 一句话字义）
const UNIVERSAL = [
  ['白', '干净'], ['未', '有余味'], ['可', '讨喜'], ['一', '专一'],
  ['安', '安稳'], ['和', '舒服'], ['青', '年轻'], ['南', '向阳'],
  ['柚', '清新'], ['橘', '明亮'], ['晚', '温柔'], ['眠', '安睡'],
  ['软', '亲切'], ['拾', '采集'], ['慢', '从容'], ['暖', '治愈'],
  ['巷', '烟火气'], ['朝', '清晨'], ['暮', '傍晚'], ['野', '生长感'],
  ['川', '奔流'], ['亦', '也是'], ['见', '遇见'], ['回', '回头客'],
];

// 场景风格：决定名字的「形态」和寓意收尾
const SCENES = {
  '品牌': {
    pool: [['川', '奔流'], ['一', '专一'], ['白', '干净'], ['未', '有余味'], ['可', '讨喜'], ['亦', '也是'], ['安', '安稳'], ['和', '舒服']],
    tail: '大气好记，念着顺口',
    make: makeBrand,
  },
  '店铺': {
    pool: [['小', '亲切'], ['拾', '采集'], ['慢', '从容'], ['暖', '治愈'], ['朝', '清晨'], ['暮', '傍晚'], ['巷', '烟火气']],
    tail: '进店如归，想着再来',
    make: makeShop,
  },
  '宠物': {
    pool: [['布', '软乎乎'], ['丁', '小小的'], ['球', '圆滚滚'], ['豆', '一粒'], ['团', '团团圆'], ['糕', '软糯']],
    tail: '一叫就懂，软萌亲人',
    make: makePet,
  },
  '网络昵称': {
    pool: [['软', '亲切'], ['晚', '温柔'], ['野', '生长感'], ['橘', '明亮'], ['柚', '清新'], ['枝', '伸展'], ['眠', '安睡']],
    tail: '好念好记，一眼认出',
    make: makeNick,
  },
};

const SUFFIX = ['屋', '记', '铺', '社', '堂'];
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 从关键词里挑出「能进名字的字」
function charsFromKeyword(keyword) {
  const out = [];
  for (const ch of keyword) {
    if (!/[\u4e00-\u9fff]/.test(ch)) continue;
    if (STOP.has(ch) || BAD.has(ch)) continue;
    out.push(ch);
  }
  return [...new Set(out)];
}

// 组装字池：关键词的字 + 意象联想 + 场景风格字 + 通用字兜底
function buildPool(scene, keyword) {
  const pool = []; // { ch, gloss|null }
  const seen = new Set();
  const push = (ch, gloss) => {
    if (!ch || seen.has(ch) || BAD.has(ch)) return;
    seen.add(ch);
    pool.push({ ch, gloss: gloss || null });
  };
  for (const ch of charsFromKeyword(keyword)) push(ch, null);
  const kw = keyword || '';
  for (const item of IMAGERY) {
    if (!item.w.some((w) => kw.includes(w))) continue;
    for (const [ch, gloss] of item.g) push(ch, gloss);
  }
  for (const [ch, gloss] of SCENES[scene].pool) push(ch, gloss);
  for (const [ch, gloss] of UNIVERSAL) push(ch, gloss);
  return pool;
}

function glossOf(pool, ch) {
  const hit = pool.find((p) => p.ch === ch);
  return hit ? hit.gloss : null;
}

// 寓意：优先解释名字里「有字义」的字，收尾落在场景；超过 30 字自动用短版
function makeMeaning(pool, name, tail) {
  const glossed = [];
  for (const ch of name) {
    const g = glossOf(pool, ch);
    if (g && !glossed.some((x) => x.ch === ch)) glossed.push({ ch, g });
    if (glossed.length >= 2) break;
  }
  let m;
  if (glossed.length === 2) {
    m = `「${glossed[0].ch}」${glossed[0].g}，「${glossed[1].ch}」${glossed[1].g}，${tail}`;
  } else if (glossed.length === 1) {
    m = `「${glossed[0].ch}」${glossed[0].g}，${tail}`;
  } else {
    m = `取「${name}」，${tail}`;
  }
  if ([...m].length > 30) m = `取「${name}」，${tail}`;
  return m;
}

function makeBrand(pool) {
  const chars = shuffle(pool.map((p) => p.ch));
  if (chars.length < 2) return null;
  const name = Math.random() < 0.15 && chars.length >= 3
    ? chars[0] + chars[1] + chars[2]
    : chars[0] + chars[1];
  return name;
}

function makeShop(pool) {
  const chars = shuffle(pool.map((p) => p.ch));
  if (chars.length < 2) return null;
  const core = chars[0] + chars[1];
  return Math.random() < 0.6 ? core + rand(SUFFIX) : core;
}

function makePet(pool) {
  const chars = shuffle(pool.map((p) => p.ch));
  const roll = Math.random();
  if (roll < 0.35) return chars[0] + chars[0]; // 叠字：布布
  if (roll < 0.7) return '小' + chars[0];      // 小X：小团
  return chars[0] + chars[1];                  // 双字：布丁
}

function makeNick(pool) {
  const chars = shuffle(pool.map((p) => p.ch));
  const roll = Math.random();
  if (roll < 0.3) return chars[0] + chars[0];  // 叠字：晚晚
  if (roll < 0.6) return '阿' + chars[0];      // 阿X：阿橘
  if (roll < 0.85) return chars[0] + '野';     // X野：软野
  return chars[0] + chars[1];
}

// 主入口：返回 ≥ count 个 { name, meaning }
function generate(scene, keyword, count) {
  const conf = SCENES[scene] || SCENES['品牌'];
  const pool = buildPool(scene, keyword);
  const names = [];
  const seen = new Set();
  let tries = 0;
  while (names.length < count && tries < 200) {
    tries++;
    const name = conf.make(pool);
    if (!name) break;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push({ name, meaning: makeMeaning(pool, name, conf.tail) });
  }
  return names;
}

module.exports = { generate };
