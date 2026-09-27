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

function copyText(text, button) {
  function done() {
    var old = button.textContent;
    button.textContent = '已复制 ✓';
    button.disabled = true;
    setTimeout(function () {
      button.textContent = old;
      button.disabled = false;
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

// 成功状态：把数据交给 card.js 的可复用组件渲染
function showLoaded(names) {
  renderNameList(resultsEl, names);
}

// 错误状态：说人话 + 给一个重试按钮，页面绝不出现报错堆栈（A8）
function showError(msg) {
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
