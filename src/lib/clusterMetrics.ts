// ============================================================
// 聚类评估指标 —— 纯函数库
// 内部指标（不需要真实标签）：轮廓系数 / Calinski-Harabasz / Davies-Bouldin
// 外部指标（需要真实标签）：调整兰德指数 ARI / 纯度 Purity
// 约定：标签 -1 表示噪声点（DBSCAN），内部指标计算时剔除噪声点
// ============================================================

import type { RawPt } from './datasets'
import { mulberry32 } from './preprocess'

function dist(a: RawPt, b: RawPt): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** 剔除噪声点（标签 -1）后的工作集 */
function labeledSubset(points: RawPt[], labels: number[]): { pts: RawPt[]; lab: number[]; keptIdx: number[] } {
  const keptIdx: number[] = []
  for (let i = 0; i < points.length; i++) if (labels[i] >= 0) keptIdx.push(i)
  return { pts: keptIdx.map((i) => points[i]), lab: keptIdx.map((i) => labels[i]), keptIdx }
}

export function clusterCount(labels: number[]): number {
  return new Set(labels.filter((l) => l >= 0)).size
}

// ------------------------------------------------------------
// 轮廓系数 Silhouette
// s(i) = (b(i) - a(i)) / max(a(i), b(i))
//   a(i) = 点 i 到同簇其他点的平均距离（抱团程度）
//   b(i) = 点 i 到最近的"隔壁簇"的平均距离（离家出走的代价）
// 样本量 > maxN 时随机抽 maxN 个样本估算
// ------------------------------------------------------------
export interface SilhouetteResult {
  /** 参与计算的样本下标（对应原 points 的下标） */
  idx: number[]
  /** 每个样本的 s(i)，与 idx 对齐 */
  values: number[]
  /** 每个样本所属簇标签，与 idx 对齐 */
  labels: number[]
  mean: number
  sampled: boolean
}

export function silhouetteSamples(points: RawPt[], labels: number[], maxN = 300, seed = 42): SilhouetteResult | null {
  const { pts, lab, keptIdx } = labeledSubset(points, labels)
  const n = pts.length
  if (n < 2 || new Set(lab).size < 2) return null

  // 抽样
  let order = Array.from({ length: n }, (_, i) => i)
  let sampled = false
  if (n > maxN) {
    const rand = mulberry32(seed)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    order = order.slice(0, maxN)
    sampled = true
  }
  const m = order.length
  const P = order.map((i) => pts[i])
  const L = order.map((i) => lab[i])
  const clusters = Array.from(new Set(L))

  // 预计算距离矩阵（m ≤ 300，90k 次运算）
  const D: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0))
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      const d = dist(P[i], P[j])
      D[i][j] = d
      D[j][i] = d
    }
  }

  const values = new Array<number>(m).fill(0)
  for (let i = 0; i < m; i++) {
    // 到各簇的距离之和与计数
    const sum = new Map<number, number>()
    const cnt = new Map<number, number>()
    for (const c of clusters) {
      sum.set(c, 0)
      cnt.set(c, 0)
    }
    for (let j = 0; j < m; j++) {
      if (j === i) continue
      sum.set(L[j], sum.get(L[j])! + D[i][j])
      cnt.set(L[j], cnt.get(L[j])! + 1)
    }
    const ownSize = cnt.get(L[i])!
    if (ownSize === 0) {
      values[i] = 0 // 独成一簇，约定 s=0
      continue
    }
    const a = sum.get(L[i])! / ownSize
    let b = Infinity
    for (const c of clusters) {
      if (c === L[i]) continue
      const mean = sum.get(c)! / cnt.get(c)!
      if (mean < b) b = mean
    }
    values[i] = b === Infinity ? 0 : (b - a) / Math.max(a, b)
  }

  const mean = values.reduce((s, v) => s + v, 0) / m
  return { idx: order.map((i) => keptIdx[i]), values, labels: L, mean, sampled }
}

