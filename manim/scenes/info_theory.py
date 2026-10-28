"""
信息论 · Manim 场景集

每个场景聚焦一个教学点，控制��� 30~60 秒。
配色沿用平台的 indigo / amber / emerald 体系，与网页视觉统一。
"""

import numpy as np
from manim import *

# ---- 平台配色（与网页 Tailwind 一致）----
INDIGO = '#4f46e5'
AMBER = '#f59e0b'
EMERALD = '#059669'
ROSE = '#e11d48'
SKY = '#0284c7'
STONE = '#57534e'
INK = '#292524'
LIGHT = '#a8a29e'

CN = 'PingFang SC'

# ---- 主题：与平台浅色 UI 统一 ----
# Manim 默认黑底，放进网页里会像个嵌入的"外来物"。
# 改成米白底 + 深灰文字，和网页卡片风格连续。
BG = '#faf9f7'          # 与 Tailwind stone-50 接近
FG = '#292524'          # stone-800
TITLE_C = '#4338ca'     # indigo-700


def cn(text, size=28, color=WHITE, weight=NORMAL):
    """中文文本（用 Pango 渲染，不需要 LaTeX）"""
    return Text(text, font=CN, font_size=size, color=color, weight=weight)


# ================================================================
# 场景 1：熵的直觉 —— 信息就是"惊讶程度"
# ================================================================
class EntropyIntuition(Scene):
    """
    教学目标：让学生理解「熵 = 不确定性 = 惊讶程度」这个核心直觉。

    剧本：
      1. 抛一枚硬币：正面/反面各 50% —— 不确定性最高 → 熵最大
      2. 一枚几乎总是正面的硬币：结果可预测 → 熵小
      3. 引出公式：H(X) = -Σ p log₂p，并指出「log₂p 就是惊讶程度」
    """

    def construct(self):
        self.camera.background_color = BG
        # ---- 标题 ----
        title = cn('熵 = 不确定性 = 惊讶程度', 34, INDIGO, BOLD)
        title.to_edge(UP, buff=0.6)
        self.play(Write(title), run_time=1.2)

        # ---- 场景 A：公平硬币 ----
        fair_label = cn('公平硬币', 26, STONE)
        fair_label.move_to(LEFT * 3.2 + UP * 2.1)
        self.play(FadeIn(fair_label, shift=UP * 0.2))

        coin = Circle(radius=0.55, color=GOLD, fill_opacity=0.25, stroke_width=3)
        coin.move_to(LEFT * 3.2 + UP * 0.8)
        coin_txt = cn('公平', 22, STONE)
        coin_txt.move_to(coin)
        self.play(DrawBorderThenFill(coin), FadeIn(coin_txt))

        # 两条分支：正/反 各 50%
        head = cn('正面', 22, INDIGO).move_to(LEFT * 4.3 + DOWN * 0.7)
        tail = cn('反面', 22, ROSE).move_to(LEFT * 2.1 + DOWN * 0.7)
        p_head = cn('p = 0.5', 20, LIGHT).next_to(head, DOWN, buff=0.15)
        p_tail = cn('p = 0.5', 20, LIGHT).next_to(tail, DOWN, buff=0.15)

        self.play(
            GrowArrow(Arrow(coin.get_center(), head.get_center() + UP * 0.25, buff=0.1)),
            GrowArrow(Arrow(coin.get_center(), tail.get_center() + UP * 0.25, buff=0.1)),
            FadeIn(head, p_head),
            FadeIn(tail, p_tail),
            run_time=1.0,
        )

        ent_fair = cn('熵 = 1 bit\n（完全不可预测）', 22, INDIGO)
        ent_fair.move_to(LEFT * 3.2 + DOWN * 1.9)
        self.play(FadeIn(ent_fair, shift=UP * 0.2), run_time=0.8)

        # ---- 场景 B：有偏硬币 ----
        bias_label = cn('有偏硬币', 26, STONE)
        bias_label.move_to(RIGHT * 3.2 + UP * 2.1)
        self.play(FadeIn(bias_label, shift=UP * 0.2))

        coin2 = Circle(radius=0.55, color=GOLD, fill_opacity=0.25, stroke_width=3)
        coin2.move_to(RIGHT * 3.2 + UP * 0.8)
        coin2_txt = cn('偏', 22, STONE)
        coin2_txt.move_to(coin2)
        self.play(DrawBorderThenFill(coin2), FadeIn(coin2_txt))

        head2 = cn('正面', 22, INDIGO).move_to(RIGHT * 4.0 + DOWN * 0.7)
        tail2 = cn('反面', 22, ROSE).move_to(RIGHT * 2.4 + DOWN * 0.7)
        p_head2 = cn('p = 0.9', 20, LIGHT).next_to(head2, DOWN, buff=0.15)
        p_tail2 = cn('p = 0.1', 20, LIGHT).next_to(tail2, DOWN, buff=0.15)

        self.play(
            GrowArrow(Arrow(coin2.get_center(), head2.get_center() + UP * 0.25, buff=0.1)),
            GrowArrow(Arrow(coin2.get_center(), tail2.get_center() + UP * 0.25, buff=0.1)),
            FadeIn(head2, p_head2),
            FadeIn(tail2, p_tail2),
            run_time=1.0,
        )

        ent_bias = cn('熵 ≈ 0.47 bit\n（基本猜得到）', 22, EMERALD)
        ent_bias.move_to(RIGHT * 3.2 + DOWN * 1.9)
        self.play(FadeIn(ent_bias, shift=UP * 0.2), run_time=0.8)

        # ---- 对比箭头 ----
        cmp_arrow = Text('≫', font_size=44, color=AMBER)
        cmp_arrow.move_to(DOWN * 2.9)
        self.play(FadeIn(cmp_arrow, scale=1.4), run_time=0.5)

        # ---- 公式 ----
        formula = cn('H(X) = − Σ pᵢ log₂ pᵢ', 36, INK, BOLD)
        formula.move_to(DOWN * 3.5)
        self.play(Write(formula), run_time=1.2)

        note = cn('log₂ p 就是「看到结果时的惊讶程度」：\n越意外，贡献的熵越大', 22, LIGHT)
        note.next_to(formula, DOWN, buff=0.35)
        self.play(FadeIn(note), run_time=1.0)

        self.wait(2.5)


