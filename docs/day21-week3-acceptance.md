# day21-week3-acceptance.md｜第 3 周验收表（自查 · 逐项带证据）

> 周验收日（Day 21）。今天不写新功能，只做三件事：**自查周验收表 → 同伴交叉验证 → 缺项如实标记**。
> 验收范围：第 3 周 Day 15–20（公网 → 数据库 → 读写接口 → 分层 → 真数据上屏）。
> 规则：**每一项都必须能点开、能核对**——给不出证据的，不许写 PASS。

- 验收时间：2026-10-12 晚
- 环境：CloudBase `apple-1-d2g1zk4836ce03980`（上海）· PostgreSQL 17 · 云函数 `peach-api v1.3.0`
- 仓库：<https://github.com/Philia-093-ai/peach>
- 复核方式：`docs/day21-peer-check.md`（独立通道三行结论）+ 本表逐项证据链接

---

## 0. 一页结论

| 组 | 项目数 | PASS | FAIL |
| --- | --- | --- | --- |
| A 公网（Day 15） | 2 | 2 | 0 |
| B 数据库（Day 16） | 3 | 3 | 0 |
| C 读接口（Day 17） | 3 | 3 | 0 |
| D 写接口（Day 18） | 3 | 3 | 0 |
| E 分层重构（Day 19） | 2 | 2 | 0 |
| F 真数据上首页（Day 20） | 4 | 4 | 0 |
| G 本周验收动作（Day 21） | 3 | 3 | 0 |
| **合计** | **20** | **20** | **0** |

**第 3 周整体结论：PASS。** 缺项见第 8 节（3 项如实标 FAIL / 未执行，全部转记下周）。
另：Day 15/17 留下的两个卡点（代理 502 推送、`fn deploy --httpFn --path` 的 CLI bug）属于环境/工具问题，不是产品缺项，记录见 `docs/day17-verify.md`。

---

## 1. A 组｜公网可见（Day 15）

