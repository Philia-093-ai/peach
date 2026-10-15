# my-website

30 天建站学习计划的项目仓库。

**当前版本：peach v1.0**（2026-10-14 正式发布，2026-10-15 结营验收通过）—— 公网可访问、发布前检查全过、有回滚手册。
发版说明见 [`docs/day26-release-notes.md`](docs/day26-release-notes.md)，
出事怎么退见 [`docs/rollback-playbook.md`](docs/rollback-playbook.md)，
结营验收与复盘见 [`docs/day28-acceptance.md`](docs/day28-acceptance.md) / [`docs/day28-retro.md`](docs/day28-retro.md)。

- Day 2：仓库初始化与首次提交
- Day 7：完成 MVP 功能
- Day 25：发布前检查 Skill（preflight-check）
- Day 26：正式发布 v1.0 + 静态托管回退演练
- Day 28：结营验收（29 项逐项打勾）+ 结营复盘 + 部署日志

> `.env` 文件用于存放数据库等本地配置，已被 `.gitignore` 忽略，不会上传到 GitHub。

## 发布前怎么检查（preflight-check）

上线/部署之前，在仓库根目录跑一条命令：

```bash
python .workbuddy/skills/preflight-check/check.py --repo .            # 全量（含公网）
python .workbuddy/skills/preflight-check/check.py --repo . --offline  # 网络/代理不通时跳过公网项
```

- 输出 15 项检查表（5 组）：**P0 上线红线**（密钥 3 项）、**P1 线上可用性**（5 项）、
  **P2 错误说人话**（2 项）、**P3 代码硬规则**（3 项）、**P4 仓库卫生**（2 项）。
- **任何 P0 项 ❌ → 结论「不许发布」**（退出码 1），先修再跑。
- 检查项的判据、红了怎么修、常见坑：见
  [`.workbuddy/skills/preflight-check/SKILL.md`](.workbuddy/skills/preflight-check/SKILL.md)。
- 每次跑完把结果追加到 `docs/day25-preflight-log.md` 留痕。

它不是 CI——不监听、不自动触发，是**人手动跑的检查单**（登机前逐项打钩那种）。