# ================================================================
# 场景 2：熵的两种算法 —— 直接算 vs 期望惊讶
# ================================================================
class EntropyTwoWays(Scene):
    """
    教学目标：把公式拆成两部分理解——
    「每个结果贡献多少惊讶」× 「这个结果多大概率出现」= 总惊讶（期望）。

    剧本：
      1. 逐个结果算：惊讶度 log₂(1/p) 与 概率 p
      2. 相乘求和 = 期望惊讶 = 熵
      3. 强调「熵是惊讶的平均值」
    """

    def construct(self):
        self.camera.background_color = BG
        title = cn('熵的两种算法：同一个意思', 32, INDIGO, BOLD).to_edge(UP, buff=0.6)
        self.play(Write(title), run_time=1.0)

        # ---- 左：分步计算 ----
        left_title = cn('算法一：逐个结果算', 24, AMBER)
        left_title.move_to(LEFT * 3.6 + UP * 2.4)
        self.play(FadeIn(left_title))

        # 用一个 4 输出的信源
        outcomes = [('结果 A', 0.4, INDIGO), ('结果 B', 0.3, SKY), ('结果 C', 0.2, EMERALD), ('结果 D', 0.1, ROSE)]

        rows = VGroup()
        for i, (name, p, color) in enumerate(outcomes):
            row = VGroup(
                cn(name, 20, color),
                cn(f'p = {p}', 20, LIGHT),
                cn(f'惊讶 = log₂(1/{p}) = {-np.log2(p):.2f} bit', 19, STONE),
                cn(f'贡献 = {p} × {-np.log2(p):.2f} = {p * -np.log2(p):.3f}', 19, INK),
            ).arrange(RIGHT, buff=0.32)
            row.move_to(LEFT * 3.6 + UP * 1.55 - i * 0.62)
            rows.add(row)

        for r in rows:
            self.play(FadeIn(r, shift=RIGHT * 0.15), run_time=0.55)

        # ---- 右：结论 ----
        right_title = cn('算法二：直接算', 24, EMERALD)
        right_title.move_to(RIGHT * 3.6 + UP * 2.4)
        self.play(FadeIn(right_title))

        h_val = -sum(p * np.log2(p) for _, p, _ in outcomes)
        eq = cn(f'H(X) = 0.4×1.32 + 0.3×1.74\n     + 0.2×2.32 + 0.1×3.32\n     = {h_val:.3f} bit', 22, INK)
        eq.move_to(RIGHT * 3.6 + UP * 0.9)
        self.play(Write(eq), run_time=1.4)

        box = SurroundingRectangle(eq, color=EMERALD, buff=0.22, corner_radius=0.12)
        self.play(Create(box), run_time=0.7)

        meaning = cn('熵 = 惊讶程度的加权平均', 24, EMERALD, BOLD)
        meaning.move_to(RIGHT * 3.6 + DOWN * 1.0)
        self.play(FadeIn(meaning, shift=UP * 0.2), run_time=0.9)

        # ---- 底部串联 ----
        bridge = cn('同一件事的两种算法：\n「每次有多惊讶」×「多大概率发生」，全部加起来', 21, LIGHT)
        bridge.to_edge(DOWN, buff=0.7)
        self.play(FadeIn(bridge), run_time=1.0)

        self.wait(3)


