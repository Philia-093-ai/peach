# day24-verify｜修复一个真实 Bug 并留全证据（存档）

> 任务：复现 → 定位 → 修复 → 验证，四步证据齐全。
> 结论先行：**词库页「请求在飞时再操作」会静默丢请求，页面显示的内容和选中的条件对不上。**
> 根因一行：`public/library.js` 的 `if (libBusy) return;` 把忙时来的新条件**扔掉**了。

---

## 0. Bug 是怎么找到的（按任务清单的降级提示走的）

按清单提示「找不到 Bug 就用**空值、超长文本、快速连点**等刁钻输入生成补充测试用例」，
先用脚本把常规路径全撞了一遍（空关键词 / 40 字超长 / emoji / 全虚词 / 换行制表符 /
非法 hash 路由 / 搜索 `%`、`'`、`_`、`<img>` / 快速连点生成与复制），**全绿**。

撞出问题的是「快速连点」这一类：**词库页连续切场景**。

## 1. ① 复现（两处独立复现，同一套动作）

动作：进入词库页 → 把「场景」下拉连续切成 宠物 → 店铺 → 网络昵称（同一瞬间连发）。

| 现场 | 下拉框显示 | 列表标题显示 | 列表内容 |
| --- | --- | --- | --- |
| 本地 `http://localhost:3000/#/library` | 网络昵称 | **「宠物」词库共 6 个名字** | 汤圆/煤球/布丁/来福/雪碧/年糕 |
| 公网 `https://…tcloudbaseapp.com/#/library` | 网络昵称 | **「宠物」词库共 6 个名字** | 汤圆/煤球/布丁/来福/雪碧/年糕 |

- 本地原始输出：`_d24_before_out.txt`（A 段）；公网原始输出：`_d24_probe4_out.txt`（2 段）
- 现场截图：`docs/day24-repro-f12.png`（左半边就是修前页面实拍）

**关键证据（F12 Network，CDP 抓的真实记录）**：切了 **3 次**，浏览器只发出 **1 条**
`GET /api/library?scene=宠物&keyword=` —— 后两次根本没发出去。
**F12 Console：0 条报错**。这是「静默失败」：控制台一声不响，所以证据落在请求计数上。

## 2. ② 定位：排除其他原因，锁定真因

排除顺序（每一条都有独立证据，不是猜的）：

| 嫌疑 | 怎么排除 | 证据 |
| --- | --- | --- |
| 接口坏了 / 返回错 | **独立通道**：绕开页面直接打 API | `scene=宠物/店铺/网络昵称` 全部 `200 ok=true total=6`（`_d24_before_out.txt` C 段） |
| 数据脏了 | 同上（接口端出来的名字和库里一致） | 同上 |
| 网络太慢 / 抖动 | 控速后照常复现；且失败请求计数 = 0 | Network 面板 `loadingFailed = 0` |
| JS 异常 | F12 Console 全程 **0 条**（探针先用 `console.error` + 主动抛错**校准过**，确认抓得到才下的结论） | `_d24_probe3_out.txt` 0-A 段 |
| 请求发错了地址 | 抓到的请求 URL、参数、返回全部正确 | `scene=宠物&keyword=` → 200 |

剩下的唯一解释：**后两次切换根本没发请求**。代码里只有一处能拦住它：

```js
// public/library.js（改前）
function loadLibrary() {
  if (libBusy) return;   // ← 忙的时候直接 return：新条件被静默扔掉
  libBusy = true;
  …
  .then(function () { libBusy = false; });
}
```

这行本意是"防连点"，实际效果是"**丢单**"：第一次请求在飞（词库接口正常要几百毫秒），
后面的切换全被 `return` 吃掉；第一次落地后列表就永远停在第一个场景，
而下拉框已经是用户最后选的那个 —— 界面从此自相矛盾，且没有任何报错提示。

## 3. ③ 修复（不丢单 + 最后一次赢）

```js
// public/library.js（改后）
if (libBusy) { libPending = true; return; }  // 不丢单：记一笔，这次飞完补跑
libBusy = true; libPending = false;
var seq = ++libSeq;                          // 领号：只有最新一次的结果能上屏
…
.then(function (res) {
  if (seq !== libSeq) return;                // 迟到的旧响应：丢弃，不许盖新结果
  …
})
.then(function () {
  libBusy = false;
  if (libPending) loadLibrary();             // 补跑：条件取的是最新的
});
```

三件事各管一件事：**不丢单**（pending 补跑）、**不串台**（seq 序号守卫，防"旧响应盖新结果"）、
**不重复**（飞的途中攒多次也只补跑一次，不会狂发请求）。

