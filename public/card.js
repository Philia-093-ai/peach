// card.js —— Day 8 余力加练：可复用的名字卡片组件
// 什么叫"组件"？就像乐高积木：一块做好的积木，哪里需要拼哪里。
// createNameCard(item) 接收 { name, meaning }，返回一张拼好的卡片 DOM，
// app.js 拿它渲染成功状态，将来做"历史记录""收藏页"也直接复用。

function createNameCard(item) {
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
  card.appendChild(copy);
  return card;
}

// 列表版：把一批数据一次性铺进容器（卡片列表 = 多块积木排好队）
function renderNameList(container, names) {
  container.textContent = '';
  names.forEach(function (item) {
    container.appendChild(createNameCard(item));
  });
}