# ================================================================
# 场景 3：互信息 —— 两个变量的关联程度
# ================================================================
class MutualInformation(Scene):
    """
    教学目标：让互信息变得可视——
    「知道了 A，能减少多少关于 B 的不确定性」。

    剧本：
      1. 完全无关：互信息 = 0，知道 A 对 B 毫无帮助
      2. 强关联：知道了 A 就能确定 B，互信息 = H(B)
      3. 中间态：部分减少
    """

    def construct(self):
        self.camera.background_color = BG
        title = cn('互信息：知道了 A，能少猜多少 B？', 32, INDIGO, BOLD).to_edge(UP, buff=0.6)
        self.play(Write(title), run_time=1.1)

        # ---- 场景 1：完全无关 ----
        s1 = cn('① 毫无关联', 24, STONE).move_to(LEFT * 3.8 + UP * 2.3)
        self.play(FadeIn(s1))

        # 两条互不相干的曲线（装饰性散点）
        rng = np.random.default_rng(7)
        pts_a = VGroup(*[Dot(rng.uniform(-1.2, 1.2) * RIGHT + rng.uniform(-1.2, 1.2) * UP, radius=0.07,
                                 color=INDIGO).move_to(LEFT * 4.9 + UP * 0.9) for _ in range(14)])
        pts_b = VGroup(*[Dot(rng.uniform(-1.2, 1.2) * RIGHT + rng.uniform(-1.2, 1.2) * UP, radius=0.07,
                                 color=ROSE).move_to(LEFT * 2.7 + UP * 0.9) for _ in range(14)])
        self.play(FadeIn(pts_a, pts_b), run_time=1.0)

        r1 = cn('知道 A 完全帮不上忙\nI(A;B) = 0', 21, STONE)
        r1.move_to(LEFT * 3.8 + DOWN * 0.5)
        self.play(FadeIn(r1), run_time=0.8)

        # ---- 场景 2：强关联 ----
        s2 = cn('② 完全决定', 24, STONE).move_to(RIGHT * 3.8 + UP * 2.3)
        self.play(FadeIn(s2))

        # 一一对应：左边点亮了，右边对应点亮
        left_dots = VGroup()
        right_dots = VGroup()
        for i in range(7):
            y = 1.2 - i * 0.4
            ld = Dot(RIGHT * 2.7 + UP * (y - 0.9), radius=0.09, color=INDIGO)
            rd = Dot(RIGHT * 4.9 + UP * (y - 0.9), radius=0.09, color=EMERALD)
            left_dots.add(ld)
            right_dots.add(rd)

        self.play(FadeIn(left_dots), run_time=0.5)
        self.play(
            *[FadeIn(rd) for rd in right_dots],
            *[Create(Line(ld.get_center(), rd.get_center(), stroke_width=1.6, color=AMBER))
              for ld, rd in zip(left_dots, right_dots)],
            run_time=1.3,
        )

        r2 = cn('知道 A 就等于知道 B\nI(A;B) = H(B)', 21, EMERALD)
        r2.move_to(RIGHT * 3.8 + DOWN * 0.5)
        self.play(FadeIn(r2), run_time=0.8)

        # ---- 公式 ----
        formula = cn('I(A;B) = H(B) − H(B|A)', 34, INK, BOLD)
        formula.move_to(DOWN * 1.6)
        self.play(Write(formula), run_time=1.2)

        expl = cn('H(B)      ：完全不知道 B 时，有多少不确定性\nH(B|A) ：知道 A 之后，还剩多少不确定性\n相减      ：A 帮我们省下的部分', 21, LIGHT)
        expl.next_to(formula, DOWN, buff=0.4)
        self.play(FadeIn(expl), run_time=1.2)

        self.wait(3)


