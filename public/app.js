// app.js —— peach 前端交互（Day 8：四种页面状态 + mock 数据渲染）
// 结果区的四种状态，一个都不能少：
//   空状态   empty   —— 第一次打开，什么都没有 → 用示例卡片当"路标"
//   加载状态 loading —— 请求已发出在等结果 → 骨架屏占位
//   成功状态 loaded  —— 数据到手 → 渲染名字卡片
//   错误状态 error   —— 失败/超时 → 说人话 + 可重试，绝不显示报错堆栈
// Day 7 的表单校验（A5/A6）、每日额度（A7）、失败不扣额度（A8）原样保留

var DAILY_LIMIT = 5;

var form = document.getElementById('form');
var sceneEl = document.getElementById('scene');
var keywordEl = document.getElementById('keyword');
var btn = document.getElementById('btn');
var hintEl = document.getElementById('hint');
var resultsEl = document.getElementById('results');
var quotaEl = document.getElementById('quota');
// Day 12：筛选条相关的三个元素
var filterRow = document.getElementById('filter-row');
var filtersEl = document.getElementById('filters');
var countEl = document.getElementById('result-count');

// ---------- 每日额度（localStorage，key 形如 peach_quota_2026-09-26） ----------
function todayKey() {
  var d = new Date();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return 'peach_quota_' + d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}
function usedToday() {
  var v = parseInt(localStorage.getItem(todayKey()), 10);
  return isNaN(v) ? 0 : v;
}
function addUsed() {
  localStorage.setItem(todayKey(), String(usedToday() + 1));
}
function showQuota() {
  var left = DAILY_LIMIT - usedToday();
  quotaEl.textContent = left > 0
    ? '今日还能免费生成 ' + left + ' 次'
    : '今日免费次数已用完';
}

// ---------- 小工具 ----------
function hint(msg) { hintEl.textContent = msg || ''; }

function textOf(str) { // 只用 textContent 渲染用户可见内容，样式不会被注入内容破坏（A10）
  return document.createTextNode(String(str == null ? '' : str));
}

// ---------- Day 11：toast（底部浮出的提示条） ----------
// 比喻：toast 就像收银台的"叮咚——已收款"提示音。用户刚做完一个动作，
// 它从屏幕底部浮出来说一句结果，说完自己退场，不用点"确定"关掉。
// role="status" + aria-live="polite"：读屏软件也会播报这句话（Day 9 焦点规则的延续）。
var toastTimer = null;
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'show'; // CSS：淡入 + 从底部浮上来
  if (toastTimer) clearTimeout(toastTimer); // 连续操作：新 toast 顶掉旧的，不排队不叠加
  toastTimer = setTimeout(function () { t.className = ''; }, 1600);
}

// ---------- Day 11：复制成功的"动静双通道"反馈 ----------
// 反馈走两条通道，用户才算真的"知道生效了"：
//   动（动效）：按下时按钮缩一缩 → 成功时 pop 弹一下 + 胶囊变绿 —— 身体先感觉到
//   静（提示）：按钮文字变「已复制 ✓」+ 底部 toast 说清楚复制了哪个 —— 眼睛再确认
function copyText(text, button) {
  // 防连点：复制流程进行中（1.2 秒内）再点直接忽略。
  // 用 data-copying 标记而不是 disabled：按钮不会"死掉"，焦点不丢，键盘 Tab 也不跳走；
  // 连点不会叠 toast、不会把文案改乱（连续操作不出错的关键就在这一行）。
  if (button.getAttribute('data-copying') === '1') return;
  button.setAttribute('data-copying', '1');
  function done() {
    var old = button.textContent;
    button.textContent = '已复制 ✓';
    button.classList.add('copied'); // 绿色胶囊 + pop 动画（style.css）
    showToast('已复制「' + (text || '内容') + '」到剪贴板');
    setTimeout(function () {
      button.textContent = old;
      button.classList.remove('copied');
      button.removeAttribute('data-copying');
    }, 1200);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, done) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  done();
}

// ---------- 生成 ----------
var busy = false;

form.addEventListener('submit', function (ev) {
  ev.preventDefault();
  if (busy) return;

  var keyword = keywordEl.value.trim();

  // A5：关键词为空 → 拒绝，不发请求
  if (!keyword) {
    hint('先写一两个关键词吧，比如「海边咖啡店」');
    keywordEl.focus();
    return;
  }
  // A6：超过 20 个字 → 拒绝，不发请求
  if (keyword.length > 20) {
    hint('关键词最多 20 个字，现在写了 ' + keyword.length + ' 个');
    return;
  }
  // A7：当日额度用完 → 拒绝，不发请求
  if (usedToday() >= DAILY_LIMIT) {
    hint('今日免费次数已用完，明天再来吧 🍑');
    return;
  }

  busy = true;
  hint('');
  btn.disabled = true;
  btn.textContent = '生成中…';
  showLoading(); // 一发出请求就进入加载状态

  // 统一从"数据源"拿数据：今天是 mock 假数据，第 3 周接真 API 只改 getData 这一个函数
  getData(sceneEl.value, keyword)
    .then(function (data) {
      if (data && data.ok && data.names && data.names.length) {
        showLoaded(data.names);        // 成功状态：渲染卡片
        addUsed();                     // 成功才扣额度（失败不扣，A8）
        showQuota();
      } else {
        showError((data && data.error) || '生成失败，请重试');
      }
    })
    .catch(function () {
      showError('生成失败，请重试');   // 错误状态：不出现报错堆栈（A8）
    })
    .then(function () {
      busy = false;
      btn.disabled = false;
      btn.textContent = '✨ 生成名字';
    });
});

