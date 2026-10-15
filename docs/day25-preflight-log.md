==========================================================================
  peach 发布前检查报告 · preflight-check
  仓库：C:\Users\lenovo\WorkBuddy\2026-10-08-23-28-22\peach
  模式：--offline（跳过公网项）
==========================================================================

【P0 上线红线】  3/3 通过
  ✅  1. 全仓库无密钥特征词                扫了 132 个被跟踪文件，7 类特征词 0 命中
  ✅  2. .env 真实值没漏进代码            反查 132 处（值长度≥12 的机密键），0 命中；已跳过公开标识：TCB_ENV
  ✅  3. .env 不在仓库里               未跟踪 ✅ / .gitignore:2:.env	.env / 历史 0 次提交 ✅

【P1 线上可用性】  0/5 通过
  ⏭  4. /api/health 通            --offline 已跳过
  ⏭  5. 接口版本一致                   --offline 已跳过
  ⏭  6. 读接口通                     --offline 已跳过
  ⏭  7. 静态托管与仓库一致                --offline 已跳过
  ⏭  8. 首页可访问                    --offline 已跳过

【P2 错误说人话】  1/2 通过
  ⏭  9. 错误响应说人话                  --offline 已跳过
  ✅ 10. 前端无裸报错                   public/*.js 里搜不到 'HTTP ' + status 这类写法（已排除注释）

【P3 代码硬规则】  3/3 通过
  ✅ 11. 结果区无 innerHTML 注入        public/*.js 只有清空式 innerHTML=''，渲染全走 textContent
  ✅ 12. 无静默吞错                    public/ 与 cloudfunctions/ 无 except:pass / 空 catch
  ✅ 13. 异步条件请求有竞态守卫              library.js 有序号+待跑补跑 ✅ · live.js 有序号守卫 ✅

【P4 仓库卫生】  1/2 通过
  ✅ 14. 没把大文件/临时文件带进来            工作区 12 项变更，无 >1MB 文件、无 _/tmp 前缀
  ⚠️ 15. 工作区无未分类文件                有 10 个未跟踪文件需点名说明归属：docs/day14-test-plan.md、docs/day14-test-record.md、docs/day19-api-health.png、docs/day19-api-library.png、docs/day27-feedback.md、docs/day27-fix-dropdown-library.png

==========================================================================
  结论：✅ 可以发布 —— P0 红线 3/3 全过；另有 1 项提醒（不拦发布）
==========================================================================
