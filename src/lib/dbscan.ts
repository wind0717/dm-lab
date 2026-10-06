// ============================================================
// DBSCAN 密度聚类 —— 支持逐步动画的可中断实现
// 直觉：密度够（ε 圈内 ≥ minPts 个点）就连成一片，孤独的点是噪声
// 标签约定：-1 = 噪声（暂定，之后可能被吸收为边界点），≥0 = 簇编号
// ============================================================

import type { RawPt } from './datasets'

export interface DbscanState {
  points: RawPt[]
  eps: number
  minPts: number
  /** 是否已处理过（被访问） */
  visited: boolean[]
  /** 簇标签：-1 噪声（暂定），≥0 簇编号；未访问时点无意义 */
  labels: number[]
  /** 是否核心点 */
  isCore: boolean[]
  /** 处理顺序（固定为原始顺序，保证动画可复现） */
  order: number[]
  /** 下一个待访问点在 order 中的位置 */
  cursor: number
  /** 当前簇扩散队列 */
  queue: number[]
  /** 当前正在处理的点（高亮 + 画 ε 圈） */
  current: number | null
  /** 当前点的 ε 邻居（含自己） */
  currentNeighbors: number[]
  clusterCount: number
  done: boolean
  log: string
  stepCount: number
}

/** ε 邻域：所有距离 ≤ eps 的点下标（含自己） */
export function regionQuery(points: RawPt[], idx: number, eps: number): number[] {
  const out: number[] = []
  const p = points[idx]
  for (let j = 0; j < points.length; j++) {
    const dx = p.x - points[j].x
    const dy = p.y - points[j].y
    if (dx * dx + dy * dy <= eps * eps) out.push(j)
  }
  return out
}

/** 创建 DBSCAN 步进器（尚未处理任何点） */
export function createDbscan(points: RawPt[], eps: number, minPts: number): DbscanState {
  return {
    points,
    eps,
    minPts,
    visited: new Array(points.length).fill(false),
    labels: new Array(points.length).fill(-1),
    isCore: new Array(points.length).fill(false),
    order: points.map((_, i) => i),
    cursor: 0,
    queue: [],
    current: null,
    currentNeighbors: [],
    clusterCount: 0,
    done: points.length === 0,
    log: points.length === 0 ? '画布上还没有点' : '准备好了：点「下一步」开始逐个检查每个点',
    stepCount: 0,
  }
}

/**
 * 前进一步：
 * - 队列非空 → 处理一个扩散点（可能把暂定的噪声点吸收进来）
 * - 队列空 → 取下一个未访问点，判断是核心点还是暂定噪声
 */
export function dbscanStep(s: DbscanState): DbscanState {
  if (s.done) return s
  const visited = [...s.visited]
  const labels = [...s.labels]
  const isCore = [...s.isCore]
  const queue = [...s.queue]
  let { cursor, clusterCount } = s
  let current: number | null = null
  let currentNeighbors: number[] = []
  let log = ''

  if (queue.length > 0) {
    // ---- 扩散步：处理簇扩张队列中的一个点 ----
    const q = queue.shift()!
    current = q
    const wasNoise = visited[q] && labels[q] === -1
    if (!visited[q] || wasNoise) {
      visited[q] = true
      labels[q] = clusterCount - 1 // 当前簇编号 = clusterCount - 1
      const nb = regionQuery(s.points, q, s.eps)
      currentNeighbors = nb
      if (nb.length >= s.minPts) {
        // 核心点：把还没归属的邻居继续塞入队列
        isCore[q] = true
        let added = 0
        for (const j of nb) {
          if ((!visited[j] || labels[j] === -1) && !queue.includes(j)) {
            queue.push(j)
            added++
          }
        }
        log = wasNoise
          ? `点 #${q} 原本是暂定噪声，被簇 ${clusterCount} 吸收，而且它自己也是核心点（${nb.length} 个邻居），继续扩散 ${added} 个`
          : `点 #${q} 有 ${nb.length} 个邻居 ≥ minPts → 核心点，加入簇 ${clusterCount}，继续扩散 ${added} 个邻居`
      } else {
        log = wasNoise
          ? `点 #${q} 原本是暂定噪声，现在被簇 ${clusterCount} 吸收为边界点（只有 ${nb.length} 个邻居，不再扩散）`
          : `点 #${q} 只有 ${nb.length} 个邻居 < minPts → 边界点，属于簇 ${clusterCount}，不再扩散`
      }
    } else {
      log = `点 #${q} 已有归属，跳过`
    }
  } else {
    // ---- 取下一个未访问点 ----
    while (cursor < s.order.length && visited[s.order[cursor]]) cursor++
    if (cursor >= s.order.length) {
      return { ...s, visited, labels, isCore, queue, cursor, clusterCount, current: null, currentNeighbors: [], done: true, log: '全部点处理完毕', stepCount: s.stepCount + 1 }
    }
    const p = s.order[cursor]
    cursor++
    current = p
    const nb = regionQuery(s.points, p, s.eps)
    currentNeighbors = nb
    visited[p] = true
    if (nb.length >= s.minPts) {
      // 新簇诞生
      clusterCount++
      isCore[p] = true
      labels[p] = clusterCount - 1
      for (const j of nb) {
        if (j !== p && (!visited[j] || labels[j] === -1)) queue.push(j)
      }
      log = `点 #${p} 有 ${nb.length} 个邻居 ≥ minPts → 核心点！新簇 ${clusterCount} 诞生，${nb.length - 1} 个邻居入队等待扩散`
    } else {
      labels[p] = -1
      log = `点 #${p} 只有 ${nb.length} 个邻居 < minPts → 暂标为噪声（之后可能被附近的簇吸收为边界点）`
    }
  }

  return {
    ...s,
    visited,
    labels,
    isCore,
    queue,
    cursor,
    clusterCount,
    current,
    currentNeighbors,
    done: false,
    log,
    stepCount: s.stepCount + 1,
  }
}

/** 一口气跑完（自测 / 跳过动画用） */
export function dbscanRun(points: RawPt[], eps: number, minPts: number): { labels: number[]; isCore: boolean[]; clusterCount: number } {
  let s = createDbscan(points, eps, minPts)
  let guard = points.length * 4 + 100
  while (!s.done && guard-- > 0) s = dbscanStep(s)
  return { labels: s.labels, isCore: s.isCore, clusterCount: s.clusterCount }
}
