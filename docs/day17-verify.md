# day17-verify.md｜Day 17 验证记录（GET 读接口 + 真库 + 部署）

> 今天要回答的问题：**页面上那份词库，凭什么相信它是真的？**
> 答案：接口读的是 Day 16 建的 `scenes` / `names` 两张真表，改一行库数据、刷新接口立刻跟着变（见第 4 节）。

- 验证时间：2026-10-11 晚
- 环境：CloudBase `apple-1-d2g1zk4836ce03980`（PostgreSQL 17.11 · 库 `postgres-7emjluwc`）
- 云函数：`api`（Web 函数，Nodejs18.15，`/api` 路由 → WEB_SCF `api`）
- 公网地址：见今天截图 `day17-*-bar.png` 的地址栏（按惯例不写死在文档里）

---

## 1. 接口清单（今天交付的）

| 接口 | 方法 | 数据来源 | 状态 |
| --- | --- | --- | --- |
| `/api/health` | GET | 无（体检） | ✅ 已部署 |
| `/api/scenes` | GET | `scenes` 表（6 行） | ✅ 已部署 |
| `/api/library` | GET | `names` 表（36 行，经 `scene_id` 关联） | ✅ 已部署 |

`/api/generate`（POST）不在今天范围（Day 18+）。前端词库入口 `public/mock.js` 的
`libraryRequest` 已切到真接口（`LIB_USE_REAL_API = true`）；生成器仍是假数据，互不影响。

## 2. 公网验证（Python 直连，不经过浏览器）

对 6 个场景逐一请求 `/api/library?scene=<场景名>`，全部 200、各 6 条（6×6=36，与库一致）。

| 用例 | 结果 |
| --- | --- |
| `/api/health` | 200，`{"ok":true,"service":"peach-api","version":"1.1.0",...}` |
| `/api/scenes` | 200，`count:6`，含全部 6 个场景（按 `sort_order` 升序） |
| `/api/library`（缺省=品牌） | 200，`count:6, total:6` |
| `/api/library?scene=宠物` | 200，`count:6`（汤圆/煤球/布丁/来福/雪碧/年糕） |
| 其余 4 个场景 | 200，`count:6` |
| `?limit=2` | 200，`count:2, total:6`（**余力加练：条数参数**） |
| `?limit=9999` | 200，`limit` 被夹到 100（防拖库上限生效） |
| `?keyword=风` | 200，`count:1`（南风集——寓意里含"风"） |
| `?scene=不存在的场景` | 400 + 可选场景列表（人话报错，不丢堆栈） |

## 3. 部署链路验证

| 环节 | 结果 |
| --- | --- |
| 云函数部署（`tcb fn deploy api --force`） | ✅ Deployment completed |
| 函数环境变量 `CLOUDBASE_API_KEY` / `TCB_ENV` | ✅ 云端配置完好；**cloudbaserc.json 里已不含密钥**（见坑 4） |
| HTTP 路由 `/api` → WEB_SCF `api` | ✅ `tcb routes list` 确认（Day 15 的旧路由原指向 `health`，今日已切到 `api`） |
| 静态托管（`tcb hosting deploy public`） | ✅ 8 个文件上传并校验一致 |
| 前端页显示真数据 | ✅ 见 `day17-web-live-bar.png` |

## 4. 真库验证（「改一行，跟着变」）

用 SQL 直接改库，**不重新部署、不改任何代码**，再问公网接口：

| 步骤 | 操作 | 接口返回的第一条 |
| --- | --- | --- |
| ① 改前 | — | 浪屿 · 想象一座海上小岛，安静得只听得见浪。 |
| ② 改库 | `UPDATE names SET meaning='（Day 17 真库验证专用文案）' WHERE id=1`（Affected rows: 1） | — |
| ③ 再问接口 | GET `/api/library` | 浪屿 · **（Day 17 真库验证专用文案）** ✅ 跟着变了 |
| ④ 还原 | `UPDATE ... SET meaning='想象一座海上小岛…' WHERE id=1` | 浪屿 · 想象一座海上小岛，安静得只听得见浪。 ✅ 还原了 |

> 这一步是今天最有说服力的证据：**页面上的词库是"活的"**——数据在数据库里，接口只是那扇窗。

## 5. 今天踩的坑（3 个，都修了）

### 坑 1：网关的「路径传递」开关

`fn deploy --httpFn --path /api` 在创建访问路径那一步报 `TypeError: Cannot read properties of undefined (reading 'Name')`（CLI 的 bug）。函数本体部署成功了，但路由没建。
**修法**：改用 `tcb routes edit` 直接把 `/api` 指到 `api` 函数；同时函数里做**路径归一化**——网关的 `EnablePathTransmission` 开着关着，`/api/scenes` 和 `/scenes` 两种路径都能对上。

### 坑 2：CORS 双层叠加

前端页面（`*.tcloudbaseapp.com`）跨域调接口（`*.app.tcloudbase.com`）报 `Failed to fetch`。
排查（CDP Network + 带 Origin 的裸请求）发现响应头是：

```
access-control-allow-origin: https://xxx.tcloudbaseapp.com,*
```

**两个值拼在一个头里 = 非法值**。原因：CloudBase 网关自己会做一层 CORS（把请求的 Origin 回显进这个头），函数里再写一个 `*`，两边一拼就坏了。
**修法**：函数里**删掉全部 CORS 头**，跨域统一交给网关。修完浏览器 fetch 正常。
（教训：平台层已经做了的事，业务代码别再做第二遍——两遍不是"双保险"，是互相打架。）

### 坑 3：密钥绝不入库

部署函数的环境变量一度被写进 `cloudbaserc.json`（明文 Key）。已处理：
- `cloudbaserc.json` 还原为**不含密钥**的版本，并实测确认：**用不含 `envVariables` 的配置重新部署，云端已有的环境变量不会被抹掉**——所以仓库配置可以永远不带密钥；
- Key 只留本机 `.env`（`.gitignore` 第 2 行起就忽略它）；日志输出一律脱敏。

## 6. 今天交什么截图

| 文件 | 内容 | 对应要求 |
| --- | --- | --- |
| `day17-api-library-bar.png` | 公网 `/api/library?scene=品牌&limit=3` 的 JSON | GET 接口公网返回（含地址栏 + 真数据） |
| `day17-api-scenes-bar.png` | 公网 `/api/scenes` 的 JSON | 场景字典接口 |
| `day17-web-live-bar.png` | 前端词库页，页面上 6 个名字就是真库数据 | 页面显示真实数据（含地址栏） |

> 说明：地址栏外框是按 Day 15 以来的交付样式用 PIL 合成的（无头浏览器截图没有浏览器 UI），
> 截图内容全部来自公网真实返回，无任何摆拍。
