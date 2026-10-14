# RUN.md｜peach MVP 运行说明（Day 7 存档 · Day 8 增补 · Day 15 公网版 · Day 16 接入数据库 · Day 17 读接口 · Day 18 写接口 · Day 19 分层重构 · Day 21 周验收 · Day 22 改/删/恢复 · Day 23 密钥排查与错误统一 · Day 24 修复忙锁吞请求 · Day 25 发布前检查 Skill · Day 26 v1.0 发布与回滚演练）

> 一句话：一条命令启动，浏览器打开 <http://localhost:3000> 就能用。

## Day 26 增补：正式发布 v1.0 + 完成一次真实回退演练

- **版本**：页脚徽标 `peach v1.0` + git tag `v1.0`（产品版本）；接口版本仍是 `/api/health` 的 **1.5.0** —— 两个号分开走，别混
- **发布**：`hosting deploy public --verify` 上线；发布前检查 **14 ✅ + 1 ⚠️**，P0 红线 3/3 全过
- **回退演练（真做了）**：故意发布一个"引用不存在的脚本"的坏版本（页面功能全废）→ 公网确认坏了 → 用 git 历史产物重新部署回去 → 公网恢复。**全程计时**，明细见 `docs/rollback-playbook.md`
- **关键事实**：静态托管 `tcb hosting deploy` **没有版本管理**（CLI 原文：no version management），所以"回退"= 用历史产物重新部署，不是点按钮
- **踩到的坑**：`core.autocrlf=true`，用 `git archive` 导出历史产物会**被转成 CRLF**，与线上（LF）字节不一致 → 回退必须用 `git checkout <sha> -- public`（或写回 blob 原文），否则发布前检查第 7 项会误报"本地与线上不一致"
- 证据：`docs/day26-verify.md`（四步 + 耗时）；截图 `day26-v1-live-bar.png`、`day26-rollback-commits.png`、`day26-after-rollback-bar.png`
- 今日不做（清单明令）：云函数回退与数据恢复的**实操**——只写进回滚手册备查

## Day 24 增补：修复「词库切场景不生效」（调试日）

- **症状**：词库页连续切场景，下拉框停在最后一个，列表却停在第一个 —— 界面自相矛盾，且**控制台 0 报错**
- **根因**：`public/library.js` 的 `if (libBusy) return;` 在请求还在飞时把新条件**静默扔掉**（切 3 次只发 1 条请求，F12 Network 可证）
- **修法**：忙时不丢单（`libPending` 记一笔）+ 飞完用最新条件**补跑** + 请求序号（`libSeq`）保证只有最新一次的结果上屏（防"旧响应盖新结果"）
- **余力加练**：首页预览区（`public/live.js` `loadPreview`）同款竞态用序号守卫修掉（迟到的旧响应不再覆盖新场景）
- **验证**：修前/修后同一套动作 A/B（本地 + 公网都跑），回归 12 项全绿；已 `hosting deploy public` 上线
- 证据：`docs/day24-verify.md`（四步证据 + 排除过程 + 记录不修的其他问题）；截图 `day24-repro-f12.png`、`day24-fixed-verify.png`
- 今日未做：修其余已记录的 5 个低优先级问题（见 day24-verify.md 第 5 节）、业务逻辑改动

## Day 23 增补：密钥排查（红线）+ 三类错误提示统一

- **密钥排查**：全仓库 112 个被跟踪文件搜 7 类密钥特征词（ghp_ / AKID / sk- / Bearer 长串 / 私钥头…）→ **0 条**；拿 `.env` 里真实密钥值原样反查 → **0 处**。密钥只活在两处：本机 `.env` 和云函数环境变量
- **.env 检查**：未被 git 跟踪（`ls-files` 不匹配）+ 被忽略（`.gitignore:2`）+ **历史从没提交过**（`git log --all` 为空）——三道全过
- **错误三大类**：`请求有问题`(400/405/409/413) · `找不到`(404) · `服务异常`(500)；失败响应统一带 `type` 标签（服务端 `send()` 出口自动贴），500 的人话按"读/写/删"各一句
- **裸报错清零**：`public/mock.js` 三处调用统一走 `apiFetch`，失败时服务端中文优先、状态码翻译兜底；原来那句 `throw new Error('HTTP ' + res.status)`（用户会看到「HTTP 500」）已删干净
- 部署：`fn deploy api --force`（version **1.5.0**）+ `hosting deploy public`；接口路径/字段/状态码零变化，`type` 是新增字段（向后兼容）
- 证据：本地 6 用例 + 公网 400/404 实测都在 `docs/day23-verify.md`；截图 `day23-secret-search-bar.png`（搜索 0 条）与 `day23-three-errors-bar.png`（三类中文提示）
- 今日未做：复杂异常处理框架、业务逻辑改动（清单明令不做）

