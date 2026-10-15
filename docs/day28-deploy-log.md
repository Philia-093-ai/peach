# 部署日志（Day 28 起建立）｜peach

> **为什么要有这个文件**：静态托管**没有版本管理**（CLI 原文 no version management），"哪个版本在公网上"这件事
> 只有两个地方能查——git 历史（什么代码在）和这个日志（什么时候、为什么、怎么部署的）。
> 从 Day 28 起：**每次部署追加一行**，格式固定：时间 ｜ 动了什么 ｜ 命令 ｜ 耗时 ｜ 怎么校验的。
>
> Day 15–27 的历史条目按当时留存的证据回填；**没有留痕的字段就如实写「未记录」**，不补编。

## 格式

```
| 日期时间 | 动了什么 | 命令 | 耗时 | 校验 | 证据 |
```

## 历史条目（按证据回填）

| 日期 | 动了什么 | 命令 | 耗时 | 校验 | 证据 |
| --- | --- | --- | --- | --- | --- |
| Day 15 | 首次公网部署（静态站上线） | `tcb hosting deploy public -e <env>` | 未记录 | 浏览器打开公网地址 | `docs/day15-web-desktop-bar.png` |
| Day 17 | 前端接读接口 + 云函数首次部署 | `fn deploy api` + `hosting deploy` | 未记录 | `/api/health` 200 | `docs/day17-verify.md` |
| Day 18 | 写接口上线（POST /api/names） | `fn deploy api --force` | 未记录 | 201 实测 | `docs/day18-verify.md` |
| Day 19 | 分层重构（db.js 拆出，接口 1.3.0） | `fn deploy api --force` + `hosting deploy` | 未记录 | 公网 22 项回归 | `docs/day19-verify.md` |
| Day 20 | 首页接真库 | `hosting deploy public` | 未记录 | 改库→刷新跟着变 | `docs/day20-verify.md` |
| Day 22 | PATCH / DELETE 上线（接口 1.4.0） | `fn deploy api --force` + `hosting deploy` | 未记录 | 公网 15 项回归 | `docs/day22-verify.md` |
| Day 23 | 错误统一 + `type` 标签（接口 1.5.0） | `fn deploy api --force` + `hosting deploy` | 未记录 | 400/404 实测 | `docs/day23-verify.md` |
| Day 24 | 忙锁修复上线 | `hosting deploy public` | 未记录 | 修前/修后 A/B 回归 12 项 | `docs/day24-verify.md` |
| Day 26 | **发布 v1.0** | `hosting deploy public --verify` | **4.9 秒** | 9 文件 md5 一致 + preflight 全过 | `_d26_deploy_out.txt` |
| Day 26 | 演练：故意发布坏版本 | 同上 | 5.0 秒 | 公网 404 复现 | `docs/day26-verify.md` |
| Day 26 | 演练：回滚到 v1.0 | 同上 | 7.8 秒 | 9 文件 md5 一致 | `docs/day26-verify.md` |
| Day 27 | 修复场景下拉（4→6） | `hosting deploy public --verify` | 未记录 | 公网 HTML 核对 + preflight | `_d27_deploy_out.txt` |

## Day 28 起的正式记录

| 日期 | 动了什么 | 命令 | 耗时 | 校验 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-15 18:54 | `live.js` 自检台请求数少报 1（`sceneCount+1`→`+2`），`mock.js` 注释同步 | `hosting deploy public -e <env> --verify` | 约 10 秒（rc 0） | 9 文件校验通过；线上 `live.js` 含修复；最终构建上 15 项前端验收重跑全过 | `_d28_deploy_out.txt` |

> 回填说明：Day 15–24 的部署当时没有计时（那时还没有"部署要留痕"的意识），只留了验证文档与截图；
> 这正是要建这个日志的原因——**部署是产品变更的唯一出口，出口不留痕，出了事就只能靠猜。**

## 三条使用规则

1. **每次部署必记一行**，写清"动了什么"和"怎么校验"——没有校验的部署不算部署完成；
2. 部署前先跑 `preflight-check`（P0 红线不过不部署），结果追加到 `docs/day25-preflight-log.md`；
3. 出事要回退时，先看这里确定"现在公网上是什么"，再按 `docs/rollback-playbook.md` 退。
