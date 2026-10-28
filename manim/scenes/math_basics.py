"""
数学基础 · Manim 场景集

与 info_theory.py 保持同一套主题与配色，视觉上与网页连续。
每个场景聚焦一个教学点，控制�� 30~60 秒。
"""

import numpy as np
from manim import *

from scenes.info_theory import BG, INK, INDIGO, AMBER, EMERALD, ROSE, SKY, STONE, LIGHT, cn

__all__ = [
    'BG',
    'INK',
    'NormalThreeSigma',
    'CentralLimitTheorem',
    'VectorProjection',
    'CovarianceIntuition',
]


# ================================================================
# 场景 1：正态分布与 3σ 法则
# ================================================================
class NormalThreeSigma(Scene):
    """
    教学目标：把「68% / 95% / 99.7%」这三个数字变成看得见的面积。

    剧本：
      1. 画出钟形曲线，标出 μ 和 ±σ
      2. 逐段填充 ±1σ / ±2σ / ±3σ 的面积并显示百分比
      3. 结论：落在 ±3σ 之外几乎不可能（千分之三）
    """

    def construct(self):
        self.camera.background_color = BG

        title = cn('3σ 法则：为什么"离群值"很少见', 32, INDIGO, BOLD).to_edge(UP, buff=0.6)
        self.play(Write(title), run_time=1.0)

        # ---- 坐标系 ----
        ax = Axes(
            x_range=[-4.2, 4.2, 1],
            y_range=[0, 0.45, 0.1],
            x_length=10,
            y_length=4.2,
            axis_config={
                'include_ticks': False,
                'stroke_width': 2,
                'color': STONE,
            },
        )
        ax.move_to(DOWN * 0.55)
        self.play(Create(ax), run_time=1.0)

        # ---- 钟形曲线 ----
        def gauss(x):
            return 0.4 * np.exp(-(x**2) / 2)

        curve = ax.plot(gauss, x_range=[-4, 4, 0.02], color=INDIGO, stroke_width=4)
        self.play(Create(curve), run_time=1.6)

        # ---- 均值 ----
        mu_line = Line(ax.c2p(0, 0), ax.c2p(0, 0.4), color=STONE, stroke_width=2)
        mu_dot = Dot(ax.c2p(0, 0), color=STONE, radius=0.07)
        mu_lbl = cn('μ', 24, STONE).next_to(mu_dot, UP, buff=0.15)
        self.play(Create(mu_line), FadeIn(mu_dot, mu_lbl), run_time=0.8)

        # ---- 逐段填充 ±1σ / ±2σ / ±3σ ----
        bands = [
            (0, 1, '68%', EMERALD, 'μ ± 1σ'),
            (1, 2, '95%', AMBER, 'μ ± 2σ'),
            (2, 3, '99.7%', ROSE, 'μ ± 3σ'),
        ]

        for lo, hi, pct, color, lbl in bands:
            # 填充区间
            area = ax.get_area(
                curve,
                x_range=[lo, hi],
                color=color,
                fill_opacity=0.22,
                stroke_width=0,
            )
            area2 = ax.get_area(
                curve,
                x_range=[-hi, -lo],
                color=color,
                fill_opacity=0.22,
                stroke_width=0,
            )
            # σ 线
            lines = VGroup(
                Line(ax.c2p(lo, 0), ax.c2p(lo, 0.4), color=color, stroke_width=1.8),
                Line(ax.c2p(-lo, 0), ax.c2p(-lo, 0.4), color=color, stroke_width=1.8),
            )
            self.play(FadeIn(area), FadeIn(area2), Create(lines), run_time=0.7)

            # 百分比标签
            pct_txt = cn(pct, 26, color, BOLD)
            pct_txt.move_to(ax.c2p(hi - 0.5, 0.33))
            self.play(FadeIn(pct_txt, scale=1.3), run_time=0.4)

            # σ 标注
            sig_lbl = cn(f'{lo}σ' if lo > 0 else f'−{lo}σ', 18, color)
            sig_lbl.next_to(ax.c2p(lo, 0), DOWN, buff=0.18)
            sig_lbl2 = cn(f'−{lo}σ' if lo > 0 else f'{lo}σ', 18, color)
            sig_lbl2.next_to(ax.c2p(-lo, 0), DOWN, buff=0.18)
            self.play(FadeIn(sig_lbl), FadeIn(sig_lbl2), run_time=0.4)

        # ---- 结论 ----
        concl = cn('落在 μ ± 3σ 之外 ≈ 0.3%\n（约每 333 个里有 1 个）', 24, INK, BOLD)
        concl.to_edge(DOWN, buff=0.55)
        self.play(Write(concl), run_time=1.2)

        self.wait(3)