## Day 22 增补：PATCH / DELETE 上线，names 的增删改查闭环了

| 接口 | 说明 |
| --- | --- |
| `PATCH /api/names/:id` | 部分更新：只改传的字段（`name` / `meaning`）；改名字时 `char_count` 服务端重算；成功 **200** |
| `DELETE /api/names/:id?confirm=<名字>&mode=soft\|hard` | **删除必须带确认**：`confirm` 要和库里那名字一字不差（否则 400 一条不删）；默认**软删除**（数据还在，可恢复），`?mode=hard` 才真删（不可恢复）；成功 **200** 回执带被删的那条 |
| `POST /api/names/:id/restore` | 把软删除的找回来；真删的行已经不在表里 → 404 |

- 数据库：`names` 加 `is_deleted` / `deleted_at`；唯一约束换成**部分唯一索引** `(scene_id,name) WHERE is_deleted=false`——删过的名字可重新投稿，活着的依旧不能重复
- 前端：词库页每条名字有「删除」按钮，**点第一次只变红问一句（不发请求），再点一次才真删**；生成器页的卡片外观行为和以前完全一样
- 闭环验证：本地 31 项（30 通过 + 1 次偶发超时，复测通过）+ 公网 15 项全过；删后 GET 里该条消失、软删除能找回、真删后 restore 404，全在 `docs/day22-verify.md`
- **浏览器注意**：PATCH/DELETE 不是"简单请求"，会先发 OPTIONS 预检；CloudBase 网关按请求方法回显放行，实测通过（探针见 `docs/day22-verify.md` 第 5 节）
- 部署：`tcb fn deploy api --force`（版本号随代码升到 **1.4.0**）+ `tcb hosting deploy public`；老接口形状零变化
- 今日未做：批量操作、用户系统、词库页的「编辑」表单（PATCH 目前是纯接口能力）、管理端的软删除清理入口

## Day 21 增补：第 3 周验收表 + 同伴交叉验证 + 演示提纲

今天不写新功能，只交验收材料。**第 3 周结论：20/20 PASS**，缺项 2 项如实标记。

| 交付物 | 在哪 |
| --- | --- |
| 周验收表（20 项，逐项带证据链接） | `docs/day21-week3-acceptance.md` |
| 同伴交叉验证三行结论（可打开 / 可读写 / 无报错） | `docs/day21-peer-check.md` |
| 演示提纲四段结构 + 彩排记录 | `docs/day21-demo-outline.md` |
| 三张验收截图 | `docs/day21-acceptance-table-bar.png`、`day21-peer-check-bar.png`、`day21-demo-outline-bar.png` |

- 交叉验证怎么做的：**另写一个脚本（独立通道），只认公网地址、不复用前几天的用例**，按三条判据从头发起——
  实测：首页 200；`/api/scenes` 6 场景、`/api/library` 7 条；`POST /api/names` 真写入 1 行（201，id=88，验后 SQL 清理回 37 行）、重复投稿 409；全程 0 个 5xx、浏览器控制台 0 条 error
- 演示彩排：无头浏览器在公网首页把四段流程走了一遍（选场景 → 填关键词 → 生成 1.00 秒出 6 卡 → 复制 toast），控制台 0 报错
- **缺项（如实）**：① 真人同伴复核未执行（本机没有第二个人，下周第一天按 `day21-peer-check.md` 第 4 节的三条判据点一遍并签名）；② 3 分钟演示视频未录（余力加练，照提纲念即可）
- 今日未动：云函数、数据库、前端代码（`git status` 里只有 docs 与本文档）

---

## Day 19 增补：分层重构（拆出数据访问层 db.js）

接口一个没加、一个没改——今天只动内部结构：**把「查数据库」的代码从 `index.js` 搬进了新文件 `db.js`**。

| 层 | 文件 | 管什么 | 像谁 |
| --- | --- | --- | --- |
| 路由层 | `cloudfunctions/api/index.js`（route） | 看地址，把请求领到该去的柜台 | 前台 |
| 业务层 | `cloudfunctions/api/index.js`（handle*） | 定规矩（必填/长度/场景存在）+ 包装响应 | 经理 |
| **数据层** | **`cloudfunctions/api/db.js`**（Day 19 新拆） | **只管数据怎么进出**（网关地址、API Key、查询串拼法全锁在这） | 档案室管理员 |

