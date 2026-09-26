// app.js —— peach MVP 前端交互（Day 7）
// 负责：表单校验（A5/A6）、每日额度（A7，localStorage 按天计数）、
//       调后端接口、渲染结果卡片（A4）、复制按钮、失败不扣额度（A8）

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

  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 10000); // A8：10 秒超时

  fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene: sceneEl.value, keyword: keyword }),
    signal: controller.signal,
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      clearTimeout(timer);
      if (data && data.ok && data.names && data.names.length) {
        renderNames(data.names);       // 先展示结果
        addUsed();                     // 成功才扣额度（失败不扣，A8）
        showQuota();
      } else {
        hint((data && data.error) || '生成失败，请重试');
      }
    })
    .catch(function () {
      hint('生成失败，请重试');
    })
    .then(function () {
      busy = false;
      btn.disabled = false;
      btn.textContent = '✨ 生成名字';
    });
});

function renderNames(names) {
  resultsEl.textContent = ''; // 清空（含示例卡）
  names.forEach(function (item) {
    var card = document.createElement('div');
    card.className = 'card';

    var name = document.createElement('div');
    name.className = 'name';
    name.appendChild(textOf(item.name));

    var meaning = document.createElement('div');
    meaning.className = 'meaning';
    meaning.appendChild(textOf(item.meaning));

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy';
    copy.textContent = '复制';
    copy.addEventListener('click', function () { copyText(item.name, copy); });

    card.appendChild(name);
    card.appendChild(meaning);
    card.appendChild(copy);
    resultsEl.appendChild(card);
  });
}

showQuota();