# ================================================================
# 场景 2：中心极限定理
# ================================================================
class CentralLimitTheorem(Scene):
    """
    教学目标：说明「一堆乱七八糟的东西加起来，会变得像正态分布」。

    剧本：
      1. 左边：原始数据（偏斜的）—— 画直方图
      2. 右边：100 个偏态变量的和 —— 变成钟形
      3. 结论：不需要原件正态，和就够了
    """

    def construct(self):
        self.camera.background_color = BG

        title = cn('中心极限定理：乱的东西加起来会变正常', 31, INDIGO, BOLD).to_edge(UP, buff=0.55)
        self.play(Write(title), run_time=1.0)

        # ---- 左侧：偏斜的原始分布 ----
        rng = np.random.default_rng(11)
        skew = rng.exponential(scale=1.0, size=140)

        left_ax = Axes(
            x_range=[0, 4, 1],
            y_range=[0, 0.55, 0.1],
            x_length=4.4,
            y_length=3.0,
            axis_config={'include_ticks': False, 'color': STONE, 'stroke_width': 2},
        )
        left_ax.move_to(LEFT * 3.7 + DOWN * 0.55)
        lbl_left = cn('① 原始数据（偏斜）', 23, STONE).move_to(LEFT * 3.7 + UP * 1.85)
        self.play(FadeIn(lbl_left), Create(left_ax), run_time=0.8)

        # 画直方图柱
        hist_left = VGroup()
        for i in range(9):
            h = 0.45 * np.exp(-i * 0.55) * (1 + 0.15 * np.sin(i * 2))
            bar = Rectangle(
                width=0.42,
                height=h,
                stroke_width=0,
                fill_color=ROSE,
                fill_opacity=0.55,
            )
            bar.move_to(left_ax.c2p(i * 0.42 + 0.25, h / 2))
            hist_left.add(bar)
        self.play(LaggedStart(*[FadeIn(b, shift=UP * 0.2) for b in hist_left], lag_ratio=0.06), run_time=1.4)

        # ---- 中间箭头 ----
        arrow = Arrow(LEFT * 1.1 + DOWN * 0.5, RIGHT * 1.1 + DOWN * 0.5, buff=0.15, color=AMBER, stroke_width=7)
        arrow_label = cn('加总 100 次', 20, AMBER).next_to(arrow, UP, buff=0.2)
        self.play(GrowArrow(arrow), FadeIn(arrow_label), run_time=0.9)

        # ---- 右侧：和的分布（钟形） ----
        right_ax = Axes(
            x_range=[0, 4, 1],
            y_range=[0, 0.55, 0.1],
            x_length=4.4,
            y_length=3.0,
            axis_config={'include_ticks': False, 'color': STONE, 'stroke_width': 2},
        )
        right_ax.move_to(RIGHT * 3.7 + DOWN * 0.55)
        lbl_right = cn('② 100 个的和（钟形）', 23, STONE).move_to(RIGHT * 3.7 + UP * 1.85)
        self.play(FadeIn(lbl_right), Create(right_ax), run_time=0.8)

        hist_right = VGroup()
        for i in range(9):
            # 钟形：中间高两边低
            h = 0.5 * np.exp(-((i - 3.2) ** 2) / 6.5)
            bar = Rectangle(
                width=0.42,
                height=h,
                stroke_width=0,
                fill_color=EMERALD,
                fill_opacity=0.55,
            )
            bar.move_to(right_ax.c2p(i * 0.42 + 0.25, h / 2))
            hist_right.add(bar)
        self.play(LaggedStart(*[FadeIn(b, shift=UP * 0.2) for b in hist_right], lag_ratio=0.06), run_time=1.4)

        # ---- 结论 ----
        concl = cn('哪怕每个变量都歪歪扭扭，加总之后也趋近正态分布', 24, INK, BOLD)
        concl.to_edge(DOWN, buff=0.55)
        self.play(Write(concl), run_time=1.2)

        note = cn('这正是"用正态分布做很多统计推断"能成立的原因', 19, LIGHT)
        note.next_to(concl, UP, buff=0.2)
        self.play(FadeIn(note), run_time=0.8)

        self.wait(3)


