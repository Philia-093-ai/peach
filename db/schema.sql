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


-- ============================================================================
-- Day 22 增补：软删除（余力加练）——「删除」不再真的把行抹掉
-- 第 4 周
--
-- 为什么：新增一条数据，错了顶多是一条废数据；删掉一条数据，错了**就没了**。
--         所以给 names 加一个 is_deleted 标记：删除 = 把标记翻成 true，
--         查询一律带上 is_deleted=eq.false —— 用户看到的是"删掉了"，
--         数据库里那行还在，删错了随时能找回来（restore）。
-- ============================================================================

ALTER TABLE names ADD COLUMN IF NOT EXISTS is_deleted  boolean     NOT NULL DEFAULT false;
ALTER TABLE names ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

COMMENT ON COLUMN names.is_deleted IS '软删除标记：true = 已删除（行还在，随时可恢复）；查询一律过滤 is_deleted=false，所以删过的名字不会再被读出来';
COMMENT ON COLUMN names.deleted_at IS '删除时间：软删除时打上时间戳，恢复（restore）时清空；留一条「什么时候被我删的」线索';

-- 把 (scene_id, name) 的唯一约束换成「只约束没被删的行」的部分唯一索引：
--   删过的名字可以重新投稿（新起一行），而活着的名字依旧不能重复 —— 409 的保护一分没少。
ALTER TABLE names DROP CONSTRAINT IF EXISTS names_scene_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS names_scene_name_live_key
  ON names (scene_id, name) WHERE is_deleted = false;

-- 查询索引同步改成"只索引活着的行"（读接口永远带 is_deleted=false，走这个更小更快的索引）
DROP INDEX IF EXISTS names_scene_char_idx;
CREATE INDEX IF NOT EXISTS names_scene_char_live_idx
  ON names (scene_id, char_count) WHERE is_deleted = false;
