"""渲染探针：验证环境补丁 + 中文文本渲染是否正常。"""
from manim import *


class Probe(Scene):
    def construct(self):
        title = Text("熵 Entropy  H(X)", font="PingFang SC").scale(0.7)
        self.add(title)
        self.wait(0.3)