# ================================================================
# 场景 3：向量与投影
# ================================================================
class VectorProjection(Scene):
    """
    教学目标：把「投影」讲清楚——为什么 kNN 要按距离找邻居。

    剧本：
      1. 画两个向量：查询点 q 与数据点 p
      2. 画 q 到 p 的连线，标出距离
      3. 说明：距离 = 两个向量差的模长
    """

    def construct(self):
        self.camera.background_color = BG

        title = cn('向量与距离：kNN 的"找邻居"到底在算什么', 29, INDIGO, BOLD).to_edge(UP, buff=0.55)
        self.play(Write(title), run_time=1.0)

        # ---- 坐标系 ----
        ax = Axes(
            x_range=[-0.6, 4.2, 1],
            y_range=[-0.6, 4.2, 1],
            x_length=6.2,
            y_length=5.4,
            axis_config={'include_ticks': False, 'color': STONE, 'stroke_width': 2},
        )
        ax.move_to(LEFT * 2.4 + DOWN * 0.5)
        self.play(Create(ax), run_time=0.9)

        # ---- 查询点 q ----
        q_pos = np.array([1.0, 1.2, 0])
        p_pos = np.array([3.0, 2.8, 0])
        r_pos = np.array([2.6, 0.6, 0])

        q = Dot(ax.c2p(*q_pos[:2]), color=ROSE, radius=0.11)
        q_lbl = cn('查询点 q', 21, ROSE).next_to(q, LEFT, buff=0.25)
        self.play(FadeIn(q, q_lbl), run_time=0.7)

        # ---- 数据点 ----
        p = Dot(ax.c2p(*p_pos[:2]), color=INDIGO, radius=0.11)
        p_lbl = cn('样本 p', 21, INDIGO).next_to(p, RIGHT, buff=0.25)
        r = Dot(ax.c2p(*r_pos[:2]), color=EMERALD, radius=0.11)
        r_lbl = cn('样本 r', 21, EMERALD).next_to(r, RIGHT, buff=0.25)
        self.play(FadeIn(p, p_lbl), FadeIn(r, r_lbl), run_time=0.7)

        # ---- 连线与距离 ----
        line_p = Line(q.get_center(), p.get_center(), color=STONE, stroke_width=3)
        d_p = cn('d(q, p)', 20, STONE).next_to(line_p, UP, buff=0.18)
        self.play(Create(line_p), FadeIn(d_p), run_time=0.9)

        line_r = Line(q.get_center(), r.get_center(), color=STONE, stroke_width=3, stroke_opacity=0.55)
        d_r = cn('d(q, r)', 20, STONE).next_to(line_r, UP, buff=0.18)
        self.play(Create(line_r), FadeIn(d_r), run_time=0.7)

        # ---- 强调更近的那个 ----
        self.play(line_p.animate.set_color(INDIGO).set_stroke(width=5), run_time=0.5)
        self.play(d_p.animate.set_color(INDIGO).set_font_size(23), run_time=0.4)
        near = cn('← 更近，kNN 会选它当邻居', 21, INDIGO, BOLD)
        near.next_to(d_p, RIGHT, buff=0.5)
        self.play(FadeIn(near, shift=LEFT * 0.2), run_time=0.7)

        # ---- 右侧公式 ----
        eq = cn('d(q, p) = ‖q − p‖\n       = √((q₁−p₁)² + (q₂−p₂)² + …)', 24, INK)
        eq.move_to(RIGHT * 3.9 + UP * 0.9)
        self.play(Write(eq), run_time=1.3)

        tip = cn('两个向量之差的模长，\n就是它们的欧氏距离', 20, STONE)
        tip.next_to(eq, DOWN, buff=0.35)
        self.play(FadeIn(tip), run_time=0.9)

        warn = cn('⚠ 所以 kNN 必须先标准化 ——\n量纲大的特征会"霸凌"距离', 19, ROSE)
        warn.next_to(tip, DOWN, buff=0.4)
        self.play(FadeIn(warn), run_time=1.0)

        self.wait(3)


