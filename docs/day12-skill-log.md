# day12-skill-log · filter-check 调用记录

> Skill 文件：`.workbuddy/skills/filter-check/SKILL.md`（本仓库内，Day 12 创建）。
> 约定：每真实调用一次，在这里追加一条；没留痕 = 没调用。

## 调用 1 · 2026-10-08 12:36 · 实现前的设计确认

- 目的：结果区要新增「按名字字数筛选」（全部 / 2 字 / 3 字 / 4 字），动手前按清单把设计过一遍。
- 逐条核对（设计层面）：
  - 1 数据源不动 → 原始批次存 app.js 的 `lastNames`，筛选只产出显示用的拷贝 —— PASS
  - 2 三种情况 → 有结果=过滤渲染+计数文字；无结果=`state-nomatch` 卡+「看全部」出口；清空恢复=「全部」chip —— PASS
  - 3 选中项看得见 → `.chip.on` 底色+描边+字重，`aria-pressed` 同步 —— PASS
  - 4 计数用文字说 → `#result-count` 挂 `role="status"` + `aria-live="polite"` —— PASS
  - 5 只在有数据时出现 → `showEmpty` / `showLoading` / `showError` 里统一 `hideFilter()` —— PASS
  - 6 重新生成回到全部 → `showLoaded` 里 `activeLen = 0` —— PASS
  - 7 不丢焦点 → 按钮只建一次，之后只改状态不重建 —— PASS
  - 8–11 无障碍 → 真 `<button>` + `role="group"`；Tab 可达 + focus 光圈；高度 ≥36px；颜色不单独承载（字重+边框）—— PASS
- 结论：按此设计实现，先写 `public/filter.js`。

## 调用 2 · 2026-10-08 12:41 · 实现后复检（CDP 27/27 PASS）

- 逐条核对（对着 `_cdp_day12.py` 的真实鼠标/键盘断言）：
  - 1 PASS（F.clear-restores：清空后 6 张卡与初始一致）
  - 2 PASS（C 有结果 / D+I 无结果（含宠物场景自然无结果）/ E+F 清空恢复）
  - 3 PASS（C.pressed-synced；J.not-color-alone：选中 600 vs 未选中 400 字重）
  - 4 PASS（B/C/D 计数文案；J.live-region）
  - 5 PASS（A.initial-hide-filter；生成中隐藏在 H 前置步骤验证）
  - 6 PASS（H.regenerate-resets-filter：中途筛 2 字，重新生成后回「全部」）
  - 7 PASS（C.focus-kept：点击后焦点仍在被点 chip；G 回车后同样）
  - 8 PASS（J.semantics-buttons）
  - 9 PASS（G.keyboard-reachable / G.keyboard-focus-visible / G.keyboard-enter-activates）
  - 10 PASS（J.tap-target：实测 37px）
  - 11 PASS（J.not-color-alone）
- 修复记录：G.keyboard-enter-activates 首轮 FAIL——测试脚本用 `rawKeyDown` 发回车，浏览器不走默认行为，按钮没被激活；改用带 `text:"\r"` 的 `keyDown` 后 PASS。**是测试脚本的问题，产品代码没改**。
- 结论：可以交。
