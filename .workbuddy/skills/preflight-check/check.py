#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
preflight-check · peach 发布前检查
-----------------------------------
用法：
    python check.py --repo .            # 全量（含公网检查）
    python check.py --repo . --offline  # 跳过公网项（网络/代理不通时用）
    python check.py --repo . --save report.txt

输出：15 项分组检查表（✅ / ❌ / ⚠️ / SKIP）+ 证据 + 结论。
退出码：P0 有 ❌ → 1（不许发布）；否则 0。
"""

import argparse
import hashlib
import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

# ---------------------------------------------------------------- 常量

API  = 'https://apple-1-d2g1zk4836ce03980-1503730028.ap-shanghai.app.tcloudbase.com'
SITE = 'https://apple-1-d2g1zk4836ce03980-1503730028.tcloudbaseapp.com'

# 密钥特征词（P0-1）
KEY_PATTERNS = [
    ('GitHub 个人令牌',   re.compile(r'ghp_[A-Za-z0-9]{20,}')),
    ('GitHub 细粒度令牌', re.compile(r'github_pat_[A-Za-z0-9_]{20,}')),
    ('腾讯云 SecretId',   re.compile(r'AKID[A-Za-z0-9]{10,}')),
    ('OpenAI 风格 key',   re.compile(r'sk-[A-Za-z0-9]{20,}')),
    ('私钥文件头',        re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----')),
    ('裸 Bearer 长令牌',  re.compile(r'Bearer\s+[A-Za-z0-9\-_.]{40,}')),
    ('硬编码密钥赋值',    re.compile(r'''(?i)(secret|token|api[_-]?key|passwd|password)\s*[:=]\s*['"][A-Za-z0-9_\-]{24,}['"]''')),
]

BIG_FILE = 1024 * 1024  # 1MB

# .env 里这些键是「公开标识」，不是机密——本来就该出现在配置/文档里（Day 23 已确认）
PUBLIC_ENV_KEYS = {'TCB_ENV', 'TCB_REGION', 'ENV_ID'}


def strip_js_comment(line):
    """粗略去掉 JS 注释（避开字符串里的 //，比如 https://）。
    目的：注释里写的反面教材（如 'HTTP ' + res.status）不该被当成真代码。
    能处理：行内 // 注释、整行 // 注释、/* */ 单行块、JSDoc 的 * 续行。
    处理不了：跨行的 /* ... */ 中段（极少见，靠人工复核）。"""
    s = line.strip()
    if s.startswith('*') or s.startswith('/*'):
        return ''
    out = []
    i, n = 0, len(line)
    quote = None
    while i < n:
        ch = line[i]
        if quote:
            if ch == '\\':
                out.append(line[i:i + 2]); i += 2; continue
            if ch == quote:
                quote = None
            out.append(ch); i += 1; continue
        if ch in '\'"`':
            quote = ch; out.append(ch); i += 1; continue
        if ch == '/' and i + 1 < n and line[i + 1] == '/':
            break
        out.append(ch); i += 1
    return ''.join(out)

# ---------------------------------------------------------------- 工具


def find_git():
    import shutil
    g = shutil.which('git')
    if g:
        return g
    cand = r'C:\Users\lenovo\WorkBuddy\2026-09-20-22-16-49\mingit\mingw64\bin\git.exe'
    return cand if os.path.exists(cand) else None


class Ctx(object):
    def __init__(self, repo, offline):
        self.repo = os.path.abspath(repo)
        self.offline = offline
        self.git = find_git()
        self.env = dict(os.environ)
        if self.git and 'mingit' in self.git.lower():
            mingit = os.path.dirname(os.path.dirname(self.git))
            self.env['GIT_EXEC_PATH'] = os.path.join(mingit, 'libexec', 'git-core')
            self.env['Path'] = os.path.dirname(self.git) + ';' + self.env.get('Path', '')
            self.env['GIT_SSL_NO_VERIFY'] = '1'

    def git_run(self, args, timeout=90):
        if not self.git:
            return -1, '', 'git not found'
        p = subprocess.run([self.git] + args, cwd=self.repo, capture_output=True,
                           text=True, encoding='utf-8', errors='replace',
                           env=self.env, timeout=timeout)
        return p.returncode, (p.stdout or ''), (p.stderr or '')

    def tracked_files(self):
        rc, out, _ = self.git_run(['ls-files'])
        return [f for f in out.splitlines() if f.strip()]

    def read_text(self, rel):
        p = os.path.join(self.repo, rel)
        try:
            with open(p, 'r', encoding='utf-8', errors='replace') as fh:
                return fh.read()
        except Exception:
            return None


def http_get(url, timeout=30):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={'User-Agent': 'peach-preflight'})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.status, r.read()


def http_call(method, url, body=None, timeout=30):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    headers = {'User-Agent': 'peach-preflight'}
    if data:
        headers['Content-Type'] = 'application/json; charset=utf-8'
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')


# ---------------------------------------------------------------- 结果收集

class Report(object):
    def __init__(self):
        self.rows = []   # (group, no, name, status, evidence)

    def add(self, group, no, name, status, evidence):
        self.rows.append([group, no, name, status, evidence])

    def count(self, group, status):
        return sum(1 for r in self.rows if r[0] == group and r[3] == status)

    def total(self, group):
        return sum(1 for r in self.rows if r[0] == group)

    def p0_failed(self):
        return [r for r in self.rows if r[0] == 'P0' and r[3] == 'FAIL']


OK, FAIL, WARN, SKIP = 'PASS', 'FAIL', 'WARN', 'SKIP'
MARK = {OK: '✅', FAIL: '❌', WARN: '⚠️', SKIP: '⏭'}


# ---------------------------------------------------------------- P0

def check_p0(c, rep):
    tracked = c.tracked_files()
    # 1 密钥特征词
    hits = []
    for rel in tracked:
        if rel == '.env':
            continue  # .env 本就不该在仓库里；但它若被提交，第 3 项会单独报出来
        txt = c.read_text(rel)
        if not txt:
            continue
        for i, line in enumerate(txt.splitlines(), 1):
            code = strip_js_comment(line) if rel.endswith(('.js', '.md', '.html', '.css')) else line
            for label, pat in KEY_PATTERNS:
                if pat.search(code):
                    hits.append('%s:%d 命中「%s」' % (rel, i, label))
    if hits:
        rep.add('P0', 1, '全仓库无密钥特征词', FAIL,
                '发现 %d 处：%s' % (len(hits), '；'.join(hits[:5])))
    else:
        rep.add('P0', 1, '全仓库无密钥特征词', OK,
                '扫了 %d 个被跟踪文件，7 类特征词 0 命中' % len(tracked))

    # 2 .env 真实值反查
    env_path = os.path.join(c.repo, '.env')
    leaks = []
    vals_checked = 0
    skipped_public = []
    if os.path.exists(env_path):
        envvals = []
        with open(env_path, 'r', encoding='utf-8', errors='replace') as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if len(v) < 12:
                    continue
                if k in PUBLIC_ENV_KEYS:
                    skipped_public.append(k)   # 公开标识，允许出现在配置里
                    continue
                envvals.append((k, v))
        for rel in tracked:
            txt = c.read_text(rel)
            if not txt:
                continue
            for k, v in envvals:
                vals_checked += 1
                if v in txt:
                    leaks.append('%s 的值出现在 %s' % (k, rel))
    if leaks:
        rep.add('P0', 2, '.env 真实值没漏进代码', FAIL, '；'.join(leaks[:5]))
    else:
        rep.add('P0', 2, '.env 真实值没漏进代码', OK,
                '反查 %d 处（值长度≥12 的机密键），0 命中%s'
                % (vals_checked, '；已跳过公开标识：' + '、'.join(skipped_public) if skipped_public else ''))

    # 3 .env 不在仓库
    rc_ls, out_ls, _ = c.git_run(['ls-files', '--error-unmatch', '.env'])
    tracked_env = (rc_ls == 0)
    rc_ci, out_ci, _ = c.git_run(['check-ignore', '-v', '.env'])
    ignored = (rc_ci == 0 and out_ci.strip() != '')
    rc_log, out_log, _ = c.git_run(['log', '--all', '--oneline', '--', '.env'])
    history_clean = (out_log.strip() == '')
    if tracked_env or not ignored or not history_clean:
        detail = '被跟踪=%s / 被忽略=%s / 历史干净=%s' % (tracked_env, ignored, history_clean)
        rep.add('P0', 3, '.env 不在仓库里', FAIL, detail)
    else:
        rep.add('P0', 3, '.env 不在仓库里', OK,
                '未跟踪 ✅ / %s / 历史 0 次提交 ✅' % (out_ci.strip() or '被忽略 ✅'))


# ---------------------------------------------------------------- P1

def check_p1(c, rep):
    if c.offline:
        for no, name in [(4, '/api/health 通'), (5, '接口版本一致'), (6, '读接口通'),
                         (7, '静态托管与仓库一致'), (8, '首页可访问')]:
            rep.add('P1', no, name, SKIP, '--offline 已跳过')
        return

    # 4 health
    try:
        st, body = http_call('GET', API + '/api/health')
        j = json.loads(body)
        ok = (st == 200 and j.get('ok') is True and j.get('service') == 'peach-api')
        rep.add('P1', 4, '/api/health 通', OK if ok else FAIL,
                'HTTP %d, ok=%s, service=%s' % (st, j.get('ok'), j.get('service')))
        health_ver = j.get('version')
    except Exception as e:
        rep.add('P1', 4, '/api/health 通', FAIL, '请求失败：%s' % repr(e)[:120])
        health_ver = None

    # 5 版本一致
    pkg_ver = None
    txt = c.read_text(os.path.join('cloudfunctions', 'api', 'package.json'))
    if txt:
        try:
            pkg_ver = json.loads(txt).get('version')
        except Exception:
            pkg_ver = None
    if health_ver and pkg_ver and health_ver == pkg_ver:
        rep.add('P1', 5, '接口版本一致', OK, '线上 %s == package.json %s' % (health_ver, pkg_ver))
    else:
        rep.add('P1', 5, '接口版本一致', FAIL,
                '线上 %s vs package.json %s（不一致或取不到）' % (health_ver, pkg_ver))

    # 6 读接口
    try:
        st1, b1 = http_call('GET', API + '/api/scenes')
        j1 = json.loads(b1)
        st2, b2 = http_call('GET', API + '/api/library?scene=' + urllib.parse.quote('品牌'))
        j2 = json.loads(b2)
        ok = (st1 == 200 and j1.get('ok') and isinstance(j1.get('data'), list)
              and st2 == 200 and j2.get('ok') and isinstance(j2.get('data'), list))
        rep.add('P1', 6, '读接口通', OK if ok else FAIL,
                '/scenes HTTP %d（%d 个场景）· /library HTTP %d（%d 条）'
                % (st1, len(j1.get('data') or []), st2, len(j2.get('data') or [])))
    except Exception as e:
        rep.add('P1', 6, '读接口通', FAIL, '请求失败：%s' % repr(e)[:120])

    # 7 静态托管一致
    pubdir = os.path.join(c.repo, 'public')
    diff, same, missing = [], 0, []
    if os.path.isdir(pubdir):
        for name in sorted(os.listdir(pubdir)):
            p = os.path.join(pubdir, name)
            if not os.path.isfile(p):
                continue
            url = SITE + '/' + ('' if name == 'index.html' else name)
            try:
                st, remote = http_get(url)
            except Exception as e:
                missing.append('%s(%s)' % (name, repr(e)[:40]))
                continue
            local = open(p, 'rb').read()
            if hashlib.md5(remote).hexdigest() == hashlib.md5(local).hexdigest():
                same += 1
            else:
                diff.append('%s 线上%dB/本地%dB' % (name, len(remote), len(local)))
    if diff or missing:
        rep.add('P1', 7, '静态托管与仓库一致', FAIL,
                '不一致：%s %s' % ('；'.join(diff[:4]), ('取不到：' + '；'.join(missing[:3])) if missing else ''))
    else:
        rep.add('P1', 7, '静态托管与仓库一致', OK, 'public/ %d 个文件 md5 全一致（已部署）' % same)

    # 8 首页
    try:
        st, body = http_get(SITE + '/')
        text = body.decode('utf-8', 'replace')
        ok = (st == 200 and '中文名字生成器' in text)
        rep.add('P1', 8, '首页可访问', OK if ok else FAIL,
                'HTTP %d，含站点标题：%s' % (st, '是' if '中文名字生成器' in text else '否'))
    except Exception as e:
        rep.add('P1', 8, '首页可访问', FAIL, '请求失败：%s' % repr(e)[:120])


# ---------------------------------------------------------------- P2

def check_p2(c, rep):
    if c.offline:
        rep.add('P2', 9, '错误响应说人话', SKIP, '--offline 已跳过')
    else:
        try:
            st, body = http_call('GET', API + '/api/names/999999')
            j = json.loads(body)
            has_stack = ('at ' in body and '.js:' in body)
            cn = bool(re.search(r'[\u4e00-\u9fa5]', j.get('error', '')))
            ok = (400 <= st < 500 and j.get('ok') is False and cn
                  and j.get('type') and not has_stack)
            rep.add('P2', 9, '错误响应说人话', OK if ok else FAIL,
                    'HTTP %d，error=「%s」，type=%s，堆栈=%s'
                    % (st, (j.get('error') or '')[:30], j.get('type'), '有' if has_stack else '无'))
        except Exception as e:
            rep.add('P2', 9, '错误响应说人话', FAIL, '请求失败：%s' % repr(e)[:120])

    # 10 前端无裸报错
    bad = []
    pubdir = os.path.join(c.repo, 'public')
    if os.path.isdir(pubdir):
        for name in sorted(os.listdir(pubdir)):
            if not name.endswith('.js'):
                continue
            txt = c.read_text(os.path.join('public', name))
            for i, line in enumerate((txt or '').splitlines(), 1):
                code = strip_js_comment(line)
                if re.search(r"HTTP\s*['\"]?\s*\+", code) or "'HTTP ' +" in code:
                    bad.append('%s:%d' % (name, i))
    if bad:
        rep.add('P2', 10, '前端无裸报错', FAIL, '把状态码直接抛给用户：%s' % '；'.join(bad))
    else:
        rep.add('P2', 10, '前端无裸报错', OK, "public/*.js 里搜不到 'HTTP ' + status 这类写法（已排除注释）")


# ---------------------------------------------------------------- P3

def check_p3(c, rep):
    pubdir = os.path.join(c.repo, 'public')
    # 11 innerHTML
    bad = []
    if os.path.isdir(pubdir):
        for name in sorted(os.listdir(pubdir)):
            if not name.endswith('.js'):
                continue
            txt = c.read_text(os.path.join('public', name)) or ''
            for i, line in enumerate(txt.splitlines(), 1):
                code = strip_js_comment(line)
                if 'innerHTML' in code and not re.search(r"innerHTML\s*=\s*['\"]['\"]", code):
                    bad.append('%s:%d' % (name, i))
    if bad:
        rep.add('P3', 11, '结果区无 innerHTML 注入', FAIL, '可疑：%s' % '；'.join(bad[:5]))
    else:
        rep.add('P3', 11, '结果区无 innerHTML 注入', OK, 'public/*.js 只有清空式 innerHTML=\'\'，渲染全走 textContent')

    # 12 静默吞错
    bad = []
    scan_dirs = [('public', ('public',)), ('cloudfunctions', ('cloudfunctions',))]
    pats = [re.compile(r'except\s*:\s*pass'), re.compile(r'catch\s*\([^)]*\)\s*\{\s*\}')]
    for label, (sub,) in scan_dirs:
        base = os.path.join(c.repo, sub)
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in ('node_modules', '.git')]
            for f in files:
                if not f.endswith(('.js', '.py')):
                    continue
                fp = os.path.join(root, f)
                rel = os.path.relpath(fp, c.repo).replace('\\', '/')
                try:
                    txt = open(fp, 'r', encoding='utf-8', errors='replace').read()
                except Exception:
                    continue
                for i, line in enumerate(txt.splitlines(), 1):
                    for pat in pats:
                        if pat.search(line):
                            bad.append('%s:%d' % (rel, i))
    if bad:
        rep.add('P3', 12, '无静默吞错', FAIL, '空吞错误：%s' % '；'.join(bad[:5]))
    else:
        rep.add('P3', 12, '无静默吞错', OK, 'public/ 与 cloudfunctions/ 无 except:pass / 空 catch')

    # 13 竞态守卫
    lib = c.read_text(os.path.join('public', 'library.js')) or ''
    live = c.read_text(os.path.join('public', 'live.js')) or ''
    lib_ok = bool(re.search(r'\b\w*Seq\b', lib)) and bool(re.search(r'\b\w*[Pp]ending\b', lib))
    live_ok = bool(re.search(r'\b\w*Seq\b', live))
    if lib_ok and live_ok:
        rep.add('P3', 13, '异步条件请求有竞态守卫', OK,
                'library.js 有序号+待跑补跑 ✅ · live.js 有序号守卫 ✅')
    else:
        rep.add('P3', 13, '异步条件请求有竞态守卫', FAIL,
                'library.js %s · live.js %s（可能退回忙锁丢单写法）'
                % ('✅' if lib_ok else '❌', '✅' if live_ok else '❌'))


# ---------------------------------------------------------------- P4

def check_p4(c, rep):
    rc, out, _ = c.git_run(['status', '--porcelain'])
    entries = []
    for line in out.splitlines():
        if len(line) < 4:
            continue
        code, path = line[:2], line[3:].strip()
        entries.append((code, path))

    # 14 大文件/临时文件
    bad = []
    for code, path in entries:
        full = os.path.join(c.repo, path)
        base = os.path.basename(path)
        if os.path.isfile(full) and os.path.getsize(full) > BIG_FILE:
            bad.append('%s(%.1fMB)' % (path, os.path.getsize(full) / 1048576.0))
        if base.startswith('_') or '/tmp/' in ('/' + path) or path.startswith('tmp/'):
            bad.append('%s(临时文件)' % path)
    if bad:
        rep.add('P4', 14, '没把大文件/临时文件带进来', FAIL, '；'.join(bad[:5]))
    else:
        rep.add('P4', 14, '没把大文件/临时文件带进来', OK,
                '工作区 %d 项变更，无 >1MB 文件、无 _/tmp 前缀' % len(entries))

    # 15 待分类文件
    untracked = [p for code, p in entries if code.strip() == '??']
    if untracked:
        rep.add('P4', 15, '工作区无未分类文件', WARN,
                '有 %d 个未跟踪文件需点名说明归属：%s'
                % (len(untracked), '、'.join(untracked[:6])))
    else:
        rep.add('P4', 15, '工作区无未分类文件', OK, '没有遗留未跟踪文件')


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--save')
    args = ap.parse_args()

    c = Ctx(args.repo, args.offline)
    rep = Report()
    groups = [('P0', '上线红线', check_p0), ('P1', '线上可用性', check_p1),
              ('P2', '错误说人话', check_p2), ('P3', '代码硬规则', check_p3),
              ('P4', '仓库卫生', check_p4)]
    for _, _, fn in groups:
        try:
            fn(c, rep)
        except Exception as e:
            # 不写 except: pass —— 检查脚本自己静默失败最要命
            import traceback
            rep.add('ERR', 0, fn.__name__, FAIL, '检查器异常：%s' % traceback.format_exc()[-200:])

    lines = []
    lines.append('=' * 74)
    lines.append('  peach 发布前检查报告 · preflight-check')
    lines.append('  仓库：%s' % c.repo)
    lines.append('  模式：%s' % ('--offline（跳过公网项）' if c.offline else '全量（含公网）'))
    lines.append('=' * 74)
    for g, label, _ in groups:
        lines.append('')
        lines.append('【%s %s】  %d/%d 通过' % (g, label, rep.count(g, OK), rep.total(g)))
        for row in rep.rows:
            if row[0] != g:
                continue
            lines.append('  %s %2d. %-24s %s' % (MARK[row[3]], row[1], row[2], row[4]))
    for row in rep.rows:
        if row[0] == 'ERR':
            lines.append('  %s 检查器异常：%s' % (MARK[row[3]], row[4]))

    failed_p0 = rep.p0_failed()
    lines.append('')
    lines.append('=' * 74)
    if failed_p0:
        lines.append('  结论：❌ 不许发布 —— P0 红线有 %d 项未过：%s'
                     % (len(failed_p0), '、'.join(r[2] for r in failed_p0)))
    else:
        warns = [r for r in rep.rows if r[3] == WARN]
        tail = ('；另有 %d 项提醒（不拦发布）' % len(warns)) if warns else ''
        lines.append('  结论：✅ 可以发布 —— P0 红线 3/3 全过%s' % tail)
    lines.append('=' * 74)

    text = '\n'.join(lines)
    print(text)
    if args.save:
        with open(args.save, 'w', encoding='utf-8') as fh:
            fh.write(text + '\n')
        print('\n(报告已存到 %s)' % args.save)
    return 1 if failed_p0 else 0


if __name__ == '__main__':
    sys.exit(main())
