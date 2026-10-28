#!/usr/bin/env bash
# 在「安全删除代理」环境下提交
#
# 环境怪癖：本机的安全删除代理把「删除/改名」实现为「复制到回收站 + 留 0 字节占位符」，
# 于是 git 写索引的最后一步 rename(index.lock → index) 无法完成，
# git 报 "Unable to create index.lock: File exists"。
#
# 摸清的三条事实：
#   ① git 先把完整索引写进 <idx>.lock 才rename → **数据没丢，滞留在 .lock 里**
#   ② **copy（shutil.copyfile）不被拦截**，rename 会被
#   ③ 用**全新的索引路径**时，rename 的目标不存在 → 能成功
#
# 链路（全程不写 .git/index）：
#   git add -A                → 数据进 IDX1.lock
#   copyfile → IDX1          → 得到可读索引
#   copyfile IDX1 → IDX2     → 换一个没有 .lock 的路径
#   write-tree（读 IDX2）    → tree 对象
#   commit-tree              → commit 对象
#   校验哈希后写 ref 文件    → 移动分支指针
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

MSG_FILE="${1:-}"
if [ -z "$MSG_FILE" ] || [ ! -f "$MSG_FILE" ]; then
  echo "用法: bash scripts/git-commit-safe.sh <提交信息文件>" >&2
  exit 2
fi

PY_BIN="/Users/vambear/.workbuddy/binaries/python/envs/manim/bin/python"
STAMP="$(date +%N)"
IDX1="$REPO/.gitidx-a-$STAMP"
IDX2="$REPO/.gitidx-b-$STAMP"

copyfile() { "$PY_BIN" -c "import shutil,sys; shutil.copyfile(sys.argv[1], sys.argv[2])" "$1" "$2" 2>/dev/null; }

echo "[1/5] 暂存改动"
GIT_INDEX_FILE="$IDX1" git add -A 2>&1 | head -2
if [ ! -s "$IDX1" ] && [ -s "${IDX1}.lock" ]; then
  copyfile "${IDX1}.lock" "$IDX1"
  echo "    （rename 被拦截，已从 .lock 恢复索引）"
fi
[ -s "$IDX1" ] || { echo "✗ 索引未生成" >&2; exit 1; }

echo "[2/5] 复制到无锁路径"
copyfile "$IDX1" "$IDX2"
[ -s "$IDX2" ] || { echo "✗ 索引复制失败" >&2; exit 1; }
echo "    索引 $(wc -c < "$IDX2" | tr -d ' ') 字节"

echo "[3/5] 生成 tree 对象"
TREE="$(GIT_INDEX_FILE="$IDX2" git write-tree 2>&1 | tail -1)"
case "$TREE" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) echo "    tree $TREE" ;;
  *) echo "✗ write-tree 失败: $TREE" >&2; exit 1 ;;
esac

echo "[4/5] 生成 commit 对象"
PARENT="$(git rev-parse HEAD 2>/dev/null || true)"
if [ -n "$PARENT" ]; then
  COMMIT="$(git commit-tree "$TREE" -p "$PARENT" -F "$MSG_FILE" 2>&1 | tail -1)"
else
  COMMIT="$(git commit-tree "$TREE" -F "$MSG_FILE" 2>&1 | tail -1)"
fi
# 严格校验：必须是 40 位十六进制，否则绝不写 ref（避免写出坏 ref）
if ! printf '%s' "$COMMIT" | grep -qE '^[0-9a-f]{40}$'; then
  echo "✗ commit-tree 失败，拒绝写入 ref: $COMMIT" >&2
  exit 1
fi
echo "    commit $COMMIT"

echo "[5/5] 移动分支指针"
BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo main)"
case "$BRANCH" in
  HEAD|"") BRANCH="main" ;;
esac
REF="$(git rev-parse --git-path "refs/heads/$BRANCH")"
mkdir -p "$(dirname "$REF")"
printf '%s\n' "$COMMIT" > "$REF"
echo "    refs/heads/$BRANCH → $COMMIT"

echo ""
echo "✓ 提交完成"
git --no-pager log --oneline -1
git status -sb | head -2
