// ============================================================
// Manim 动画清单 —— 场景 id 与网页的对应关系
// ============================================================
//
// 视频文件由 manim/build_all.py 离线渲染，产物在 public/media/<id>.mp4。
// 这里只描述「哪个页面放哪几段动画」，不涉及渲染逻辑。
//
// 命名规则：<模块前缀>-<主题>，与 manim/build_all.py 的 SCENES 保持一致。
// ============================================================

import type { DemoClip } from '@/components/ManimDemo'

/** 信息论模块的动画 */
export const infoTheoryClips: DemoClip[] = [
  {
    id: 'info-entropy-intuition',
    desc: '熵的直觉：信息就是惊讶程度',
    duration: 16,
  },
  {
    id: 'info-entropy-two-ways',
    desc: '熵的两种算法：逐个算 vs 直接算',
    duration: 12,
  },
  {
    id: 'info-mutual-information',
    desc: '互信息：知道了 A 能少猜多少 B',
    duration: 13,
  },
  {
    id: 'info-information-gain',
    desc: '信息增益：一次分裂减少多少不确定性',
    duration: 11,
  },
]

/** 数学基础模块的动画 */
export const mathBasicsClips: DemoClip[] = [
  {
    id: 'math-normal-3sigma',
    desc: '3σ 法则：68% / 95% / 99.7% 的由来',
    duration: 13,
  },
  {
    id: 'math-central-limit',
    desc: '中心极限定理：加总之后为什么会变钟形',
    duration: 11,
  },
  {
    id: 'math-vector-projection',
    desc: '向量与距离：kNN 在算什么',
    duration: 13,
  },
  {
    id: 'math-covariance',
    desc: '相关不等于因果',
    duration: 11,
  },
]
