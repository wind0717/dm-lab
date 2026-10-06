// ============================================================
// 熵 / 信息增益 / 基尼系数 —— 纯函数库
// 所有公式用中文注释标出，方便教学与核对
// ============================================================

/**
 * 二元熵（单位：bit）
 * H(p) = -p·log2(p) - (1-p)·log2(1-p)
 * p=0 或 p=1 时约定 H=0（袋子完全纯，没有不确定性）
 */
export function binaryEntropy(p: number): number {
  if (p <= 0 || p >= 1) return 0
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p))
}

/**
 * 二元基尼系数
 * Gini(p) = 1 - p² - (1-p)² = 2p(1-p)
 * 含义：从袋子里随机摸两个球，两次结果不一致的概率
 */
export function giniBinary(p: number): number {
  return 1 - p * p - (1 - p) * (1 - p)
}

/** 多分类熵：输入各类别计数，H = -Σ pᵢ·log2(pᵢ) */
export function entropyOfCounts(counts: number[]): number {
  const n = counts.reduce((a, b) => a + b, 0)
  if (n === 0) return 0
  let h = 0
  for (const c of counts) {
    if (c > 0) {
      const p = c / n
      h -= p * Math.log2(p)
    }
  }
  return h
}

/** 多分类基尼系数：Gini = 1 - Σ pᵢ² */
export function giniOfCounts(counts: number[]): number {
  const n = counts.reduce((a, b) => a + b, 0)
  if (n === 0) return 0
  let s = 0
  for (const c of counts) {
    const p = c / n
    s += p * p
  }
  return 1 - s
}

/**
 * 一次二分裂的加权平均不纯度
 * weighted = (nL/n)·I(左) + (nR/n)·I(右)
 */
export function weightedImpurity(
  leftCounts: number[],
  rightCounts: number[],
  impurityFn: (counts: number[]) => number,
): number {
  const nL = leftCounts.reduce((a, b) => a + b, 0)
  const nR = rightCounts.reduce((a, b) => a + b, 0)
  const n = nL + nR
  if (n === 0) return 0
  return (nL / n) * impurityFn(leftCounts) + (nR / n) * impurityFn(rightCounts)
}

/**
 * 信息增益 = 父节点不纯度 - 分裂后加权平均不纯度
 * 增益越大，说明这一刀"切得越干净"
 */
export function informationGain(
  parentCounts: number[],
  leftCounts: number[],
  rightCounts: number[],
  impurityFn: (counts: number[]) => number,
): number {
  return impurityFn(parentCounts) - weightedImpurity(leftCounts, rightCounts, impurityFn)
}
