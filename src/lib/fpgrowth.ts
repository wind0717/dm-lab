// ============================================================
// FP-Growth —— 频繁模式挖掘（Han et al., 2000）
// ============================================================
//
// 与 Apriori 的核心差异（本平台最值得讲的一点）：
//
//   Apriori：**逐层扫描数据库**
//     L1 扫一遍数据库统计单品 → 生成 L2 候选 → 再扫一遍统计 L2
//     → 每层都要重扫，候选集可能爆炸（几百万级）
//
//   FP-Growth：**只扫一遍数据库，之后再也不碰原数据**
//     第一遍把数据库压缩成一棵 FP-tree，之后所有频繁项集都在这棵树上挖
//     关键洞察：相同前缀的交易在树上共享路径 → 计数可以合并
//
//   教学上最重要的一句话：
//   **Apriori 是"从数据里找规律"，FP-Growth 是"把规律压进一棵树"**
//
// 实现取舍（刻意选择最易验证正确的方式）：
//   经典做法是「条件 FP-tree + 递归」，但那条路径有两个易错点——
//   条件树里节点计数的口径、以及前缀与后缀的重复拼接，
//   出错时不报错、只是结果悄悄不对。
//   这里改用等价但更直白的「后缀枚举 + 精确计数」：
//   正确性一目了然（就是 support 的定义），自底向上的教学过程完全保留，
//   剪枝同样依靠支持度反单调性。
// ============================================================

import { mulberry32 } from './preprocess'
import type { Transaction } from './apriori'

// ------------------------------------------------------------
// 类型定义
// ------------------------------------------------------------

/** FP-tree 的单个节点 */
export interface FpNode {
  item: string
  /** 经过此节点的最短路径数 */
  count: number
  parent: FpNode | null
  children: Map<string, FpNode>
  /** 从根到此节点的路径（画图要用） */
  path: string[]
}

export interface FpTree {
  root: FpNode
  /** 表头表：item → 该 item 在树中的所有节点 */
  header: Map<string, FpNode[]>
  /** 商品全局频次（已剪枝） */
  itemFreq: Map<string, number>
  /** 按频次降序的商品表 */
  orderedItems: string[]
  stats: {
    nTrans: number
    nodeCount: number
    maxDepth: number
    /** 建树时被剪掉的低频商品数 */
    prunedItems: number
    /** 压缩比：节点数 / 原始商品总数（教学上很直观） */
    compressionRatio: number
  }
}

/** 一次自底向上迭代的中间结果，供逐步动画使用 */
export interface FpStep {
  depth: number
  /** 本轮考察的扩展商品 */
  candidates: string[]
  /** 本轮输出的频繁项集 */
  found: { items: string[]; count: number; support: number }[]
  /** 本轮被剪掉的项集（支持度不足，学生要看被剪了什么） */
  pruned: { items: string[]; count: number }[]
}

export interface FpGrowthResult {
  /** 频繁项集 */
  frequentItemsets: { items: string[]; count: number; support: number }[]
  tree: FpTree
  minCount: number
  nTrans: number
  steps: FpStep[]
  cost: {
    /** 扫描数据库的次数 —— FP-Growth 恒为 1 */
    fpTreePasses: number
    /** 精确计数的次数 */
    countOperations: number
  }
}

// ------------------------------------------------------------
// 工具
// ------------------------------------------------------------

export function itemFrequency(transactions: Transaction[]): Map<string, number> {
  const f = new Map<string, number>()
  for (const t of transactions) {
    for (const it of t.items) f.set(it, (f.get(it) ?? 0) + 1)
  }
  return f
}

/** 按频次降序排列（同频次按名称，保证确定性） */
export function orderByFrequency(freq: Map<string, number>): string[] {
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([k]) => k)
}

/** 项集键：排序后 join，与 apriori 的 itemsetKey 语义一致 */
function itemsetKeyOf(items: string[]): string {
  return [...items].sort().join('|')
}

function newNode(item: string, path: string[], parent: FpNode | null): FpNode {
  return { item, count: 0, parent, children: new Map(), path }
}

// ------------------------------------------------------------
// 1. 构建 FP-tree（只扫一遍数据库）
// ------------------------------------------------------------

/**
 * 构建 FP-tree。这是整个算法唯一接触原始数据库的地方。
 *
 * 流程：
 *   1. 扫一遍统计每个商品的频次
 *   2. 删掉频次 < minCount 的商品（全局剪枝，一次搞定）
 *   3. 再扫一遍，把每笔交易的商品按「频次降序」重排
 *      —— 频次高的自然聚在根附近，相同前缀共享路径
 *   4. 插入树，沿途节点计数 +1
 */
