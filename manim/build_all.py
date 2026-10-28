#!/usr/bin/env python3
"""
批量渲染 Manim 场景 → public/media/

用法：
    python manim/build_all.py            # 渲染全部（medium 质量）
    python manim/build_all.py --fast     # low 质量，渲染快
    python manim/build_all.py --only info_theory
    python manim/build_all.py --list     # 只列清单

产出：
    public/media/<scene_id>.mp4     直接给网页引用
    public/media/<scene_id>.gif     （可选，--gif 时生成）

为什么输出到 public/media：
    Vite 会把 public/ 下的文件原样拷进 dist/，这样网页直接用
    /media/xxx.mp4 引用即可，无需改 vite 配置。
"""

import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PY = '/Users/vambear/.workbuddy/binaries/python/envs/manim/bin/python'

# ---- 场景清单 ----
# key 是网页里用的标识，value 是 (模块, 场景类名, 中文标题, 一句话说明)
SCENES = {
    'info-entropy-intuition': (
        'scenes.info_theory',
        'EntropyIntuition',
        '熵的直觉',
        '信息就是惊讶程度：结果越意外，贡献的熵越大',
    ),
    'info-entropy-two-ways': (
        'scenes.info_theory',
        'EntropyTwoWays',
        '熵的两种算法',
        '逐个结果算惊讶，与直接用公式，结果完全一致',
    ),
    'info-mutual-information': (
        'scenes.info_theory',
        'MutualInformation',
        '互信息',
        '知道了 A，能帮你少猜多少 B',
    ),
    'info-information-gain': (
        'scenes.info_theory',
        'InformationGain',
        '信息增益',
        '一次分裂到底减少了多少不确定性',
    ),
    'math-normal-3sigma': (
        'scenes.math_basics',
        'NormalThreeSigma',
        '3σ 法则',
        '68% / 95% / 99.7% 原来是这个面积',
    ),
    'math-central-limit': (
        'scenes.math_basics',
        'CentralLimitTheorem',
        '中心极限定理',
        '歪歪扭扭的数据加总后会变钟形',
    ),
    'math-vector-projection': (
        'scenes.math_basics',
        'VectorProjection',
        '向量与距离',
        'kNN 的"找邻居"到底在算什么',
    ),
    'math-covariance': (
        'scenes.math_basics',
        'CovarianceIntuition',
        '相关不等于因果',
        '冰淇淋和溺水都因气温而上升',
    ),
}


def human(n):
    for u in ['B', 'KB', 'MB']:
        if n < 1024:
            return f'{n:.0f}{u}'
        n /= 1024
    return f'{n:.1f}GB'


def render_one(key, quality, out_dir, make_gif=False):
    module, cls, title, _ = SCENES[key]
    t0 = time.time()
    cmd = [PY, os.path.join(HERE, 'render.py'), module, cls, '-q', quality]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
    if r.returncode != 0:
        print(f'  ✗ {key} 渲染失败')
        tail = [l for l in r.stderr.split('\n') if 'Error' in l or 'error' in l]
        for l in tail[-3:]:
            print(f'      {l.strip()[:110]}')
        return False

    # 从 media/videos 找到产出并拷到 public/media
    name = f'{cls}.mp4'
    src = os.path.join(HERE, 'media', 'videos', module.replace('.', os.sep), quality.split('_')[0] + 'p15', name)
    if not os.path.exists(src):
        # 质量目录名规则兜底：直接搜
        found = None
        for root, _dirs, files in os.walk(os.path.join(HERE, 'media', 'videos')):
            if name in files:
                found = os.path.join(root, name)
                break
        if not found:
            print(f'  ✗ {key} 未找到产出文件')
            return False
        src = found

    dst = os.path.join(out_dir, f'{key}.mp4')
    with open(src, 'rb') as f:
        data = f.read()
    with open(dst, 'wb') as f:
        f.write(data)

    size = human(len(data))
    dur = ''
    try:
        probe = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src],
            capture_output=True,
            text=True,
        )
        dur = f'{float(probe.stdout.strip()):.0f}s'
    except Exception:
        pass

    print(f'  ✓ {key:26s} {size:>7s}  {dur:>4s}  {time.time() - t0:5.1f}s  — {title}')

    if make_gif:
        gif_dst = os.path.join(out_dir, f'{key}.gif')
        subprocess.run(
            ['ffmpeg', '-y', '-v', 'error', '-i', src, '-vf', 'fps=12,scale=640:-1:flags=lanczos', gif_dst],
            capture_output=True,
        )
        if os.path.exists(gif_dst):
            print(f'      + gif {human(os.path.getsize(gif_dst))}')
    return True


def main():
    args = sys.argv[1:]
    if '--list' in args:
        for k, v in SCENES.items():
            print(f'{k:26s} {v[2]}  —  {v[3]}')
        return 0

    quality = 'low_quality' if '--fast' in args else 'medium_quality'
    make_gif = '--gif' in args
    only = None
    if '--only' in args:
        i = args.index('--only')
        only = args[i + 1] if i + 1 < len(args) else None

    out_dir = os.path.join(ROOT, 'public', 'media')
    os.makedirs(out_dir, exist_ok=True)

    targets = SCENES if not only else {k: v for k, v in SCENES.items() if only in k}
    if not targets:
        print(f'没有匹配的场景: {only}')
        return 1

    print(f'渲染 {len(targets)} 个场景（质量 {quality}）\n')
    ok = 0
    t0 = time.time()
    for key in targets:
        if render_one(key, quality, out_dir, make_gif):
            ok += 1

    print(f'\n完成 {ok}/{len(targets)}，总耗时 {time.time() - t0:.0f}s')
    print(f'输出目录 {out_dir}')
    total = sum(
        os.path.getsize(os.path.join(out_dir, f)) for f in os.listdir(out_dir) if f.endswith('.mp4')
    )
    print(f'总体积 {human(total)}')
    return 0 if ok == len(targets) else 1


if __name__ == '__main__':
    sys.exit(main())