**余力加练（第二个 Bug，同一类根因）**：首页实时块的预览区（`public/live.js` 的
`loadPreview`）完全没有守卫 —— 连点两个场景标签时，**先发出**的请求若**后回来**，
会把新场景的名字盖掉。修法同款：给预览区发"请求序号"，只有最新一次能上屏。
用 CDP 拦截把「宠物」的响应扣住、等「网络昵称」回来再放行，修前/修后都能稳定触发对比
（`_d24_before_out.txt` B 段 vs `_d24_after_*_out.txt` B 段）。

## 4. ④ 验证留证

**A/B 对比（同一套动作，修前 vs 修后）**

| | 修复前 | 修复后 |
| --- | --- | --- |
| 3 次切换发出的请求 | 1 条 | **2 条**（首次 + 补跑） |
| 下拉框 vs 列表 | 网络昵称 vs 宠物 ❌ | **一致 ✅**（本地 + 公网） |
| 首页预览区（迟到响应） | 被旧响应覆盖 ❌ | **一致 ✅** |

- 修后本地：`_d24_after_local_out.txt`；修后公网（已部署）：`_d24_after_pub_out.txt`
- 截图：`docs/day24-repro-f12.png`（复现现场 + F12 原文）、`docs/day24-fixed-verify.png`（修复后正常运行）

**回归（确认没碰坏正常路径，12 项全绿）**：`_d24_regress_out.txt`
首页实时块数字 → 生成 6 卡 → 筛选 4 字/回全部 → 造行 → 单次切场景 → 删除（toast + 列表自动刷新 8→7）→
搜索「海」命中 1 条 → 控制台 0 报错。实验数据已清理（软删后 restore → hard 删，`品牌` 回到 7 条）。

**部署**：今天只改前端 → `tcb hosting deploy public`（云函数没动，version 仍 1.5.0）；
修后公网实测一致（`_d24_after_pub_out.txt`）。

## 5. 今天记录但不修的其他问题（清单明令"顺手不修，记下来"）

1. **公网首次访问，文档请求返回 404 + 一道「风险提醒/确定访问」拦截页**（F12 有一条红字
   `GET …tcloudbaseapp.com/ 404`，点掉之后一切正常且控制台干净）。属 CloudBase 静态托管的
   访问确认机制，不是站内代码问题 → 待在托管设置里处理。
2. **`public/app.js` 的 `getData()` 用相对地址 `fetch('/api/generate')`**：公网静态域名没有
   `/api/*` 路由（实测 404 NoSuchKey），`MOCK_MODE` 一旦关掉，公网生成器必挂。
   接 `/api/generate` 真接口（第 4 周既定任务）时必须一并改成 `API_BASE + '/generate'`。
3. **`lib/generator.js` 的 `buildPool` 没走场景兜底**：`generate()` 对未知场景有
   `SCENES[scene] || SCENES['品牌']`，但 `buildPool` 里直接用 `SCENES[scene].pool` ——
   陌生场景会 500（`TypeError: reading 'pool'`），和"兜底成品牌"的设计意图相悖。
4. **`loadLive()` 是同一款忙锁写法**（`if (liveBusy) return;`），但首页实时块没有"条件随操作变化"
   的入口，危害低，暂不动。
5. **`libDelete` 的 armed 定时器是全局一个**：先点亮 A 再点亮 B，A 的自动收回会被清掉
   （A 保持"待确认"状态，之后误点一下就会删）。低优先级。

## 6. 证据文件清单

| 类型 | 文件 |
| --- | --- |
| 复现脚本 | `_d24_probe*.py`（1–5 轮）、`_d24_before.py` |
| 修后验证 | `_d24_after.py local|pub`、`_d24_regress.py`、`_d24_deploy.py` |
| 原始输出 | `_d24_probe*_out.txt`、`_d24_before_out.txt`、`_d24_after_local_out.txt`、`_d24_after_pub_out.txt`、`_d24_regress_out.txt` |
| 必交截图 | `docs/day24-repro-f12.png`、`docs/day24-fixed-verify.png` |
| 探针校准记录 | `_d24_probe3_out.txt`（console.log/error/warn 三条全抓到，证明"0 报错"结论可信） |

> 排查花絮：复现脚本自己先踩了一次今天的课 —— 探针里一句
> `except Exception: pass` 把 `json` 未导入的 NameError 吞掉，害我白查了三轮"为什么抓不到"。
> **静默失败最大的代价，是你不知道它在静默。** 这也是今天这个 Bug 最值得记住的地方。