// ------------------------------------------------------------
// Calinski-Harabasz 指数（方差比准则）
// CH = [BGSS / (k-1)] / [WGSS / (n-k)] —— 越大越好，没有上限
// ------------------------------------------------------------
export function calinskiHarabasz(points: RawPt[], labels: number[]): number | null {
  const { pts, lab } = labeledSubset(points, labels)
  const n = pts.length
  const clusters = Array.from(new Set(lab))
  const k = clusters.length
  if (n <= k || k < 2) return null

  const gx = pts.reduce((s, p) => s + p.x, 0) / n
  const gy = pts.reduce((s, p) => s + p.y, 0) / n

  let wgss = 0
  let bgss = 0
  for (const c of clusters) {
    const members = pts.filter((_, i) => lab[i] === c)
    const cx = members.reduce((s, p) => s + p.x, 0) / members.length
    const cy = members.reduce((s, p) => s + p.y, 0) / members.length
    for (const p of members) wgss += (p.x - cx) ** 2 + (p.y - cy) ** 2
    bgss += members.length * ((cx - gx) ** 2 + (cy - gy) ** 2)
  }
  if (wgss === 0) return Infinity
  return (bgss / (k - 1)) / (wgss / (n - k))
}

// ------------------------------------------------------------
// Davies-Bouldin 指数
// DB = (1/k) Σ_i max_j≠i [ (S_i + S_j) / d(c_i, c_j) ] —— 越小越好，0 是完美
//   S_i = 簇 i 内点到质心的平均距离（簇的"胖瘦"）
// ------------------------------------------------------------
export function daviesBouldin(points: RawPt[], labels: number[]): number | null {
  const { pts, lab } = labeledSubset(points, labels)
  const clusters = Array.from(new Set(lab))
  const k = clusters.length
  if (k < 2) return null

  const centroids: RawPt[] = []
  const scatter: number[] = []
  for (const c of clusters) {
    const members = pts.filter((_, i) => lab[i] === c)
    const cx = members.reduce((s, p) => s + p.x, 0) / members.length
    const cy = members.reduce((s, p) => s + p.y, 0) / members.length
    centroids.push({ x: cx, y: cy })
    scatter.push(members.reduce((s, p) => s + dist(p, { x: cx, y: cy }), 0) / members.length)
  }

  let total = 0
  for (let i = 0; i < k; i++) {
    let worst = -Infinity
    for (let j = 0; j < k; j++) {
      if (i === j) continue
      const d = dist(centroids[i], centroids[j])
      const r = d === 0 ? Infinity : (scatter[i] + scatter[j]) / d
      if (r > worst) worst = r
    }
    total += worst
  }
  return total / k
}

// ------------------------------------------------------------
// 调整兰德指数 ARI（需要真实标签，-1 ≤ ARI ≤ 1，随机 ≈ 0）
// 基于列联表的组合计数公式
// ------------------------------------------------------------
export function adjustedRandIndex(trueLabels: number[], predLabels: number[]): number | null {
  const n = Math.min(trueLabels.length, predLabels.length)
  if (n < 2) return null
  const comb2 = (x: number) => (x * (x - 1)) / 2

  const tSet = Array.from(new Set(trueLabels.slice(0, n)))
  const pSet = Array.from(new Set(predLabels.slice(0, n)))
  const table = new Map<string, number>()
  const rowSum = new Map<number, number>()
  const colSum = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const key = `${trueLabels[i]}|${predLabels[i]}`
    table.set(key, (table.get(key) ?? 0) + 1)
    rowSum.set(trueLabels[i], (rowSum.get(trueLabels[i]) ?? 0) + 1)
    colSum.set(predLabels[i], (colSum.get(predLabels[i]) ?? 0) + 1)
  }

  let sumComb = 0
  for (const v of table.values()) sumComb += comb2(v)
  let sumRow = 0
  for (const t of tSet) sumRow += comb2(rowSum.get(t) ?? 0)
  let sumCol = 0
  for (const p of pSet) sumCol += comb2(colSum.get(p) ?? 0)

  const total = comb2(n)
  const expected = (sumRow * sumCol) / total
  const maxIdx = (sumRow + sumCol) / 2
  const denom = maxIdx - expected
  if (denom === 0) return 0
  return (sumComb - expected) / denom
}

// ------------------------------------------------------------
// 纯度 Purity：每个预测簇里最多的真实类别占比之和 ÷ n（0~1，越大越好）
// ------------------------------------------------------------
export function purity(trueLabels: number[], predLabels: number[]): number | null {
  const n = Math.min(trueLabels.length, predLabels.length)
  if (n === 0) return null
  const byCluster = new Map<number, Map<number, number>>()
  for (let i = 0; i < n; i++) {
    if (!byCluster.has(predLabels[i])) byCluster.set(predLabels[i], new Map())
    const m = byCluster.get(predLabels[i])!
    m.set(trueLabels[i], (m.get(trueLabels[i]) ?? 0) + 1)
  }
  let correct = 0
  for (const m of byCluster.values()) {
    correct += Math.max(...m.values())
  }
  return correct / n
}
