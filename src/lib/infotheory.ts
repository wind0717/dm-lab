// ============================================================
// 信息论扩展 —— 联合熵 / 条件熵 / 互信息 / KL 散度 / 交叉熵 / 增益率
// 纯函数库，公式用中文注释标出，方便教学与核对
// ============================================================

import { entropyOfCounts } from './entropy'

/** 联合熵 H(X,Y) = -ΣᵢΣⱼ p(xᵢ,yⱼ)·log₂ p(xᵢ,yⱼ)，输入列联表计数 */
export function jointEntropy(counts: number[][]): number {
  const flat = counts.flat()
  return entropyOfCounts(flat)
}

/** 列联表的边缘计数：rows[i] = 第 i 行合计，cols[j] = 第 j 列合计 */
export function marginalCounts(counts: number[][]): { rows: number[]; cols: number[] } {
  const rows = counts.map((r) => r.reduce((a, b) => a + b, 0))
  const cols: number[] = []
  for (let j = 0; j < (counts[0]?.length ?? 0); j++) {
    let s = 0
    for (const r of counts) s += r[j] ?? 0
    cols.push(s)
  }
  return { rows, cols }
}

/**
 * 条件熵 H(Y|X) = Σᵢ p(xᵢ)·H(Y|X=xᵢ)
 * 约定：列联表行 = X，列 = Y。"知道 X 之后，Y 还剩多少不确定性"
 */
export function conditionalEntropy(counts: number[][]): number {
  const total = counts.flat().reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let h = 0
  for (const row of counts) {
    const rowSum = row.reduce((a, b) => a + b, 0)
    if (rowSum === 0) continue
    h += (rowSum / total) * entropyOfCounts(row)
  }
  return h
}

/**
 * 互信息 I(X;Y) = H(Y) - H(Y|X)
 * 含义：知道 X 能帮你消除多少关于 Y 的不确定性；0 = 两者完全独立
 */
export function mutualInformation(counts: number[][]): number {
  const { cols } = marginalCounts(counts)
  return entropyOfCounts(cols) - conditionalEntropy(counts)
}

/**
 * KL 散度（相对熵）D_KL(P‖Q) = Σ pᵢ·log₂(pᵢ/qᵢ)
 * 衡量"用分布 Q 去近似真实分布 P"的代价；D_KL = 0 当且仅当 P = Q
 * 约定：pᵢ = 0 的项跳过；qᵢ = 0 而 pᵢ > 0 时返回 Infinity
 */
export function klDivergence(p: number[], q: number[]): number {
  let d = 0
  for (let i = 0; i < p.length; i++) {
    const pi = p[i]
    const qi = q[i]
    if (pi <= 0) continue
    if (qi <= 0) return Infinity
    d += pi * Math.log2(pi / qi)
  }
  return d
}

/** 交叉熵 H(P,Q) = -Σ pᵢ·log₂ qᵢ = H(P) + D_KL(P‖Q) */
export function crossEntropy(p: number[], q: number[]): number {
  let h = 0
  for (let i = 0; i < p.length; i++) {
    const pi = p[i]
    const qi = q[i]
    if (pi <= 0) continue
    if (qi <= 0) return Infinity
    h -= pi * Math.log2(qi)
  }
  return h
}

/**
 * 分裂信息 SplitInfo = -Σ (nᵢ/n)·log₂(nᵢ/n)
 * 衡量"分裂本身把数据拆得多碎"，与类别纯度无关
 */
export function splitInfo(groupSizes: number[]): number {
  return entropyOfCounts(groupSizes)
}

/**
 * 增益率 GainRatio = 信息增益 / 分裂信息
 * C4.5 用它惩罚"把数据拆成太多小份"的分裂（如按学号分裂）
 */
export function gainRatio(ig: number, si: number): number {
  if (si <= 0) return 0
  return ig / si
}
