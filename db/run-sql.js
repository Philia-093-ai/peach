#!/usr/bin/env node
// db/run-sql.js —— 把 db/*.sql 逐条执行到 CloudBase PostgreSQL
//
// 为什么要这个脚本：CloudBase CLI（tcb db execute）一次只吃一条 SQL 语句，
// 而 schema.sql 里有十几条、seed.sql 里有多行 INSERT。
// 这个脚本负责「读文件 → 拆成一条条 → 依次交给 CLI 执行 → 打印结果」。
//
// 用法（在本项目根目录，即 peach/ 下执行）：
//   node db/run-sql.js db/schema.sql
//   node db/run-sql.js db/seed.sql
//   node db/run-sql.js db/verify.sql
//
// 前置条件：
//   - 已安装 @cloudbase/cli 并已 `tcb login`
//   - 让脚本找得到 cloudbase 命令：把它的 bin 目录加到 PATH，
//     或设置环境变量 TCBCLI 指向 CLI 入口文件（默认按下面的相对路径找）

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_ID = JSON.parse(fs.readFileSync(path.join(ROOT, 'cloudbaserc.json'), 'utf-8')).envId;

// CLI 入口：优先环境变量，其次项目内常见的安装位置
const CLI = process.env.TCBCLI
  || path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'workspace',
               'node_modules', '@cloudbase', 'cli', 'bin', 'cloudbase');

// 拆 SQL：去掉 -- 行注释，再按分号切
function splitSql(text) {
  const body = text.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');
  return body.split(';').map((s) => s.trim()).filter(Boolean);
}

function exec(sql) {
  const args = [CLI, 'db', 'execute', '-e', ENV_ID, '--sql', sql];
  const r = spawnSync(process.execPath, args, { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
  const out = ((r.stdout || '') + (r.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '');
  return {
    ok: r.status === 0,
    text: out.split('\n').filter((l) => l && !/CloudBase CLI|tcb ai command/.test(l)).join('\n'),
  };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node db/run-sql.js <sql文件>');
    process.exit(1);
  }
  const stmts = splitSql(fs.readFileSync(file, 'utf-8'));
  console.log(`\n=== ${file} —— 共 ${stmts.length} 条语句 ===\n`);
  let ok = 0;
  stmts.forEach((sql, i) => {
    const head = sql.replace(/\s+/g, ' ').slice(0, 70);
    const { ok: good, text } = exec(sql);
    if (good) ok++;
    console.log(`[${i + 1}/${stmts.length}] ${head}`);
    console.log(text + '\n');
  });
  console.log(`=== 完成：${ok}/${stmts.length} 条成功 ===\n`);
  process.exit(ok === stmts.length ? 0 : 1);
}

main();
