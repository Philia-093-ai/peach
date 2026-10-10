# RUN.md｜peach MVP 运行说明（Day 7 存档 · Day 8 增补 · Day 15 公网版）

> 一句话：一条命令启动，浏览器打开 <http://localhost:3000> 就能用。

## Day 15 增补：公网地址（CloudBase · 第 3 周）

| 什么 | 地址 |
| --- | --- |
| 前端页面（手机可开） | https://apple-1-d2g1zk4836ce03980-1503730028.tcloudbaseapp.com/ |
| /api/health 体检接口 | https://apple-1-d2g1zk4836ce03980-1503730028.ap-shanghai.app.tcloudbase.com/api/health |

- 环境：CloudBase 体验版 `apple-1-d2g1zk4836ce03980`（上海，到期 2027-04-10）
- 手机第一次打开会先看到「确定访问」提示页（CloudBase 测试域名的拦截页），点一下即可，此后不再出现
- 部署方式：`tcb fn deploy health --httpFn`（Web 函数，代码在 `cloudfunctions/health/`）+ `tcb hosting deploy public /`；配置见 `cloudbaserc.json`
- 第 3 周接口约定：`docs/api-contract.md`（改接口先改它）

---

## Day 8 增补：mock 数据开关（public/mock.js）

- `MOCK_MODE = true`（当前）：页面用**本地假数据**渲染四种状态（空 / 加载 / 成功 / 错误），不调后端
- `MOCK_FORCE_ERROR = true`：每次生成都失败，用来看「错误状态 + 重试按钮」长什么样
- `MOCK_DELAY`：假网络延迟（默认 800 毫秒），调大可以让骨架屏多停一会儿
- 第 3 周接真 API：把 `MOCK_MODE` 改成 `false` 即走 Day 7 的 `POST /api/generate`（本地词库版）

## 怎么跑起来

1. 打开终端
2. 进入项目目录：

   ```bat
   cd C:\Users\lenovo\WorkBuddy\2026-09-26-21-44-36\peach
   ```

3. 启动：

   ```bat
   node server.js
   ```

   看到 `peach MVP 已启动：http://localhost:3000` 就是成功了。

4. 浏览器打开 <http://localhost:3000> —— 选场景、填关键词、点「生成名字」。
   （交作业截图时，记得让地址栏里的 `localhost` 出现在图里）
5. 停止服务：在终端按 `Ctrl + C`。

## 前置条件

- Node.js 22（本机已装 v22.22.2 ✅）
- **不需要 `npm install`**：后端只用 Node 内置模块，前端是原生 HTML/CSS/JS

## 常见问题

- 提示端口被占用（`EADDRINUSE`）→ 换个端口再跑：`set PORT=3001 && node server.js`，然后打开 <http://localhost:3001>
- 页面打不开 → 确认第 3 步那个终端窗口还开着（服务在前台运行，关掉窗口服务就停了）
- 次数用完了想再测 → 这是按天计的（存在浏览器 localStorage，key 形如 `peach_quota_2026-09-26`），明天自动恢复；本地测试也可以在浏览器控制台执行 `localStorage.clear()` 后刷新

## 当前版本如实说明（第一版和想象的差距）

- ✅ 已实现（对照 PRD 验收标准）：
  - 名字生成：场景 + 关键词 → 每次 6 个名字，每个带 ≤30 字寓意和复制按钮（A3/A4）
  - 工具首页：标题 + 一句话说明 + 表单 + 结果区 + 底部「每日免费生成 5 次」（A2）
  - 每日额度：localStorage 按天计数，第 6 次拦截并提示，失败那次不扣（A7/A8）
  - 输入校验：空关键词 / 超 20 字直接拦截，不发请求（A5/A6）
- ⚠️ 未接入：**文本生成模型 API**（PRD 里假设的「真 AI」）。当前是本地词库 + 规则组合生成，名字与关键词的相关性和惊喜感都有限——这是今天能诚实跑起来的第一版，也是「想象 vs 现实」差距最大的一处
- ⏭️ 下一步候选：注册模型 API（如 DeepSeek / 智谱）→ 只需替换 `server.js` 调用 `lib/generator.js` 的那一段；部署到公网（A9 需要公开链接，今天只做了本地版）
- 「本期不做」清单（登录/支付/多工具聚合/历史记录…）今天依然没碰，见 `PRD.md` 2.2
