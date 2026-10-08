// router.js —— Day 13：视图切换（hash 路由）
//
// 页面之间怎么切换？这里选了 hash 路由，就是网址里那个 # 后面的部分：
//   http://localhost:3000/#/gen     生成器
//   http://localhost:3000/#/library 词库
//   http://localhost:3000/#/about   关于
//
// 为什么是它（三条理由，够用就好）：
//   1) 不用改服务端——# 后面的内容浏览器不发给服务器，直接刷新 #/library 也不会 404。
//      如果用 History API（/library 这种干净地址），刷新要服务器兜底，多一层配置。
//   2) 浏览器自带的前进/后退按钮直接可用，不用自己写历史栈（今天的加练项顺手就有了）。
//   3) 链接可以分享："给你看词库" 直接把带 #/library 的地址发过去就行。
//
// 比喻：hash 路由像"一本书里的书签"——书还是同一本（同一个页面），
//      只是翻到第几页记在书签上；换书签不用重新印书（不用刷新页面）。

var ROUTES = ['gen', 'library', 'about'];
var DEFAULT_ROUTE = 'gen';
var ROUTE_TITLES = {
  gen: '中文名字生成器',
  library: '名字词库',
  about: '关于 peach'
};

// 地址栏里的 hash → 视图名（认不出来的一律回默认视图）
function currentRoute() {
  var h = (location.hash || '').replace(/^#\/?/, '');
  return ROUTES.indexOf(h) > -1 ? h : DEFAULT_ROUTE;
}

function renderRoute(moveFocus) {
  var key = currentRoute();

  // 1) 显示当前视图，藏起其余两个
  ROUTES.forEach(function (r) {
    var sec = document.getElementById('view-' + r);
    if (sec) sec.hidden = (r !== key);
  });

  // 2) 导航上标出"你现在在哪"（肉眼看到的高亮 + 读屏听到的 aria-current）
  var links = document.querySelectorAll('.nav-links a');
  Array.prototype.forEach.call(links, function (a) {
    if (a.getAttribute('data-nav') === key) {
      a.setAttribute('aria-current', 'page');
    } else {
      a.removeAttribute('aria-current');
    }
  });

  // 3) 标签页标题跟着变，浏览器历史里一眼能认出
  document.title = ROUTE_TITLES[key] + ' · peach';

  // 4) 词库视图第一次进来才去加载数据（省一次没必要的请求）
  if (key === 'library' && typeof ensureLibrary === 'function') ensureLibrary();

  // 5) 无障碍：换视图后把焦点送到新视图的标题上（读屏用户才知道"换页了"，
  //    键盘用户的 Tab 也从新页开头继续走），并滚回页面顶部
  if (moveFocus) {
    var h1 = document.querySelector('#view-' + key + ' h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', function () { renderRoute(true); });
document.addEventListener('DOMContentLoaded', function () { renderRoute(false); });
