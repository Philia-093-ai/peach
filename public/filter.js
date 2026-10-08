// filter.js —— Day 12：结果区筛选组件（按名字字数）
//
// 筛选是什么？就像在书架前挑书：书（数据）一本都没少，只是"先看哪几本"变了。
// 所以这个组件只做一件事：按字数条件决定显示哪几张卡；原始数据一根手指都不碰
// ——只有数据源原样留着，"清空恢复"才恢复得回来。
//
// 规则来源：项目内 Skill —— .workbuddy/skills/filter-check/SKILL.md（改这里之前先读它）

// 四个固定选项：全部 + 2/3/4 字（生成出来的名字就这几种长度）
var FILTER_OPTIONS = [
  { len: 0, label: '全部' },
  { len: 2, label: '2 字' },
  { len: 3, label: '3 字' },
  { len: 4, label: '4 字' }
];

var chipEls = []; // 缓存已建好的按钮，避免每次点击都重建（重建会把键盘焦点扔掉）

function nameLength(name) {
  return String(name == null ? '' : name).split('').length;
}

// 按字数过滤：len = 0 表示"全部"（原样返回一份拷贝，数据源不受影响）
function filterByName(names, len) {
  if (!len) return names.slice();
  return names.filter(function (item) { return nameLength(item.name) === len; });
}

// 建 / 更新筛选条：按钮只在第一次建一遍，之后只改状态（class + aria-pressed 同步）
function renderFilterBar(container, activeLen, onPick) {
  if (chipEls.length !== FILTER_OPTIONS.length) {
    container.textContent = '';
    chipEls = [];
    FILTER_OPTIONS.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';                       // 真按钮：键盘能 Tab 到、能回车触发
      b.className = 'chip';
      b.textContent = opt.label;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { onPick(opt.len); });
      container.appendChild(b);
      chipEls.push(b);
    });
  }
  chipEls.forEach(function (b, i) {
    var on = FILTER_OPTIONS[i].len === activeLen;
    b.className = on ? 'chip on' : 'chip';
    // 眼睛看到的选中态，读屏也要听到同一件事（无障碍 11）
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

// 数据被清空（生成中 / 出错 / 回到初始）时，把筛选条整个收起来
function resetFilterBar(container) {
  container.textContent = '';
  chipEls = [];
}

// 计数文字：数量变化必须有一句话说出来，不能只靠卡片变少
function countText(shown, total, len) {
  if (!len) return '共 ' + total + ' 个名字';
  if (shown === 0) return '没有 ' + len + ' 字的名字（共 ' + total + ' 个）';
  return '筛选出 ' + shown + ' 个 · 共 ' + total + ' 个';
}

// 无结果状态：说清"没有几字的"，并给一条出路（筛选条此时仍在，用户不会被锁在空页面）
function renderNoMatch(container, len, total, onReset) {
  var card = document.createElement('div');
  card.className = 'card state-nomatch';

  var title = document.createElement('div');
  title.className = 'name';
  title.textContent = '这批里没有 ' + len + ' 个字的名字';

  var note = document.createElement('div');
  note.className = 'meaning';
  note.textContent = '这次一共生成 ' + total + ' 个，换个字数看看，或者直接看全部。';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-plain';
  btn.textContent = '看全部 ' + total + ' 个';
  btn.addEventListener('click', onReset);

  card.appendChild(title);
  card.appendChild(note);
  card.appendChild(btn);
  container.appendChild(card);
}
