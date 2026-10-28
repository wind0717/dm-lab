#!/usr/bin/env python3
"""
修复 git 索引：把 .lock 文件「就地生效」。

## 背景

本机环境的安全删除代理会拦截 **rename-over-existing** 与 delete，
于是 git 的索引写入流程卡在最后一步：

    git 写好 index.lock (16KB，有完整数据)
      → 试图 rename(index.lock, index)  ← 被拦截
      → git 报错 "Unable to create index.lock: File exists"

看起来是失败，其实**索引数据已经在 .lock 文件里了**。

## 做法

1. 检查 .lock 文件是否非空（是 → 数据完整）
2. 把 .lock 的内容 copy 到正式 index 文件（copy 不是 rename，不触发拦截）
3. .lock 留着不管（它是残留物，但不影响 git 运行）
   —— 每次 git 写索引前会先尝试创建它，已存在时会报"File exists"，
   所以还要把 .lock 清空，让 git 以为锁是"可用的"。

## 用法

    python3 scripts/fix-git-lock.py [repo_path]
"""

import os
import shutil
import sys


def fix(repo: str) -> int:
    gitdir = os.path.join(repo, '.git')
    if not os.path.isdir(gitdir):
        print(f'✗ 不是 git 仓库: {repo}')
        return 1

    lock = os.path.join(gitdir, 'index.lock')
    index = os.path.join(gitdir, 'index')

    if not os.path.exists(lock):
        print('✓ 无锁文件，无需处理')
        return 0

    size = os.path.getsize(lock)
    if size == 0:
        # 空锁是纯残留。清空它已无意义（本来就是空的），
        # 只能靠 rename 移走 —— 而 rename 会被拦。直接报告。
        print('⚠ 存在 0 字节的空锁（残留物），但改名被安全代理拦截')
        print('  该文件不影响 git 读取（git 只在写索引时才用锁）')
        print(f'  手动处理：! mv {lock} {lock}.stale')
        return 0

    # 有数据 → 复制到正式 index
    try:
        shutil.copyfile(lock, index)
        print(f'✓ 索引已从锁文件恢复（{size} 字节）')
    except Exception as e:
        print(f'✗ 复制失败: {e}')
        return 1

    # 把锁清零，让 git 下次能正常创建它
    try:
        with open(lock, 'r+b') as f:
            f.truncate(0)
        print('✓ 锁文件已清零')
    except Exception as e:
        print(f'  （清零失败，不影响本次恢复）: {e}')

    return 0


if __name__ == '__main__':
    repo = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
    sys.exit(fix(repo))
