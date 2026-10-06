// ============================================================
// K-Means 聚类 —— 纯函数实现（分步执行：分配 / 更新拆开）
// ============================================================

import type { RawPt } from './datasets'

export interface Centroid {
  x: number
  y: number
}

/** 两点间欧氏距离的平方（比较远近时用平方即可，省一次开方） */
export function dist2(a: RawPt, b: Centroid): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/**
 * 分配步：把每个点分给最近的质心
 * 同时计算 SSE（簇内平方和）= Σ Σ ||x - μ_c||²
 */
export function assignPoints(points: RawPt[], centroids: Centroid[]): { assignment: number[]; sse: number } {
  const assignment = new Array<number>(points.length).fill(0)
  let sse = 0
  for (let i = 0; i < points.length; i++) {
    let best = 0
    let bestD = Infinity
    for (let c = 0; c < centroids.length; c++) {
      const d = dist2(points[i], centroids[c])
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    assignment[i] = best
    sse += bestD
  }
  return { assignment, sse }
}

/**
 * 更新步：把每个质心移动到其簇内所有点的均值位置
 * μ_c = (1/|C|) · Σ_{x∈C} x
 * 空簇的质心保持原地不动（教学上更直观）
 */
export function updateCentroids(points: RawPt[], assignment: number[], centroids: Centroid[]): Centroid[] {
  return centroids.map((c, ci) => {
    let sx = 0
    let sy = 0
    let n = 0
    for (let i = 0; i < points.length; i++) {
      if (assignment[i] === ci) {
        sx += points[i].x
        sy += points[i].y
        n++
      }
    }
    if (n === 0) return { ...c }
    return { x: sx / n, y: sy / n }
  })
}

/** 随机从数据点中挑 K 个作为初始质心（不重复） */
export function randomCentroids(points: RawPt[], k: number): Centroid[] {
  const idx = points.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx.slice(0, Math.min(k, idx.length)).map((i) => ({ x: points[i].x, y: points[i].y }))
}

/** 判断质心是否基本不再移动（收敛） */
export function maxShift(oldC: Centroid[], newC: Centroid[]): number {
  let m = 0
  for (let i = 0; i < oldC.length; i++) {
    m = Math.max(m, Math.sqrt(dist2(oldC[i], newC[i])))
  }
  return m
}

/** 聚类簇配色（最多 8 簇，超出取模循环） */
export const CLUSTER_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#eab308', '#14b8a6', '#f43f5e'] as const
