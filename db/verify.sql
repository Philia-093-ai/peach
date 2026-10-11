-- ============================================================================
-- db/verify.sql —— select 验证（Day 16 板块④）
--
-- 作用：建表 + 灌种子之后，用 SELECT 确认两件事：
--       ① 每张核心表至少有 5 行数据；
--       ② 数据本身是干净的（关联没断、寓意没超长、字数字段没算错）。
--
-- 执行方式：tcb db execute --sql "<一条语句>"（CLI 一次跑一条，见 db/README.md）
-- ============================================================================


-- ① 表 1 场景表 —— 应有的样子：6 行，按 sort_order 排
SELECT id, name, sort_order, created_at FROM scenes ORDER BY sort_order;


-- ② 表 2 名字表 —— 应有的样子：36 行（这里展示前 10 行；全量见下面第 ⑤ 条）
SELECT id, scene_id, name, meaning, char_count FROM names ORDER BY id LIMIT 10;


-- ③ 两个计数：一眼看清「每张核心表到底有多少行」——验收标准要求都 ≥ 5
SELECT
  (SELECT count(*) FROM scenes) AS scenes_rows,
  (SELECT count(*) FROM names)  AS names_rows;


-- ④ JOIN 验证：靠 names.scene_id = scenes.id 这根线，把两张表连起来按场景分组
SELECT s.id AS scene_id, s.name AS scene, count(n.id) AS name_count
FROM scenes s
LEFT JOIN names n ON n.scene_id = s.id
GROUP BY s.id, s.name
ORDER BY s.sort_order;


-- ⑤ 数据体检（每一条都该返回 0 或达标值）
--   5.1 断线检查：有没有名字挂在「不存在的场景」上？应为 0
SELECT count(*) AS orphan_names
FROM names n LEFT JOIN scenes s ON n.scene_id = s.id
WHERE s.id IS NULL;

--   5.2 寓意长度：PRD A4 要求 ≤ 30 字。下面是实际最长的一条，应 ≤ 30
SELECT max(char_length(meaning)) AS max_meaning_len FROM names;

--   5.3 字数字段：char_count 是否与名字真实字数一致？不一致的应为 0 条
SELECT count(*) AS wrong_char_count FROM names WHERE char_count <> char_length(name);

--   5.4 重复收录：同一场景里有没有重名？应为 0
SELECT count(*) AS dup_in_scene FROM (
  SELECT scene_id, name FROM names GROUP BY scene_id, name HAVING count(*) > 1
) t;