# ================================================================
# 场景 4：信息增益 —— 一次分裂能带来多少信息
# ================================================================
class InformationGain(Scene):
    """
    教学目标：把「信息增益」和决策树分裂连起来。

    剧本：
      1. 分裂前：一堆混杂的球
      2. 按某个特征分成两堆：各自更纯
      3. 算分裂前后的熵差 = 信息增益
    """

    def construct(self):
        self.camera.background_color = BG
        title = cn('信息增益：一次分裂值多少"信息"', 32, INDIGO, BOLD).to_edge(UP, buff=0.6)
        self.play(Write(title), run_time=1.0)

        rng = np.random.default_rng(3)
        # ---- 分裂前：红蓝混杂 ----
        before = VGroup()
        for i in range(10):
            pos = LEFT * 3.8 + UP * 1.2 + RIGHT * (i % 5) * 0.55 + DOWN * (i // 5) * 0.55
            color = ROSE if i % 2 == 0 else SKY
            before.add(Dot(pos, radius=0.13, color=color))

        lbl_before = cn('分裂前：红蓝混杂', 22, STONE).move_to(LEFT * 3.8 + UP * 2.5)
        self.play(FadeIn(lbl_before), FadeIn(before, lag_ratio=0.05), run_time=1.2)

        h_before = cn('H = 1.00 bit\n（完全不确定）', 21, ROSE)
        h_before.move_to(LEFT * 3.8 + DOWN * 1.6)
        self.play(FadeIn(h_before), run_time=0.8)

        # ---- 分裂箭头 ----
        arrow = Arrow(UP * 1.5, DOWN * 1.5, buff=0.2, color=AMBER, stroke_width=6)
        arrow.next_to(before, RIGHT, buff=0.4)
        self.play(GrowArrow(arrow), run_time=0.7)

        # ---- 分裂后：各自纯净 ----
        after = VGroup()
        for i in range(5):
            pos = RIGHT * 3.8 + UP * 1.2 + RIGHT * (i % 3) * 0.55 + DOWN * (i // 3) * 0.55
            after.add(Dot(pos, radius=0.13, color=ROSE))
        for i in range(5):
            pos = RIGHT * 3.8 + DOWN * 0.3 + RIGHT * (i % 3) * 0.55 + DOWN * (i // 3) * 0.55
            after.add(Dot(pos, radius=0.13, color=SKY))

        lbl_after = cn('分裂后：各成一堆', 22, STONE).move_to(RIGHT * 3.8 + UP * 2.5)
        self.play(FadeIn(lbl_after), FadeIn(after, lag_ratio=0.04), run_time=1.3)

        h_after = cn('H = 0.72 bit\n（好猜多了）', 21, EMERALD)
        h_after.move_to(RIGHT * 3.8 + DOWN * 1.6)
        self.play(FadeIn(h_after), run_time=0.8)

        # ---- 结论 ----
        gain = cn('信息增益 = H(父) − H(子) = 1.00 − 0.72 = 0.28 bit', 26, AMBER, BOLD)
        gain.to_edge(DOWN, buff=0.7)
        self.play(Write(gain), run_time=1.3)

        note = cn('增益越大 → 这个特征越值得作为分裂点', 21, LIGHT)
        note.next_to(gain, UP, buff=0.25)
        self.play(FadeIn(note), run_time=0.8)

        self.wait(3)
