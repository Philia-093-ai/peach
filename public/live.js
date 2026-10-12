// live.js —— Day 20：首页「名字库实时数据」区（+ 接口自检 + 最后更新时间）
//
// 这一块存在的意义：让**首页自己证明**「页面上的数据是真的」。
//   每次打开页面，它都去云函数问一次；你看到的数字和名字，就是数据库此刻的样子。
//   想眼见为实：去控制台/命令行改一行库数据、再刷新这里，数字和名字立刻跟着变。
//
// 心法（Day 8 定下来的，一直好使）：任何一块"要等数据"的区域，动手前先把四种样子想清楚——
//   加载 loading —— 正在问云函数，先说一句"在读了"（别让用户以为页面坏了）
//   成功 loaded  —— 数字 + 场景标签 + 真名预览 + 自检与最后更新时间
//   错误 error   —— 说人话 + 给「重试」，绝不显示报错堆栈
//   空   empty   —— 读到了，但库里一个名字都没有（诚实地说"还没有"）

var liveInited = false;
var liveBusy = false;
var liveData = null;   // 最近一次拿到的全量数据（切场景预览时不用重新问一遍全部）
var liveActive = '';   // 当前预览的场景名

function liveBody() { return document.getElementById('live-body'); }

// DOM 就绪后加载一次（router.js 的 DOMContentLoaded 末尾会调它）
function ensureLive() {
  if (liveInited) return;
  liveInited = true;
  loadLive();
}

function loadLive() {
  if (liveBusy) return;
  liveBusy = true;
  showLiveLoading();
  liveDataRequest()
    .then(function (d) {
      liveData = d;
      if (!d.sceneCount) return showLiveEmpty();   // 库里没有任何场景 → 空状态
      showLiveLoaded(d);
    })
    .catch(function () {
      showLiveError();                              // 说人话，不丢堆栈
    })
    .then(function () { liveBusy = false; });
}

// 把 ISO 时间字符串显示成「2026-10-12 20:41:50」（浏览器自动按本机时区转）
function fmtTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

// ---------- 四种状态 ----------
function showLiveLoading() {
  var b = liveBody();
  b.textContent = '';
  var p = document.createElement('p');
  p.className = 'live-loading';
  p.setAttribute('role', 'status');
  p.textContent = '正在读取云数据库…';
  b.appendChild(p);
}

function showLiveEmpty() {
  var b = liveBody();
  b.textContent = '';
  var p = document.createElement('p');
  p.className = 'live-loading';
  p.textContent = '数据库里目前还没有名字——去词库页看看，或者晚点再来。';
  b.appendChild(p);
  b.appendChild(liveMetaBlock(liveData));
}

function showLiveError() {
  var b = liveBody();
  b.textContent = '';
  var box = document.createElement('div');
  box.className = 'live-error';

  var t = document.createElement('p');
  t.className = 'live-error-title';
  t.textContent = '😶 没读到云端数据';

  var m = document.createElement('p');
  m.className = 'live-error-note';
  m.textContent = '网络可能打了个盹。点下面再试一次。';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-plain';
  btn.id = 'live-retry';
  btn.textContent = '重试';
  btn.addEventListener('click', loadLive);

  box.appendChild(t);
  box.appendChild(m);
  box.appendChild(btn);
  b.appendChild(box);
}

function showLiveLoaded(d) {
  var b = liveBody();
  b.textContent = '';

  // ① 两个大数字：场景数 + 名字总数
  var stats = document.createElement('div');
  stats.className = 'live-stats';
  stats.appendChild(statCell(d.sceneCount, '个场景'));
  stats.appendChild(statCell(d.totalNames, '个名字'));
  b.appendChild(stats);

  // ② 场景标签：点一下切换下面的名字预览
  var chips = document.createElement('div');
  chips.className = 'live-chips';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', '按场景查看真库里的名字');
  d.scenes.forEach(function (row) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.setAttribute('data-scene', row.scene);
    btn.textContent = row.scene + ' · ' + (row.count == null ? '—' : row.count);
    chips.appendChild(btn);
  });
  chips.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute('data-scene')) {
      liveActive = t.getAttribute('data-scene');
      markChips();
      loadPreview(liveActive);
    }
  });
  b.appendChild(chips);

  // ③ 名字预览：真库里这个场景的头几条（卡片复用 Day 8 的组件，复制按钮也是现成的）
  var preview = document.createElement('div');
  preview.className = 'live-preview';
  preview.id = 'live-preview';
  b.appendChild(preview);

  // ④ 自检 + 最后更新时间（余力加练）
  b.appendChild(liveMetaBlock(d));

  // 默认预览第一个场景
  liveActive = (d.scenes[0] && d.scenes[0].scene) || '';
  markChips();
  loadPreview(liveActive);
}

// 只改预览区：换场景时不用重新问那两个大数字
function loadPreview(scene) {
  var box = document.getElementById('live-preview');
  if (!box) return;
  if (!scene) { box.textContent = ''; return; }
  box.textContent = '';
  var p = document.createElement('p');
  p.className = 'live-loading';
  p.textContent = '正在读取「' + scene + '」…';
  box.appendChild(p);

  previewRequest(scene, 4)
    .then(function (names) {
      if (!names.length) {
        var t = document.createElement('p');
        t.className = 'live-loading';
        t.textContent = '「' + scene + '」这个场景还没有名字。';
        box.textContent = '';
        box.appendChild(t);
        return;
      }
      renderNameList(box, names); // 复用 card.js：有名字有寓意有复制按钮
    })
    .catch(function () {
      var t = document.createElement('p');
      t.className = 'live-loading';
      t.textContent = '「' + scene + '」没读出来，点上方场景标签再试一次。';
      box.textContent = '';
      box.appendChild(t);
    });
}

// 把选中场景的标签标出来（肉眼看到底色，读屏听到 aria-pressed）
function markChips() {
  var chips = document.querySelectorAll('.live-chips .chip');
  Array.prototype.forEach.call(chips, function (c) {
    var on = c.getAttribute('data-scene') === liveActive;
    c.className = on ? 'chip on' : 'chip';
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

// ---------- 小零件 ----------
function statCell(num, label) {
  var d = document.createElement('div');
  d.className = 'live-stat';
  var b = document.createElement('b');
  b.textContent = String(num);
  var s = document.createElement('span');
  s.textContent = label;
  d.appendChild(b);
  d.appendChild(s);
  return d;
}

// 「检查台」的三行：云函数自检 / 数据最后更新时间 / 本次读取用量
function liveMetaBlock(d) {
  if (!d) return document.createElement('p');
  var meta = document.createElement('p');
  meta.className = 'live-meta';

  meta.appendChild(metaLine('🛰 云函数自检',
    (d.service || 'peach-api') + ' v' + (d.version || '?') + ' · 正常'));
  // 余力加练：这一行就是「最后更新时间」——时刻取自服务端（不是本机时钟，更可信）
  meta.appendChild(metaLine('🕘 数据最后更新',
    fmtTime(d.serverTime) + '（服务端时间）'));
  meta.appendChild(metaLine('⚡ 本次读取',
    d.sceneCount + ' 个场景 · ' + (d.sceneCount + 1) + ' 次请求 · 用时 ' + d.elapsedMs + ' 毫秒'));
  return meta;
}

function metaLine(label, value) {
  var line = document.createElement('span');
  var b = document.createElement('b');
  b.textContent = label + '：';
  line.appendChild(b);
  line.appendChild(document.createTextNode(value));
  return line;
}