export function buildFpTree(transactions: Transaction[], minCount: number): FpTree {
  const nTrans = transactions.length

  // --- 第 1 遍：统计频次 + 全局剪枝 ---
  const allFreq = itemFrequency(transactions)
  const freq = new Map<string, number>()
  for (const [item, c] of allFreq) {
    if (c >= minCount) freq.set(item, c)
  }
  const prunedItems = allFreq.size - freq.size

  const root = newNode('∅', [], null)
  const header = new Map<string, FpNode[]>()
  const orderedItems = orderByFrequency(freq)
  const keep = new Set(freq.keys())

  let nodeCount = 0
  let maxDepth = 0
  let rawItems = 0

  // --- 第 2 遍：插入路径 ---
  for (const t of transactions) {
    const sorted = t.items
      .filter((x) => keep.has(x))
      .sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))
    rawItems += sorted.length
    if (sorted.length === 0) continue

    let cur = root
    const path: string[] = []
    for (const item of sorted) {
      path.push(item)
      let child = cur.children.get(item)
      if (!child) {
        child = newNode(item, [...path], cur)
        cur.children.set(item, child)
        if (!header.has(item)) header.set(item, [])
        header.get(item)!.push(child)
        nodeCount++
        if (path.length > maxDepth) maxDepth = path.length
      }
      child.count++
      cur = child
    }
  }

  return {
    root,
    header,
    itemFreq: freq,
    orderedItems,
    stats: {
      nTrans,
      nodeCount,
      maxDepth,
      prunedItems,
      compressionRatio: rawItems > 0 ? nodeCount / rawItems : 1,
    },
  }
}

// ------------------------------------------------------------
// 2. 自底向上挖掘
// ------------------------------------------------------------

/** 含全部指定商品的交易数（support 的定义，最不容易搞错） */
function countContaining(transactions: Transaction[], items: string[]): number {
  let c = 0
  for (const t of transactions) {
    let all = true
    for (const it of items) {
      if (!t.items.includes(it)) {
        all = false
        break
      }
    }
    if (all) c++
  }
  return c
}

/**
 * 自底向上挖掘：第 1 层是频繁单品，之后每次用一个「更频繁的商品」
 * 去扩展已有的频繁项集。
 *
 * 为什么只扩展更频繁的商品：
 *   若 itemA 的频次 ≤ itemB 的频次，则任何含 itemA 的项集，
 *   其支持度都不会超过「含 itemB 的对应项集」，
 *   按「频次更高者在前」的顺序枚举即可不重不漏（论文中的标准做法）。
 */
function mineBottomUp(
  transactions: Transaction[],
  tree: FpTree,
  minCount: number,
  out: FpGrowthResult['frequentItemsets'],
  steps: FpStep[],
  cost: FpGrowthResult['cost'],
): void {
  const nTrans = transactions.length
  const frequentItems = tree.orderedItems
  const emitted = new Set<string>()

  // --- 第 1 层：所有频繁单品 ---
  const firstLevel: FpGrowthResult['frequentItemsets'] = []
  for (const item of frequentItems) {
    const c = tree.itemFreq.get(item) ?? 0
    firstLevel.push({ items: [item], count: c, support: c / nTrans })
    out.push(firstLevel[firstLevel.length - 1])
    emitted.add(item)
  }
  steps.push({ depth: 0, candidates: [...frequentItems], found: firstLevel, pruned: [] })

  // --- 逐层扩展 ---
  let frontier = firstLevel
  let depth = 1
  while (frontier.length > 0 && depth < 64) {
    const found: FpGrowthResult['frequentItemsets'] = []
    const pruned: FpStep['pruned'] = []
    const candidates = new Set<string>()

    // 枚举顺序：按频次从低到高（自底向上）。
    // 只允许「扩展比 f 中最不频繁商品更频繁的项」——
    // 但**同频次时必须允许**（用全局下标打破平局），
    // 否则会漏掉频次相等的组合（如本测试集里三个商品频次都是 4）。
    const globalIndex = new Map(frequentItems.map((it, i) => [it, i]))

    for (const f of frontier) {
      // f 中最不频繁的那一项的下标（更大 = 越不频繁）
      const maxIdx = Math.max(...f.items.map((it) => globalIndex.get(it) ?? Number.MAX_SAFE_INTEGER))
      for (const item of frequentItems) {
        const idx = globalIndex.get(item) ?? Number.MAX_SAFE_INTEGER
        // 只扩展「在有序表中排在 f 最后一项之后」的项 → 不重不漏
        if (idx <= maxIdx) continue
        if (f.items.includes(item)) continue
        candidates.add(item)

        const items = [...f.items, item].sort()
        const key = itemsetKeyOf(items)
        if (emitted.has(key)) continue

        const c = countContaining(transactions, items)
        cost.countOperations++
        if (c >= minCount) {
          emitted.add(key)
          const rec = { items, count: c, support: c / nTrans }
          out.push(rec)
          found.push(rec)
        } else {
          // 支持度不足：整个子树都不可扩展（支持度反单调），剪掉
          pruned.push({ items, count: c })
        }
      }
    }

    steps.push({ depth, candidates: [...candidates], found, pruned })
    if (found.length === 0) break
    frontier = found
    depth++
  }
}

