# day19-verify.md｜Day 19 验证记录（分层重构 + 全接口回归）

> 今天要回答的问题：**拆完之后，「查数据库」这段代码从哪移到了哪？**
> 答案：从 `cloudfunctions/api/index.js` 移到新文件 `cloudfunctions/api/db.js`（数据访问层）。
> 怎么证明没拆坏：本地 23 项 + 公网 22 项全接口回归，全部通过，接口行为零变化。

- 验证时间：2026-10-12 晚
- 环境：CloudBase `apple-1-d2g1zk4836ce03980`（PostgreSQL 17 · 库 `postgres-7emjluwc`）
- 云函数：`api`（Web 函数，Nodejs18.15，路由 `/api` → WEB_SCF `api`，路径传递 Enable）
- 重构内容：见 `docs/day19-layering.md`（含分层示意图）

---

## 1. 重构前后对比

| | 重构前（Day 18） | 重构后（Day 19） |
| --- | --- | --- |
| 文件 | `index.js` 一个文件包办一切 | `index.js`（路由＋业务）+ **`db.js`（数据层，新拆）** |
| 网关配置（REST_BASE / API_KEY） | index.js 顶部 | db.js |
| `dbSelect` / `dbInsert` | index.js | db.js（统一收进内部 `gwCall`） |
| 业务层取数方式 | 自己拼 REST 查询串 `dbSelect('scenes','select=id&name=eq.…')` | 说人话 `db.findSceneByName(scene)` |
| 接口路径 / 字段 / 状态码 | —— | **一个没变**（契约冻结） |

`db.js` 对外只暴露 6 个语义化函数：`listScenes / listSceneNames / findSceneByName / listNamesByScene / findNameInScene / insertName`。
分层边界：db.js 里没有一句 HTTP 话术，index.js 里没有一句数据库话术。

## 2. 本地回归（函数直跑，真 Key，23 项全过）

| 组 | 用例 | 结果 |
| --- | --- | --- |
| 读接口 | health（**version 1.3.0**）/ scenes（count 6）/ library 品牌（count 7 含「云栖」）/ 宠物 / keyword=海 / limit=2 / limit=9999 夹 100 / 场景不存在 400 带可选列表 | ✅ 8/8 |
| 写接口·成功 | POST 宠物 +「回归临时行」+ 超长寓意 → **201**（寓意截到 30 字，char_count=5 服务端算） | ✅ |
| 写接口·拒绝 | 同名 409 / seed 浪屿 409 / 缺 scene 400 / 缺 name 400 / 空体 400 / 超 20 字 400 / 场景不存在 400 / 坏 JSON 400 / 超 4KB 413 | ✅ 9/9 |
| 方法校验 | GET /names 405 / POST /library 405 / PUT 405 / 未知路径 404 | ✅ 4/4 |
| 读回 | 宠物词库含临时行（count 6→7） | ✅ |
| 日志 | 23 条 `[peach-api][req]` 与用例一一对应 | ✅ |
| 清理 | DELETE 临时行（Affected rows: 1）→ names 回到 **37 行** | ✅ |

## 3. 部署

| 环节 | 结果 |
| --- | --- |
| `tcb fn deploy api --force` | ✅ deployed successfully（COS 上传，整个 `cloudfunctions/api/` 目录打包，`db.js` 随包上传） |
| 函数环境变量 `CLOUDBASE_API_KEY` / `TCB_ENV` | ✅ 云端仍在（仓库配置依旧不含密钥） |
| 路由 `/api` → WEB_SCF `api`（路径传递 Enable） | ✅ `tcb routes list` 确认 |
| 公网 `/api/health` | ✅ **version 1.3.0** —— 新代码确实上线了 |

## 4. 公网回归（22 项全过）

| 组 | 用例 | 结果 |
| --- | --- | --- |
| 读接口 | health 1.3.0 / scenes 6 场景 / library 品牌 7（含云栖）/ 宠物 6 / keyword=海 1 / limit=2 截断 / 场景不存在 400 | ✅ 7/7 |
| 写接口 | POST「回归验证行」→ **201**（id=85）→ 同名再投 **409** → seed 浪屿 **409** | ✅ 3/3 |
| 拒绝分支 | 缺 scene / 缺 name / 空体 / 超 20 字 / 场景不存在 / 坏 JSON → **400 ×6**；超 4KB → **413**，提示全是中文 | ✅ 7/7 |
| 方法校验 | GET /names 405 / POST /library 405 / PUT 405 / 404 | ✅ 4/4 |
| 读回 | 宠物词库 count 6→7 含「回归验证行」 | ✅ |
| 数据闭环 | 写前 37 → 写后 **38** → DELETE（Affected rows: 1）→ **37** | ✅ |

> 写路径用一行临时数据验证后已用 SQL 删除，库回到 Day 18 结束时的 37 行
> （seed 36 + Day 18 投稿「云栖」1）。这是清理调试数据的 SQL，不是 DELETE 接口。

## 5. 今天交什么截图

| 文件 | 内容 | 对应要求 |
| --- | --- | --- |
| `day19-files.png` | 项目文件结构，**绿色高亮新拆出的 `db.js`**（6.5 KB） | 新拆出来的数据库操作文件 |
| `day19-api-health-bar.png` | 地址栏 + `GET /api/health` 返回（**version 1.3.0**，证明重构版上线） | 重构后接口仍正常返回 |
| `day19-api-library-bar.png` | 地址栏 + `GET /api/library?scene=品牌&limit=4` 返回（真库数据） | 同上 |

> 截图说明：地址栏外框沿用 Day 15 以来的交付样式合成（无头浏览器没有浏览器 UI），
> 图里内容全部来自公网真实返回（`_d19_shots.py` 生成）。

## 6. 余力加练：分层示意图

- `docs/day19-layering.svg`（放进项目文档，与 `dataflow.svg` 同规格）+ `docs/day19-layering.png`（PNG 版）
- 说明文档 `docs/day19-layering.md`：三层职责表、搬了哪些东西、为什么值得拆、怎么证明没拆坏

## 7. 边界（今天没做的）

- ❌ 改接口路径和字段名（契约冻结，`api-contract.md` Day 19 变更记录写明"无接口变更"）
- ❌ 加新功能（`/api/generate` 真模型、PATCH/DELETE 留第 4 周）
- ✅ 前端 `public/` 一行没动；`db/` 表结构零改动
