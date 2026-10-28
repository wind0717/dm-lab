"""
Manim 渲染入口（统一入口，避免每次都拼环境变量）

用法：
    python manim/render.py <scene_module> <SceneClass> [-q low|med|high] [--gif]

例：
    python manim/render.py scenes.math_basics NormalDistribution -q med
    python manim/render.py scenes.info_theory EntropyIntuition --gif

输出：
    manim/media/videos/<module>/<Scene>_<quality>.mp4
    manim/media/videos/<module>/<Scene>_<quality>.gif   （--gif 时）
"""

import os
import sys

# ---- 先加载环境补丁（必须在 import manim 之前）----
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import manimenv  # noqa: F401,E402

from manim import config, logger  # noqa: E402


def main() -> int:
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 2

    module_name = args[0]
    scene_name = args[1]

    quality = 'medium_quality'
    make_gif = False
    transparent = False
    i = 2
    while i < len(args):
        a = args[i]
        if a == '-q' and i + 1 < len(args):
            # 支持 low / med / high / low_quality 等简写
            raw = args[i + 1].lower()
            quality = raw if raw.endswith('_quality') else f'{raw}_quality'
            i += 2
        elif a == '--gif':
            make_gif = True
            i += 1
        elif a == '--transparent':
            transparent = True
            i += 1
        else:
            i += 1

    config.media_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'media')
    config.quality = quality
    config.disable_caching = False
    if transparent:
        config.transparent = True

    logger.setLevel('ERROR')  # 减少噪音，只留错误

    # 动态导入场景模块
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    mod = __import__(module_name, fromlist=[scene_name])
    scene_cls = getattr(mod, scene_name)

    from manim import Scene, tempconfig

    with tempconfig({'quality': quality, 'media_dir': config.media_dir}):
        scene = scene_cls()
        scene.render()

    # 找出产出文件
    out_dir = os.path.join(config.media_dir, 'videos', module_name.replace('.', os.sep))
    files = sorted(os.listdir(out_dir)) if os.path.isdir(out_dir) else []
    mp4 = [f for f in files if f.endswith('.mp4')]

    print(f'\n[render] 场景 {module_name}.{scene_name} 渲染完成')
    for f in mp4:
        full = os.path.join(out_dir, f)
        size_kb = os.path.getsize(full) / 1024
        print(f'[render]   {f}  ({size_kb:.0f} KB)')

    if make_gif and mp4:
        from manim import config as cfg

        try:
            scene.write_to_movie()
        except Exception:
            pass

    return 0


if __name__ == '__main__':
    sys.exit(main())
