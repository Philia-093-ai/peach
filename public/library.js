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
  libraryRequest(scene, kw) // 数据源在 mock.js 里切换：Day 17 起默认走真接口（云数据库）
    .then(function (res) {
      // Day 17：字段名从 names 改成 data —— 和云端读接口 /api/library 的返回形状对齐
      if (res && res.ok && res.data && res.data.length) {
        showLibLoaded(res.data, scene, kw);
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
  // 复用 Day 8 的可复用卡片 + Day 11 的复制反馈；Day 22 起多传一个"删除"处理函数
  renderNameList(libList(), names, { onDelete: libDelete });
}

// ---------- Day 22：删除（两步确认）----------
// 今天要掌握的那件事：**删除比新增更容易出事** —— 新增错了是"多一行废数据"，
// 删除错了是"用户的东西没了"。所以这里在**人这一侧**再加一道确认：
//   第一次点「删除」→ 按钮变成「确认删除「xxx」？」（armed 状态），**不发请求**；
//   再点一次才真发请求。4 秒不点自动收回，避免"变红了忘在那儿"之后误点。
// （另一道在服务端：DELETE 必须带 ?confirm=名字，见 index.js。两道加起来才叫"确认"。）
var libDeleteTimer = null;

function armDelete(btn, name) {
  btn.setAttribute('data-armed', '1');
  btn.className = 'copy del armed';
  btn.textContent = '确认删除「' + name + '」？';
  clearTimeout(libDeleteTimer);
  libDeleteTimer = setTimeout(function () { disarmDelete(btn); }, 4000);
}

function disarmDelete(btn) {
  if (!btn) return;
  btn.removeAttribute('data-armed');
  btn.className = 'copy del';
  btn.textContent = '删除';
}

function libDelete(item, btn) {
  if (!btn.getAttribute('data-armed')) {   // 第一步：只是"亮红"确认，不发请求
    armDelete(btn, item.name);
    return;
  }
  clearTimeout(libDeleteTimer);            // 第二步：真删
  btn.disabled = true;
  btn.textContent = '删除中…';
  deleteNameRequest(item.id, item.name)
    .then(function (res) {
      showToast('已删除「' + item.name + '」' + (res && res.recoverable ? '· 数据仍保留在云端，可恢复' : ''));
      loadLibrary();                       // 重新拉一次列表：页面上的数字永远等于服务端的真相
    })
    .catch(function (err) {
      btn.disabled = false;
      disarmDelete(btn);
      showToast((err && err.message) || '删除失败，请稍后再试');
    });
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
