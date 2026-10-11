# db/ —— peach 的数据库（Day 16 建）

> 一句话：这个文件夹管「数据长什么样」（`schema.sql`）、「里面装什么」（`seed.sql`）、
> 「装对了没有」（`verify.sql`），以及「怎么把它们跑到云上」（`run-sql.js`）。

## 数据库在哪

| 项 | 值 |
| --- | --- |
| 平台 | CloudBase（腾讯云开发）体验版 |
| 环境 ID | `apple-1-d2g1zk4836ce03980`（上海） |
| 数据库类型 | **PostgreSQL 17**（CloudBase 的 PostgreSQL 环境） |
| 库 / schema | `postgres-7emjluwc` / `public` |
| 我们的两张表 | `public.scenes`、`public.names` |

> 看数据：腾讯云开发控制台 → 选环境 `apple-1-…` → 左侧「数据库」→ 展开 `public` → 点 `scenes` / `names`。

## 四个文件各管什么

| 文件 | 管什么 | 幂等？ |
| --- | --- | --- |
| `schema.sql` | **建表**：`scenes`、`names` 两张表 + 字段注释 + 索引 | ✅ 全带 `IF NOT EXISTS`，重复跑不报错 |
| `seed.sql` | **灌种子**：6 个场景 + 36 个名字 | ✅ 靠 `ON CONFLICT DO NOTHING`，重复跑不报错、不重复插 |
| `verify.sql` | **select 验证**：行数够不够、关联有没有断、寓意有没有超长 | ✅ 纯查询，不改数据 |
| `run-sql.js` | 把上面某个 `.sql` **逐条执行**到云数据库 | —— |

设计说明见 `docs/day16-data-model.md`。

## 怎么跑

在项目根目录（`peach/`）下：

```bash
node db/run-sql.js db/schema.sql    # ① 建表
node db/run-sql.js db/seed.sql      # ② 灌种子（可以重复跑）
node db/run-sql.js db/verify.sql    # ③ 验证
```

前置条件：
- 已安装 CloudBase CLI 并登录过（`tcb login`）；
- 脚本默认从 `~/.workbuddy/binaries/node/workspace/node_modules/@cloudbase/cli` 找 CLI；
  装在别处就设环境变量 `TCBCLI` 指过去。

## 为什么需要 run-sql.js 这个小脚本

CloudBase CLI 执行 SQL 的命令（`tcb db execute --sql "..."`）**一次只吃一条语句**，
而 `schema.sql` 有 15 条、`seed.sql` 有 2 条。总不能手工复制 15 次——
所以写个脚本「读文件 → 按分号拆 → 一条条喂给 CLI → 打印结果」。

想手工执行单条也可以：

```bash
tcb db execute --sql "SELECT count(*) FROM names"
```

## 两张表的关系（30 秒版）

```
scenes（场景字典，6 行）        names（名字词条，36 行）
  id ─────────────────────────── scene_id   ← 靠这根线关联
  name（品牌/店铺/…）             name（浪屿/晨野/…）
  sort_order                     meaning（寓意）
                                 char_count（字数）
```

想连起来看，就是一次 JOIN：

```sql
SELECT s.name AS scene, n.name, n.meaning
FROM names n JOIN scenes s ON n.scene_id = s.id
WHERE s.name = '品牌';
```