// mock 模式：走 mock.js 的假接口（假延迟 0.8 秒，正好够看清骨架屏）
// 真接口模式：走 Day 7 的 POST /api/generate（10 秒超时兜底）
function getData(scene, keyword) {
  if (typeof MOCK_MODE !== 'undefined' && MOCK_MODE) {
    return mockRequest(scene, keyword);
  }
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 10000); // A8：10 秒超时
  return fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene: scene, keyword: keyword }),
    signal: controller.signal,
  }).then(function (res) { clearTimeout(timer); return res.json(); });
}

// ---------- 四种页面状态 ----------
// 心法：任何一块"要等数据"的区域，都要把四种样子都想清楚再动手。

// 空状态：第一次打开，用示例卡片告诉用户"填这里会出什么"
function showEmpty() {
  hideFilter(); // 没数据就不显示筛选条
  resultsEl.textContent = '';
  var card = document.createElement('div');
  card.className = 'card sample';

  var name = document.createElement('div');
  name.className = 'name';
  name.textContent = '浪屿';

  var meaning = document.createElement('div');
  meaning.className = 'meaning';
  meaning.textContent = '示例：关键词「海边咖啡店，安静治愈」→ 想象一座海上的小岛，安静得只听得见浪。';

  var note = document.createElement('div');
  note.className = 'sample-note';
  note.textContent = '👆 这是示例。填好上方的表单，点「生成名字」就能拿到你的第一批。';

  card.appendChild(name);
  card.appendChild(meaning);
  card.appendChild(note);
  resultsEl.appendChild(card);
}

// 加载状态：6 块骨架屏。比喻：菜还没上，先用"假菜模型"把桌面占好，
// 用户就知道"已经在做了"，而不是"页面坏了"。
function showLoading() {
  hideFilter(); // 正在生成：先把筛选条收起来（避免对着一批还没到的卡片筛）
  resultsEl.textContent = '';
  for (var i = 0; i < 6; i++) {
    var sk = document.createElement('div');
    sk.className = 'card skeleton';
    var n = document.createElement('div');
    n.className = 'name';
    var m = document.createElement('div');
    m.className = 'meaning';
    sk.appendChild(n);
    sk.appendChild(m);
    resultsEl.appendChild(sk);
  }
}

// ---------- Day 12：筛选（按名字字数） ----------
// 心法：筛选只改"显示哪些"，不改"有哪些"。
// 原始批次存在 lastNames 里，屏幕上那几张卡只是它的一个"视图"——
// 所以清空筛选一定回得到原样，一个数据都不会丢（这是 Skill 的第 1 条硬规则）。
// 规则来源：项目内 Skill .workbuddy/skills/filter-check/SKILL.md
var lastNames = [];
var activeLen = 0; // 0 = 全部

function setFilter(len) {
  activeLen = len;
  renderResults();
}

function renderResults() {
  var shown = filterByName(lastNames, activeLen); // filter.js 提供
  resultsEl.textContent = '';
  if (shown.length) {
    renderNameList(resultsEl, shown);
  } else {
    // 无结果：说清"没有几字的" + 给出口；筛选条不跟着消失，用户不会被锁在空页面里
    renderNoMatch(resultsEl, activeLen, lastNames.length, function () { setFilter(0); });
  }
  filterRow.hidden = false;
  renderFilterBar(filtersEl, activeLen, setFilter); // 只更新状态，不重建按钮（焦点不丢）
  countEl.textContent = countText(shown.length, lastNames.length, activeLen);
}

// 手里没有数据可筛的时候（初始 / 生成中 / 出错），筛选条整个收起来
function hideFilter() {
  filterRow.hidden = true;
  countEl.textContent = '';
  resetFilterBar(filtersEl);
}

// 成功状态：把数据交给 card.js 的可复用组件渲染
function showLoaded(names) {
  lastNames = names.slice(); // 存下这一批的原始数据（筛选不动它）
  activeLen = 0;             // 新的一批 → 筛选自动回到「全部」，旧条件不残留
  renderResults();
}

// 错误状态：说人话 + 给一个重试按钮，页面绝不出现报错堆栈（A8）
function showError(msg) {
  hideFilter(); // 出错时也没有可筛的数据
  resultsEl.textContent = '';
  var card = document.createElement('div');
  card.className = 'card state-error';

  var title = document.createElement('div');
  title.className = 'name';
  title.textContent = '😶 生成失败了';

  var note = document.createElement('div');
  note.className = 'meaning';
  note.textContent = msg || '生成失败，请重试';

  var retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'copy retry';
  retry.textContent = '再试一次';
  retry.addEventListener('click', function () { btn.click(); });

  card.appendChild(title);
  card.appendChild(note);
  card.appendChild(retry);
  resultsEl.appendChild(card);
}

showQuota();
showEmpty(); // 页面刚打开，先亮出空状态（示例卡）