# ================================================================
# 场景 4：协方差与相关性
# ================================================================
class CovarianceIntuition(Scene):
    """
    教学目标：区分「相关」与「因果」，并说明协方差矩阵的直观含义。

    剧本：
      1. 三组散点：正相关、负相关、无相关
      2. 各自算相关系数
      3. 指出相关 ≠ 因果（举混淆变量的例子）
    """

    def construct(self):
        self.camera.background_color = BG

        title = cn('相关不等于因果', 34, ROSE, BOLD).to_edge(UP, buff=0.6)
        self.play(Write(title), run_time=1.0)

        rng = np.random.default_rng(5)
        cases = [
            ('正相关', 0.9, INDIGO, '冰淇淋销量 ↔ 溺水人数'),
            ('负相关', -0.9, SKY, '气温 ↔ 羽绒服销量'),
            ('无相关', 0.0, STONE, '身高 ↔ 数学成绩'),
        ]

        for i, (name, r, color, story) in enumerate(cases):
            x = rng.uniform(-1, 1, 60)
            y = r * x + rng.normal(0, 0.45, 60)

            cx = LEFT * 4.2 + i * 4.2
            ax = Axes(
                x_range=[-1.8, 1.8, 1],
                y_range=[-1.8, 1.8, 1],
                x_length=2.5,
                y_length=2.2,
                axis_config={'include_ticks': False, 'color': LIGHT, 'stroke_width': 1.6},
            )
            ax.move_to(cx + DOWN * 0.7)
            self.play(Create(ax), run_time=0.4)

            dots = VGroup(*[Dot(ax.c2p(xi, yi), radius=0.045, color=color) for xi, yi in zip(x, y)])
            self.play(LaggedStart(*[FadeIn(d) for d in dots], lag_ratio=0.004), run_time=0.9)

            name_txt = cn(name, 23, color, BOLD).next_to(ax, UP, buff=0.2)
            r_txt = cn(f'r = {r:+.1f}', 19, STONE).next_to(ax, DOWN, buff=0.2)
            self.play(FadeIn(name_txt), FadeIn(r_txt), run_time=0.4)

        # ---- 关键结论 ----
        box = RoundedRectangle(
            width=9.6,
            height=1.25,
            corner_radius=0.14,
            stroke_color=ROSE,
            stroke_width=2.5,
            fill_color=ROSE,
            fill_opacity=0.06,
        )
        box.to_edge(DOWN, buff=0.65)
        self.play(Create(box), run_time=0.8)

        txt = cn('冰淇淋销量和溺水人数都随「气温」上升 ——\n真正的原因是气温，不是彼此', 21, INK)
        txt.move_to(box)
        self.play(FadeIn(txt), run_time=1.1)

        self.wait(3)
