// ============================================================
// 层次聚类（凝聚式 Agglomerative）—— 自底向上两两合并
// 支持三种簇间距离（linkage）：
//   single   最短距离：两簇最近点对
//   complete 最长距离：两簇最远点对
//   average  平均距离：两簇所有点对的平均
// 记录完整合并历史 → 可回放动画 + 画树状图 + 任意高度"切一刀"
// ============================================================

import type { RawPt } from './datasets'

export type Linkage = 'single' | 'complete' | 'average'

export const LINKAGE_NAMES: Record<Linkage, string> = {
  single: '最短距离',
  complete: '最长距离',
  average: '平均距离',
}

export interface HcMerge {
  /** 被合并的两个节点（叶子 0..n-1，内部节点 n+i） */
  a: number
  b: number
  /** 新节点编号 = n + 合并序号 */
  id: number
  distance: number
  size: number
}

export interface HcResult {
  n: number
  merges: HcMerge[]
  /** 每个节点的成员样本下标（叶子是单元素数组），长度 2n-1 */
  membersOf: number[][]
  maxDist: number
}

/** 完整的凝聚式聚类：返回 n-1 次合并的记录 */
export function agglomerative(points: RawPt[], linkage: Linkage): HcResult {
  const n = points.length
  if (n === 0) return { n, merges: [], membersOf: [], maxDist: 0 }

  // 点对距离矩阵
  const D: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i].x - points[j].x
      const dy = points[i].y - points[j].y
      D[i][j] = D[j][i] = Math.sqrt(dx * dx + dy * dy)
    }
  }

  // 活跃簇集合：node id → { members, distTo: Map<nodeId, dist> }
  const membersOf: number[][] = points.map((_, i) => [i])
  const active = new Set<number>(Array.from({ length: n }, (_, i) => i))
  // 簇间距离缓存
  const distTo = new Map<number, Map<number, number>>()
  const setD = (a: number, b: number, d: number) => {
    if (!distTo.has(a)) distTo.set(a, new Map())
    distTo.get(a)!.set(b, d)
    if (!distTo.has(b)) distTo.set(b, new Map())
    distTo.get(b)!.set(a, d)
  }
  const getD = (a: number, b: number): number => distTo.get(a)?.get(b) ?? Infinity
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) setD(i, j, D[i][j])

  const merges: HcMerge[] = []
  let maxDist = 0

  while (active.size > 1) {
    // 找距离最近的一对活跃簇
    let ba = -1
    let bb = -1
    let bd = Infinity
    const ids = Array.from(active)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const d = getD(ids[i], ids[j])
        if (d < bd) {
          bd = d
          ba = ids[i]
          bb = ids[j]
        }
      }
    }
    const id = n + merges.length
    const members = [...membersOf[ba], ...membersOf[bb]]
    membersOf.push(members)
    merges.push({ a: ba, b: bb, id, distance: bd, size: members.length })
    maxDist = Math.max(maxDist, bd)
    active.delete(ba)
    active.delete(bb)
    active.add(id)
    // 新簇与其余活跃簇的距离（Lance-Williams 递推，避免重算点对）
    for (const x of active) {
      if (x === id) continue
      const da = getD(ba, x)
      const db = getD(bb, x)
      let d: number
      if (linkage === 'single') d = Math.min(da, db)
      else if (linkage === 'complete') d = Math.max(da, db)
      else d = (da * membersOf[ba].length + db * membersOf[bb].length) / members.length
      setD(id, x, d)
    }
  }

  return { n, merges, membersOf, maxDist }
}

/**
 * 应用前 s 次合并，返回每个样本的簇标签（0..k-1，按簇内最小编号排序保证稳定）
 * 同时返回每个簇的大小（用于动画时区分"已经成团"与"还是孤点"）
 */
export function labelsAfterMerges(result: HcResult, s: number): { labels: number[]; sizes: number[] } {
  const n = result.n
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  for (let i = 0; i < Math.min(s, result.merges.length); i++) {
    const m = result.merges[i]
    parent[find(result.membersOf[m.a][0])] = find(result.membersOf[m.b][0])
  }
  // 根 → 连续标签（按簇内最小样本下标排序）
  const rootMin = new Map<number, number>()
  const rootCount = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    rootCount.set(r, (rootCount.get(r) ?? 0) + 1)
    const cur = rootMin.get(r)
    if (cur === undefined || i < cur) rootMin.set(r, i)
  }
  const roots = Array.from(rootMin.entries()).sort((a, b) => a[1] - b[1])
  const rootLabel = new Map(roots.map(([r], i) => [r, i]))
  const sizes = roots.map(([r]) => rootCount.get(r)!)
  const labels = Array.from({ length: n }, (_, i) => rootLabel.get(find(i))!)
  return { labels, sizes }
}

/** 在高度 h 处"切一刀"：合并距离 ≤ h 的合并全部执行，其余停手 */
export function cutTree(result: HcResult, height: number): { labels: number[]; sizes: number[]; k: number } {
  let s = 0
  while (s < result.merges.length && result.merges[s].distance <= height) s++
  const { labels, sizes } = labelsAfterMerges(result, s)
  return { labels, sizes, k: sizes.length }
}

/** 切成恰好 k 簇（取前 n-k 次合并） */
export function cutTreeK(result: HcResult, k: number): { labels: number[]; sizes: number[] } {
  const s = Math.max(0, result.n - Math.max(1, k))
  return labelsAfterMerges(result, s)
}

// ------------------------------------------------------------
// 树状图布局：对最终大树做 DFS 指定叶子顺序（保证同簇叶子相邻、不交叉）
// x = 叶子序号（内部节点取子节点均值），y = 合并距离（叶子为 0）
// ------------------------------------------------------------
export interface DendroLayout {
  /** 每个节点（0..2n-2）的坐标，未合并到 s 步的内部节点也可定位 */
  xs: number[]
  ys: number[]
}

export function dendrogramLayout(result: HcResult): DendroLayout {
  const n = result.n
  const xs = new Array<number>(2 * n - 1).fill(0)
  const ys = new Array<number>(2 * n - 1).fill(0)
  if (n === 0) return { xs, ys }

  // 内部节点的孩子
  const children = new Map<number, [number, number]>()
  for (const m of result.merges) children.set(m.id, [m.a, m.b])

  // DFS 赋叶子 x：优先小成员子树在左（视觉更稳定）
  let nextLeaf = 0
  const assignX = (node: number): number => {
    if (node < n) {
      xs[node] = nextLeaf++
      return xs[node]
    }
    const [a, b] = children.get(node)!
    // 让"先成型（合并距离小）"的子树在左
    const ya = a < n ? 0 : result.merges[a - n].distance
    const yb = b < n ? 0 : result.merges[b - n].distance
    const [left, right] = ya <= yb ? [a, b] : [b, a]
    const xa = assignX(left)
    const xb = assignX(right)
    xs[node] = (xa + xb) / 2
    ys[node] = result.merges[node - n].distance
    return xs[node]
  }
  if (n >= 2) assignX(2 * n - 2)
  else xs[0] = 0
  return { xs, ys }
}
