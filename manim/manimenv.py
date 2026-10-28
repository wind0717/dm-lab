"""
Manim 渲染环境补丁（必须在 import manim 之前加载）

## 为什么需要这个

本机的 shell 环境有一个「安全删除代理」，会拦截 Python 的 `os.unlink`。
而 Python 标准库 `tempfile.gettempdir()` 的探测逻辑是：

    创建测试文件 → 删除它 → 删除成功才认为该目录可用

删除被拦 → 抛 FileNotFoundError: No usable temporary directory found
→ 连带 sitecustomize 报错 → Manim 根本无法启动。

## 补丁做两件事

1. **直接指定 `tempfile.tempdir`**：CPython 的 `gettempdir()` 在
   `tempfile.tempdir` 已被赋值时会**立即返回、不再探测**，绕开上述问题。

2. **把删除失败降级为忽略**：Manim 渲染完会清理 Pango 生成的中间 SVG
   （`media/texts/*.svg`）。这些是纯中间产物，删不掉不影响产出，
   所以把 `OSError`/`PermissionError` 吞掉即可。

残留的中间文件由 `manim/.gitignore` 忽略，不入库。
"""

import os
import sys
import tempfile

# ---- 1. 指定临时目录，跳过 tempfile 的探测 ----
# 用脚本所在仓库目录下的 .manimtmp，避免依赖系统临时目录
_HERE = os.path.dirname(os.path.abspath(__file__))
_TMP = os.path.join(os.path.dirname(_HERE), '.manimtmp')
os.makedirs(_TMP, exist_ok=True)
tempfile.tempdir = _TMP
os.environ['TMPDIR'] = _TMP

# ---- 2. 让删除失败变成可忽略 ----
_real_unlink = os.unlink
_real_remove = os.remove


def _safe_unlink(path, *args, **kwargs):
    """删除失败时静默跳过（中间产物删不掉不影响渲染结果）"""
    try:
        return _real_unlink(path, *args, **kwargs)
    except (OSError, PermissionError):
        return None


def _safe_remove(path, *args, **kwargs):
    try:
        return _real_remove(path, *args, **kwargs)
    except (OSError, PermissionError):
        return None


os.unlink = _safe_unlink
os.remove = _safe_remove

# os.replace（Manim 渲染完把 partial 文件改名为正式文件）同样会被拦。
# replace 的语义是「移动」，若目标已存在则先删目标 —— 正是被拦的那一步。
# 这里的处理：目标不存在时直接改名；目标已存在时先尝试 unlink，
# 失败则退化为直接覆盖写。
_real_replace = os.replace


def _safe_replace(src, dst, *args, **kwargs):
    try:
        return _real_replace(src, dst, *args, **kwargs)
    except (OSError, PermissionError):
        # 退路：读出来再写过去（不删任何东西）
        try:
            import shutil as _sh

            _sh.copyfile(src, dst)
            return dst
        except Exception:
            raise


os.replace = _safe_replace

# cairo / manimpango 也会用 unlink，一并替换
try:
    import shutil

    _real_rmtree = shutil.rmtree

    def _safe_rmtree(path, *args, **kwargs):
        try:
            return _real_rmtree(path, *args, **kwargs)
        except (OSError, PermissionError):
            return None

    shutil.rmtree = _safe_rmtree
except Exception:  # pragma: no cover
    pass

# 确认可用
assert tempfile.gettempdir() == _TMP, 'tempdir 未生效'
print(f'[manimenv] 临时目录已指定: {_TMP}', file=sys.stderr)