| # | 验收标准 | 证据（可打开 / 可核对） | 结论 |
| --- | --- | --- | --- |
| A1 | 前端页面上公网，手机与电脑浏览器都能打开 | 提交 [`19a0231`](https://github.com/Philia-093-ai/peach/commit/19a0231) ｜ 地址与说明见 `RUN.md`「Day 15 增补」 ｜ 截图 `docs/day15-web-desktop-bar.png`、`docs/day15-web-mobile-bar.png`（带地址栏） | ✅ PASS |
| A2 | `/api/health` 公网可访问并返回 `ok:true` | 本次**独立通道**实测：`GET /api/health` → HTTP 200，`peach-api v1.3.0`（见 `docs/day21-peer-check.md` 证据块） ｜ 历史截图 `docs/day15-api-health-bar.png` | ✅ PASS |

> 提醒（不是缺项）：手机第一次打开会先看到 CloudBase 测试域名的「确定访问」拦截页，点一次即可；这是测试域名的行为，换自定义域名后会消失。

## 2. B 组｜数据库（Day 16）

| # | 验收标准 | 证据（可打开 / 可核对） | 结论 |
| --- | --- | --- | --- |
| B1 | 两张核心表建好，说明清楚各存什么、靠哪个字段关联 | `db/schema.sql`（提交 [`33f3106`](https://github.com/Philia-093-ai/peach/commit/33f3106)）｜ 设计说明 `docs/day16-data-model.md` ｜ 关联字段：**`names.scene_id` → `scenes.id`** | ✅ PASS |
| B2 | 种子脚本可重复执行不报错（幂等） | `db/seed.sql`（`ON CONFLICT DO NOTHING`）｜ 连续两次执行的原始记录 `docs/day16-select-verify.md` | ✅ PASS |
| B3 | 每张表 `select` 至少 5 行 | 本次实测：`scenes` = **6** 行、`names` = **37** 行（独立通道读接口复核，见 peer-check）｜ 建表原始记录 `docs/day16-select-verify.md` | ✅ PASS |

## 3. C 组｜读接口（Day 17）

| # | 验收标准 | 证据（可打开 / 可核对） | 结论 |
| --- | --- | --- | --- |
| C1 | GET 读接口公网返回 `{ok:true,data:[...]}` | 本次实测：`/api/scenes` → 200（6 场景）、`/api/library?scene=品牌` → 200（7 条）｜ `docs/day17-verify.md` ｜ 截图 `docs/day17-api-scenes-bar.png`、`docs/day17-api-library-bar.png` | ✅ PASS |
| C2 | 前端词库页读的是真库，不是本地假数据 | `public/mock.js` 的 `LIB_USE_REAL_API = true` ｜ 本次彩排：词库页 7 条、首条「浪屿」｜ 提交 [`417cd95`](https://github.com/Philia-093-ai/peach/commit/417cd95) | ✅ PASS |
| C3 | 改数据库，接口返回跟着变 | `docs/day17-verify.md`（改行 → 接口变 → 还原）｜ `docs/day20-verify.md` 第 5 节同法复验 | ✅ PASS |

## 4. D 组｜写接口（Day 18）

| # | 验收标准 | 证据（可打开 / 可核对） | 结论 |
| --- | --- | --- | --- |
| D1 | POST 写接口真实写入，库多一行 | 本次实测：`POST /api/names`「晴窗」→ **201** `id=88`，读回 `total 7→8`（验后已用 SQL 清理回 37）｜ 历史证据 `docs/day18-verify.md`（id=79）、截图 `docs/day18-post-created.png` ｜ 提交 [`70396db`](https://github.com/Philia-093-ai/peach/commit/70396db) | ✅ PASS |
| D2 | 重复提交被拒，且是中文人话 | 本次实测：同名再投 → **409**「「品牌」场景下已经有「晴窗」这个名字了」｜ `docs/day18-verify.md`（靠唯一约束 `names_scene_name_key` 兜底）｜ 截图 `docs/day18-post-cases.png` | ✅ PASS |
| D3 | 缺必填 / 错误输入被拒，提示是中文 | `docs/day18-verify.md`（缺 scene / 缺 name / 空体 / 超 20 字 / 坏 JSON → 400；超 4KB → 413）｜ 回归复验 `docs/day19-verify.md` 拒绝分支 7/7 | ✅ PASS |

## 5. E 组｜分层重构（Day 19）

| # | 验收标准 | 证据（可打开 / 可核对） | 结论 |
| --- | --- | --- | --- |
| E1 | 「查数据库」的代码拆进独立文件，接口契约零变化 | 提交 [`d51bf21`](https://github.com/Philia-093-ai/peach/commit/d51bf21) ｜ 新文件 `cloudfunctions/api/db.js` ｜ 三层职责与示意图 `docs/day19-layering.md` / `day19-layering.svg` | ✅ PASS |
| E2 | 拆完全接口回归通过 | `docs/day19-verify.md`：本地 **23 项** + 公网 **22 项**全过，`/api/health` version 升 1.3.0 作为「新代码已上线」的出厂标记 | ✅ PASS |

## 6. F 组｜真数据上首页 · 公网可分享（Day 20）

| # | 验收标准 | 证据（可打开 / 可核对） | 结论 |
| --- | --- | --- | --- |
| F1 | 公网首页展示数据库真实数据 | 截图 `docs/day20-home-live-bar.png` ｜ 本次彩排实时读到：**6 个场景 / 37 个名字** + 场景分布 + 真名预览卡 | ✅ PASS |
| F2 | 改数据库，刷新页面跟着变 | `docs/day20-verify.md` 第 5 节（改 → 刷新变 → 还原 → 跟着还原，全程不重部署）｜ 截图 `docs/day20-home-updated-bar.png` ｜ 提交 [`b98e51b`](https://github.com/Philia-093-ai/peach/commit/b98e51b) | ✅ PASS |
| F3 | F12 里页面发出的请求是公网地址 | `docs/day20-verify.md` 第 4 节：9 个请求全部是 `*.app.tcloudbase.com` 公网域名，无一 localhost | ✅ PASS |
| F4 | 余力加练：加「最后更新时间」 | 本次彩排实录：`🕘 数据最后更新：2026-10-12 20:59:53（服务端时间）`——取自 `/api/health` 的服务端时间，不是本机时钟 | ✅ PASS |

## 7. G 组｜本周验收动作（Day 21）

| # | 验收标准 | 证据（可打开 / 可核对） | 结论 |
| --- | --- | --- | --- |
| G1 | 周验收表逐项有证据 | 本文件（20 项，每项带提交号 / 文件 / 截图 / 实测记录） | ✅ PASS |
| G2 | 同伴交叉验证给出三行结论 | `docs/day21-peer-check.md`：**可打开 ✅ / 可读写 ✅ / 无报错 ✅**，附原始响应与脚本 | ✅ PASS |
| G3 | 演示提纲四段写出并完整走通一遍 | `docs/day21-demo-outline.md`（用户问题 → 核心流程 → 提示词改写 → 验证方式）+ 彩排记录（四段一次走通，控制台 0 报错） | ✅ PASS |

## 8. 缺项如实标记（今天没做到的，不许糊过去）

| # | 缺项 | 为什么没做 | 标记 | 去处 |
| --- | --- | --- | --- | --- |
| X1 | **人工同伴复核**（找一位真人同学，按三条判据各点一遍） | 本机环境里没有第二个真人；今日由**独立通道**（另写脚本、只走公网、不复用旧用例）代跑并给出三行结论 | ⚠️ **未执行（人工部分）** | 下周第一天补：把 `docs/day21-peer-check.md` 的三条判据原样交给同伴点一遍，签名回填 |
| X2 | 3 分钟演示视频（余力加练） | 时间盒优先给验收与证据整理；录屏不是本周完成标准 | ❌ **FAIL（未执行）** | 下周余力时段补录，脚本照 `docs/day21-demo-outline.md` 念 |
| X3 | 生成器接真模型（`/api/generate` 后端） | 契约早签好（`docs/api-contract.md`），实现本来排在**第 4 周**，不属本周验收 | ⏭️ **本期未做（计划内）** | 第 4 周第 1 项：把 `getData()` 的 mock 换成真接口 + 模型 API |

> 说明：X1 与 X2 是**今天真正的缺项**，如实标未完成；X3 是计划内延期，不算欠账，列出来是为了让「本周到底做完了什么」一眼看清边界。

## 9. 这周最花时间的一步（今天要回答的问题）

**答：不是写接口，是「把公网这条链路一次性打通」——Day 15 的部署环境与 Day 17 的跨域排查。**

- 写代码的时间是可预期的（表设计 → 接口 → 分层，每步都在计划内）；**踩坑的时间不可预期**：Day 15 的事件函数 / Web 函数类型 + 路由 `WEB_SCF`，Day 17 的路径传递差异与「网关 + 函数两层 CORS 打架」，每一个都可能吃掉半天。
- 但这些时间不是白花：坑解决一次，就把「公网部署」这件事从**玄学**变成了**步骤**（现在整套配方已经沉淀成 skill，下次从零到公网只需照抄）。
- **值不值？值。** 第 1–2 周的东西只有自己能跑；第 3 周之后，`https://…tcloudbaseapp.com/#/gen` 这条链接发给任何人就能看——「能分享」是产品第一次真正成立的标志。花在链路和跨域上的时间，换来的是后面每一次部署都不再重新踩坑；如果第 4 周才第一次上公网，同样的坑会在更忙的时候踩。
