-- ============================================================================
-- db/schema.sql —— peach 数据模型（建表）
-- Day 16｜第 3 周
--
-- 目标数据库：CloudBase PostgreSQL（环境 apple-1-d2g1zk4836ce03980，schema public）
-- 设计文档  ：docs/day16-data-model.md
-- 执行方式  ：tcb db execute --sql "<一条语句>"   （CLI 一次跑一条，见 db/README.md）
--
-- 幂等：所有语句都带 IF NOT EXISTS / COMMENT ON，重复执行不报错、不改数据。
-- 术语：本文件里的「表」= PostgreSQL 的表（table），对应 CloudBase 控制台
--       「数据库 → public schema」下能看到的那张表。
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 表 1：scenes —— 场景字典表（一行 = 一个命名场景）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenes (
  id          integer     PRIMARY KEY,
  name        text        NOT NULL UNIQUE,
  sort_order  smallint    NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  scenes             IS '命名场景字典表：一行 = 一个场景（品牌/店铺/宠物/网络昵称/作品/游戏角色）';
COMMENT ON COLUMN scenes.id          IS '场景编号：人工指定的稳定整数（不用自增——字典表的值要跨环境一致，seed 与前端才对得上）';
COMMENT ON COLUMN scenes.name        IS '场景名（中文）；直接给界面显示和前端下拉用；唯一约束防止出现两个「品牌」';
COMMENT ON COLUMN scenes.sort_order  IS '排序权重：数字小的排前面，决定界面下拉框里场景的先后顺序';
COMMENT ON COLUMN scenes.created_at  IS '创建时间（带时区）；默认取数据库当前时间，插入时不用手动填';


-- ---------------------------------------------------------------------------
-- 表 2：names —— 名字词条表（一行 = 词库里的一个名字）
--        靠 scene_id 关联到 scenes.id —— 这就是今天要找的「关联字段」
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS names (
  id          serial      PRIMARY KEY,
  scene_id    integer     NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  meaning     text        NOT NULL,
  char_count  smallint    NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT names_scene_name_key UNIQUE (scene_id, name)
);

COMMENT ON TABLE  names             IS '名字词条表：一行 = 词库里的一个名字；靠 scene_id 关联到 scenes 表（主表 + 字典表的经典结构）';
COMMENT ON COLUMN names.id          IS '词条编号：自增整数主键——词条会不断新增，交给数据库自动发号最省心';
COMMENT ON COLUMN names.scene_id    IS '关联字段：指向 scenes.id，说明「这个名字属于哪个场景」；外键约束保证不能挂到不存在的场景上';
COMMENT ON COLUMN names.name        IS '名字本身（如「浪屿」）；与 scene_id 组合唯一（names_scene_name_key），防止同一场景里重复收录';
COMMENT ON COLUMN names.meaning     IS '一句话寓意（≤30 字，PRD A4 的硬要求）；超过 30 字的由 Day 17 的服务端截断，不交给前端';
COMMENT ON COLUMN names.char_count  IS '名字的字数（1–20）；给词库「按字数筛选」用（Day 12 前端那三个按钮的数据来源）';
COMMENT ON COLUMN names.created_at  IS '创建时间（带时区）；默认取数据库当前时间';


-- ---------------------------------------------------------------------------
-- 索引
-- ---------------------------------------------------------------------------
-- 说明：UNIQUE (scene_id, name) 已经自动建了一个以 scene_id 打头的索引，
--       所以「按场景查名字」本身就已经很快，不需要再单独给 scene_id 建索引。
-- 下面这条是给「按场景 + 按字数筛选」准备的（Day 17 读接口会用到）：
CREATE INDEX IF NOT EXISTS names_scene_char_idx ON names (scene_id, char_count);
