// library.js —— Day 13：词库视图（列表数据 + 四种状态）
//
// 要展示的是"一批列表数据"，所以四种状态一个都不能少：
//   空状态   empty   —— 请求成功，但这个场景／关键词下确实没有名字
//   加载状态 loading —— 正在翻词库，先用骨架屏占位（菜还没上，先把假菜模型摆好）
//   错误状态 error   —— 没拿到数据：说人话 + 给「重试」，不显示报错堆栈
//   正常状态 loaded  —— 数据到手，交给 card.js 的卡片组件渲染
//
// 心法（Day 8 定下来的）：任何一块"要等数据"的区域，动手前先把四种样子都想清楚。

var libInited = false;
var libBusy = false;
var libSearchTimer = null;

function libScene() { return document.getElementById('lib-scene'); }
function libSearch() { return document.getElementById('lib-search'); }
function libMeta() { return document.getElementById('lib-meta'); }
function libList() { return document.getElementById('lib-list'); }

// 第一次切到词库视图时才初始化（省一次没必要的请求）
function ensureLibrary() {
  if (libInited) return;
  libInited = true;

  libScene().addEventListener('change', loadLibrary);

  // 打字别每敲一下就发请求：停下 250ms 再发（这叫"防抖"，和 Day 11 防连点一个思路）
  libSearch().addEventListener('input', function () {
    clearTimeout(libSearchTimer);
    libSearchTimer = setTimeout(loadLibrary, 250);
  });

  // 空状态里的「清除搜索」用事件委托，不给动态生成的按钮挂内联 onclick
  libList().addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.id === 'lib-clear') {
      libSearch().value = '';
      loadLibrary();
    }
    if (t && t.id === 'lib-retry') loadLibrary();
  });

  loadLibrary();
}

function loadLibrary() {
  if (libBusy) return;
  libBusy = true;
  var scene = libScene().value;
  var kw = libSearch().value.trim();

  showLibLoading(scene);
  libraryRequest(scene, kw) // 假接口由 mock.js 提供（第 3 周可换成真接口）
    .then(function (data) {
      if (data && data.ok && data.names && data.names.length) {
        showLibLoaded(data.names, scene, kw);
      } else {
        showLibEmpty(scene, kw); // 拿回来了，但是个空列表 —— 这也是一种"明确的状态"
      }
    })
    .catch(function () {
      showLibError();
    })
    .then(function () { libBusy = false; });
}

// ---------- 四种状态 ----------
function libClear() { libList().textContent = ''; }

function showLibLoading(scene) {
  libMeta().textContent = '正在翻「' + scene + '」词库…';
  libClear();
  for (var i = 0; i < 6; i++) {
    var sk = document.createElement('div');
    sk.className = 'card skeleton';
    var n = document.createElement('div');
    n.className = 'name';
    var m = document.createElement('div');
    m.className = 'meaning';
    sk.appendChild(n);
    sk.appendChild(m);
    libList().appendChild(sk);
  }
}

function showLibLoaded(names, scene, kw) {
  libMeta().textContent = kw
    ? '「' + scene + '」里匹配「' + kw + '」的名字：' + names.length + ' 个'
    : '「' + scene + '」词库共 ' + names.length + ' 个名字';
  libClear();
  renderNameList(libList(), names); // 复用 Day 8 的可复用卡片 + Day 11 的复制反馈
}

function showLibEmpty(scene, kw) {
  libMeta().textContent = '没有匹配的名字';
  libClear();
  var card = document.createElement('div');
  card.className = 'card state-empty';

  var title = document.createElement('div');
  title.className = 'name';
  title.textContent = kw ? '「' + scene + '」里没有带「' + kw + '」的名字' : '「' + scene + '」暂时是空的';

  var note = document.createElement('div');
  note.className = 'meaning';
  note.textContent = '换个关键词，或者切到别的场景看看。';

  card.appendChild(title);
  card.appendChild(note);

  if (kw) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-plain';
    btn.id = 'lib-clear';
    btn.textContent = '清除搜索';
    card.appendChild(btn);
  }
  libList().appendChild(card);
}

function showLibError() {
  libMeta().textContent = '词库加载失败';
  libClear();
  var card = document.createElement('div');
  card.className = 'card state-error';

  var title = document.createElement('div');
  title.className = 'name';
  title.textContent = '😶 词库没打开';

  var note = document.createElement('div');
  note.className = 'meaning';
  note.textContent = '网络可能打了个盹，点下面再试一次。';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-plain';
  btn.id = 'lib-retry';
  btn.textContent = '重试';

  card.appendChild(title);
  card.appendChild(note);
  card.appendChild(btn);
  libList().appendChild(card);
}