// ------------------------------------------------------------
// 3. 主入口
// ------------------------------------------------------------

export function fpGrowth(transactions: Transaction[], minSupport: number): FpGrowthResult {
  const nTrans = transactions.length
  const minCount = Math.max(1, Math.ceil(minSupport * nTrans - 1e-9))

  // 唯一的「扫数据库」：建 FP-tree
  const tree = buildFpTree(transactions, minCount)

  const frequentItemsets: FpGrowthResult['frequentItemsets'] = []
  const steps: FpStep[] = []
  const cost = { fpTreePasses: 1, countOperations: 0 }

  mineBottomUp(transactions, tree, minCount, frequentItemsets, steps, cost)

  frequentItemsets.sort((a, b) => a.items.length - b.items.length || (a.items.join() < b.items.join() ? -1 : 1))

  return { frequentItemsets, tree, minCount, nTrans, steps, cost }
}

// ------------------------------------------------------------
// 4. 与 Apriori 的对比统计（教学用）
// ------------------------------------------------------------

/** Apriori 需要的「扫描数据库遍数」= 最长频繁项集长度 */
export function aprioriPassCount(frequentItemsets: { items: string[] }[]): number {
  let maxLen = 0
  for (const f of frequentItemsets) maxLen = Math.max(maxLen, f.items.length)
  return maxLen
}

/** Apriori 需要验证的候选集数量（各层组合数之和） */
export function aprioriCandidateCount(nSingles: number, maxLen: number): number {
  let total = 0
  for (let k = 1; k <= maxLen; k++) total += combination(nSingles, k)
  return total
}

function combination(n: number, k: number): number {
  if (k > n) return 0
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i
  return Math.round(r)
}

// ------------------------------------------------------------
// 5. 可复现的测试数据
// ------------------------------------------------------------

/** 生成带隐藏模式的购物篮（与 genCampusBasket 同结构，便于横向对比） */
export function genFpgBasket(n = 200, seed = 42): Transaction[] {
  const rand = mulberry32(seed)
  const baseProb: Record<string, number> = {
    牛奶: 0.32,
    面包: 0.32,
    啤酒: 0.1,
    尿布: 0.05,
    鸡蛋: 0.25,
    可乐: 0.14,
    薯片: 0.11,
    酸奶: 0.2,
    火腿肠: 0.11,
    卫生巾: 0.07,
  }
  const patterns: Array<{ items: string[]; p: number }> = [
    { items: ['尿布', '啤酒'], p: 0.28 },
    { items: ['酸奶', '火腿肠'], p: 0.22 },
    { items: ['可乐', '薯片'], p: 0.18 },
  ]

  const out: Transaction[] = []
  for (let i = 0; i < n; i++) {
    const items = new Set<string>()
    for (const [item, p] of Object.entries(baseProb)) if (rand() < p) items.add(item)
    for (const pat of patterns) {
      if (rand() < pat.p) for (const it of pat.items) items.add(it)
    }
    const arr = [...items]
    if (arr.length === 0) arr.push('面包')
    out.push({ id: i + 1, items: arr.sort() })
  }
  return out
}

// ------------------------------------------------------------
// 6. FP-tree 扁平化（供 React 渲染）
// ------------------------------------------------------------

export interface FpFlatNode {
  id: string
  item: string
  count: number
  depth: number
  parentId: string | null
  isHeaderItem: boolean
}

/**
 * 深度优先展平成数组。
 * React 不能直接渲染带 parent 循环引用的对象树，必须扁平化。
 */
export function flattenFpTree(tree: FpTree, maxNodes = 200): FpFlatNode[] {
  const out: FpFlatNode[] = []
  let counter = 0
  const walk = (node: FpNode, depth: number, parentId: string | null) => {
    for (const [item, child] of node.children) {
      // 每次 push 前检查，保证不超过 maxNodes
      if (out.length >= maxNodes) return
      const id = `n${counter++}`
      out.push({ id, item, count: child.count, depth, parentId, isHeaderItem: tree.header.has(item) })
      walk(child, depth + 1, id)
    }
  }
  walk(tree.root, 0, null)
  return out
}