- 业务层取数只说"要什么"：`db.listScenes()` / `db.findSceneByName()` / `db.listNamesByScene()` / `db.insertName()`
- 分层示意图（余力加练）：`docs/day19-layering.svg`（PNG 版 `day19-layering.png`），说明文档 `docs/day19-layering.md`
- 回归验证：**本地 23 项 + 公网 22 项全过**，接口路径/字段/状态码零变化；`/api/health` 的 `version` 升到 **1.3.0** 作为"这批代码已上线"的出厂标记（契约形状未动，见 `docs/api-contract.md` 变更记录）
- 部署：`tcb fn deploy api --force`（COS 上传，整个 `cloudfunctions/api/` 目录打包，`db.js` 会跟着一起上去）

---

## Day 18 增补：第一个写接口（POST /api/names）

往词库里**写**一个名字（投稿收录）。这是项目里第一个会改数据库的接口。

| 什么 | 说明 |
| --- | --- |
| `POST /api/names` | 请求体 `{"scene":"品牌","name":"云栖","meaning":"…"}`；成功 **201** `{ok:true,data:{…}}` |
| 必填 | `scene`（须是 scenes 表里的场景）、`name`（1–20 字）；`meaning` 可选（超 30 字服务端截断） |
| 重复提交 | **409**「「品牌」场景下已经有「云栖」这个名字了」——由数据库唯一约束 `names_scene_name_key` 兜底 |
| 缺必填 / 错误输入 | **400** 中文人话（「缺少必填字段：name（名字）」「名字最多 20 个字」「没有「xx」这个场景」…） |
| 请求体上限 | 4 KB，超了 **413**；不是合法 JSON → **400**；用 GET 访问它 → **405** |

- 服务端日志（Day 18 余力加练）：每次请求打一行 `[peach-api][req] {"method":"POST","path":"/names","status":201,"ms":83,"note":"created id=79"}`，云函数日志里可查
- 本地自测 + 公网验证全记录：`docs/day18-verify.md`；契约：`docs/api-contract.md` 第 5 节
- 数据现状：`names` 表 = seed 36 行 + Day 18 投稿 1 行（id 79「云栖」）
- 今日未做：`PATCH` / `DELETE`（第 4 周）、批量写入、`/api/generate` 接真模型、前端投稿表单

---

## Day 17 增补：GET 读接口（词库真数据上线）

页面词库从此**读云数据库**，不再是本地写死的示例数据。

| 什么 | 地址 |
| --- | --- |
| GET /api/scenes（场景字典） | https://apple-1-d2g1zk4836ce03980-1503730028.ap-shanghai.app.tcloudbase.com/api/scenes |
| GET /api/library（词库查询） | 同上域名 `/api/library?scene=品牌&keyword=&limit=` |

- 云函数：`cloudfunctions/api/`（Web 函数，`/api` 路由 → WEB_SCF `api`；`health` 函数保留但路由已切到 `api`）
- 接口怎么读库：经 CloudBase 数据网关（HTTPS + API Key），**Key 只存在函数环境变量里**，仓库与日志里都没有
- 前端开关：`public/mock.js` 里 `LIB_USE_REAL_API = true`（改 `false` 可回退到假词库演练四种状态）
- 部署：`tcb fn deploy api --force` + `tcb hosting deploy public`；路由用 `tcb routes edit`（不要用 `--httpFn --path`，有 CLI bug，见 `docs/day17-verify.md` 坑 1）
- 踩坑记录（路径传递 / CORS / 密钥）：`docs/day17-verify.md`
- 今日未做：业务写入接口（收藏写入留到 Day 18）、改表结构

---

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

## Day 16 增补：数据库（CloudBase PostgreSQL · 第 3 周）

数据库来了（`TECH_DESIGN.md` 第 2 节「本期没有数据库」自今日起作废）。

| 什么 | 在哪 |
| --- | --- |
| 数据模型设计 | `docs/day16-data-model.md` |
| 建表 / 种子 / 验证脚本 | `db/schema.sql`、`db/seed.sql`、`db/verify.sql` |
| 怎么跑 | `node db/run-sql.js db/schema.sql`（依次跑 schema → seed → verify） |
| 详细的执行记录 | `docs/day16-select-verify.md` |
| 数据库本体 | CloudBase PostgreSQL 17 · 环境 `apple-1-d2g1zk4836ce03980` · schema `public` |

- 两张表：`scenes`（场景字典，6 行）+ `names`（名字词条，36 行），靠 **`names.scene_id` → `scenes.id`** 关联
- 看数据：腾讯云开发控制台 → 环境 `apple-1-…` → 「数据库」→ `public` → `scenes` / `names`
- 今日未做：**没写任何接口、没动前端**（读接口 Day 17 开始）

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
   cd C:\Users\lenovo\WorkBuddy\2026-10-08-23-28-22\peach
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
