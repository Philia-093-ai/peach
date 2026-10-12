// card.js —— Day 8 余力加练：可复用的名字卡片组件（Day 22 加一个可选的「删除」按钮）
// 什么叫"组件"？就像乐高积木：一块做好的积木，哪里需要拼哪里。
// createNameCard(item) 接收 { name, meaning }，返回一张拼好的卡片 DOM，
// app.js 拿它渲染成功状态，将来做"历史记录""收藏页"也直接复用。
//
// Day 22 的扩展**必须是可选的**：只有传了 opts.onDelete 才生成「删除」按钮。
//   所以生成器结果页（不传）拿到的卡片和以前一模一样 —— 老组件的兼容性没破。

function createNameCard(item, opts) {
  var card = document.createElement('div');
  card.className = 'card';

  var name = document.createElement('div');
  name.className = 'name';
  name.textContent = String(item.name == null ? '' : item.name);

  var meaning = document.createElement('div');
  meaning.className = 'meaning';
  meaning.textContent = String(item.meaning == null ? '' : item.meaning);

  var copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy';
  copy.textContent = '复制';
  copy.addEventListener('click', function () { copyText(item.name, copy); });

  card.appendChild(name);
  card.appendChild(meaning);

  if (opts && typeof opts.onDelete === 'function') {
    // 复制 + 删除并排放进操作区（删除按钮的危险色在 style.css 的 .copy.del 里）
    var actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.appendChild(copy);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'copy del';
    del.textContent = '删除';
    // 读屏念出来也知道删的是哪一个（不能只有"删除"两个字）
    del.setAttribute('aria-label', '删除名字「' + name.textContent + '」');
    del.addEventListener('click', function () { opts.onDelete(item, del); });
    actions.appendChild(del);

    card.appendChild(actions);
  } else {
    card.appendChild(copy);
  }
  return card;
}

// 列表版：把一批数据一次性铺进容器（卡片列表 = 多块积木排好队）
function renderNameList(container, names, opts) {
  container.textContent = '';
  names.forEach(function (item) {
    container.appendChild(createNameCard(item, opts));
  });
}
