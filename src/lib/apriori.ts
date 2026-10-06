// ============================================================
// Apriori 关联规则挖掘 —— 纯函数实现
// 交易 = 一组商品名（去重排序）；支持逐步动画：每层 候选 → 计数 → 剪枝
// 核心性质：频繁项集的所有子集必然频繁 ⇔ 非频繁项集的所有超集必然非频繁
// ============================================================

import { mulberry32 } from './preprocess'

export interface Transaction {
  id: number
  /** 去重 + 排序后的商品名 */
  items: string[]
}

/** 项集的唯一键（数组内已排序） */
export const itemsetKey = (items: string[]) => items.join('|')

/** 支持度计数 = 包含该项集的交易数 */
export function supportCount(transactions: Transaction[], itemset: string[]): number {
  let c = 0
  for (const t of transactions) {
    let ok = true
    for (const it of itemset) {
      if (!t.items.includes(it)) {
        ok = false
        break
      }
    }
    if (ok) c++
  }
  return c
}

// ------------------------------------------------------------
// Apriori 主算法：逐层产生候选 → 计数 → 剪枝
// ------------------------------------------------------------
export interface AprioriLevel {
  level: number // 1 项集 / 2 项集 / ...
  candidates: string[][]
  counts: number[]
  frequent: boolean[]
}

export interface AprioriResult {
  levels: AprioriLevel[]
  minCount: number
  nTrans: number
  /** 全部频繁项集（扁平列表） */
  frequentItemsets: { items: string[]; support: number }[]
}

/** 由上一层频繁项集两两连接生成候选（已排序数组的 join） */
function genCandidates(prevFreq: string[][]): string[][] {
  const out: string[][] = []
  const seen = new Set<string>()
  for (let i = 0; i < prevFreq.length; i++) {
    for (let j = i + 1; j < prevFreq.length; j++) {
      const a = prevFreq[i]
      const b = prevFreq[j]
      // 前 k-2 项相同才能连接（字典序已排序）
      let same = true
      for (let t = 0; t < a.length - 1; t++) {
        if (a[t] !== b[t]) {
          same = false
          break
        }
      }
      if (!same) continue
      const cand = [...a, b[b.length - 1]]
      // 剪枝：候选的所有 k-1 子集都必须在上一层频繁集里
      let allSubFreq = true
      for (let t = 0; t < cand.length; t++) {
        const sub = cand.filter((_, idx) => idx !== t)
        if (!prevFreq.some((f) => itemsetKey(f) === itemsetKey(sub))) {
          allSubFreq = false
          break
        }
      }
      if (allSubFreq && !seen.has(itemsetKey(cand))) {
        seen.add(itemsetKey(cand))
        out.push(cand)
      }
    }
  }
  return out
}

/**
 * Apriori 主流程
 * @param minSupport 支持度阈值（0~1 的比例）
 */
export function apriori(transactions: Transaction[], minSupport: number): AprioriResult {
  const nTrans = transactions.length
  const minCount = Math.max(1, Math.ceil(minSupport * nTrans - 1e-9))
  const levels: AprioriLevel[] = []
  const frequentItemsets: { items: string[]; support: number }[] = []

  // 第 1 层：所有单品
  const itemSet = new Set<string>()
  for (const t of transactions) for (const it of t.items) itemSet.add(it)
  let prevFreq: string[][] = []
  {
    const candidates = Array.from(itemSet).sort().map((it) => [it])
    const counts = candidates.map((c) => supportCount(transactions, c))
    const frequent = counts.map((c) => c >= minCount)
    levels.push({ level: 1, candidates, counts, frequent })
    prevFreq = candidates.filter((_, i) => frequent[i])
    for (let i = 0; i < candidates.length; i++) {
      if (frequent[i]) frequentItemsets.push({ items: candidates[i], support: counts[i] / nTrans })
    }
  }

  // 第 2 层起：连接 + 剪枝 + 计数
  let level = 2
  while (prevFreq.length >= 2) {
    const candidates = genCandidates(prevFreq)
    if (candidates.length === 0) break
    const counts = candidates.map((c) => supportCount(transactions, c))
    const frequent = counts.map((c) => c >= minCount)
    levels.push({ level, candidates, counts, frequent })
    prevFreq = candidates.filter((_, i) => frequent[i])
    for (let i = 0; i < candidates.length; i++) {
      if (frequent[i]) frequentItemsets.push({ items: candidates[i], support: counts[i] / nTrans })
    }
    level++
  }

  return { levels, minCount, nTrans, frequentItemsets }
}

// ------------------------------------------------------------
// 关联规则生成：对每个频繁项集（大小 ≥2）枚举所有非空真子集作为前件
// 置信度 conf(A→B) = support(A∪B) / support(A)
// 提升度 lift(A→B) = conf(A→B) / support(B)
// ------------------------------------------------------------
export interface Rule {
  antecedent: string[]
  consequent: string[]
  support: number
  confidence: number
  lift: number
  /** 来源项集键（用于 UI 高亮） */
  itemsetKey: string
}

export function genRules(result: AprioriResult, minConfidence: number): Rule[] {
  const supMap = new Map<string, number>()
  for (const f of result.frequentItemsets) supMap.set(itemsetKey(f.items), f.support)

  const rules: Rule[] = []
  for (const f of result.frequentItemsets) {
    if (f.items.length < 2) continue
    const items = f.items
    const m = items.length
    // 枚举所有非空真子集（位掩码）
    for (let mask = 1; mask < (1 << m) - 1; mask++) {
      const antecedent = items.filter((_, i) => mask & (1 << i))
      const consequent = items.filter((_, i) => !(mask & (1 << i)))
      const supA = supMap.get(itemsetKey(antecedent))
      const supB = supMap.get(itemsetKey(consequent))
      if (supA === undefined || supB === undefined || supA === 0) continue
      const confidence = f.support / supA
      const lift = confidence / supB
      if (confidence >= minConfidence - 1e-9) {
        rules.push({ antecedent, consequent, support: f.support, confidence, lift, itemsetKey: itemsetKey(items) })
      }
    }
  }
  return rules
}

// ------------------------------------------------------------
// 内置数据集：校园超市购物篮（约 200 笔，注入 3 条强关联模式）
// ------------------------------------------------------------
export const CAMPUS_ITEMS = ['牛奶', '面包', '啤酒', '尿布', '鸡蛋', '可乐', '薯片', '酸奶', '火腿肠', '卫生巾']

export function genCampusBasket(n = 200, seed = 42): Transaction[] {
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
  // 注入的隐藏模式（学生不知道的"真相"）
  const patterns: Array<{ items: string[]; p: number }> = [
    { items: ['尿布', '啤酒'], p: 0.28 }, // 经典"啤酒与尿布"
    { items: ['牛奶', '面包'], p: 0.35 }, // 早餐搭档
    { items: ['可乐', '薯片'], p: 0.22 }, // 追剧搭档
  ]

  const transactions: Transaction[] = []
  for (let i = 0; i < n; i++) {
    const set = new Set<string>()
    for (const pat of patterns) {
      if (rand() < pat.p) for (const it of pat.items) set.add(it)
    }
    for (const it of CAMPUS_ITEMS) {
      if (rand() < baseProb[it]) set.add(it)
    }
    while (set.size < 2) set.add(CAMPUS_ITEMS[Math.floor(rand() * CAMPUS_ITEMS.length)])
    transactions.push({ id: i, items: Array.from(set).sort() })
  }
  return transactions
}

// ------------------------------------------------------------
// 购物篮 CSV 解析：每行一笔交易，逗号/顿号/分号分隔商品名（无表头）
// ------------------------------------------------------------
// 交易数可以放宽（计数是线性的），但商品种类必须小：
// Apriori 要枚举 2^k 个商品子集，k 是指数复杂度，种类一多浏览器直接卡死
export const BASKET_CSV_LIMITS = { maxBytes: 5 * 1024 * 1024, maxTrans: 5000, maxItems: 12 }

export function parseBasketCsv(text: string): Transaction[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) throw new Error('CSV 为空：每行应是一笔交易，如「牛奶,面包,鸡蛋」')
  if (lines.length > BASKET_CSV_LIMITS.maxTrans) {
    throw new Error(`交易数超限：最多 ${BASKET_CSV_LIMITS.maxTrans} 笔，当前 ${lines.length} 笔`)
  }
  const transactions: Transaction[] = []
  const allItems = new Set<string>()
  lines.forEach((line, i) => {
    const items = Array.from(
      new Set(
        line
          .split(/[,，、;；]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      ),
    )
    if (items.length === 0) throw new Error(`第 ${i + 1} 行没有商品`)
    for (const it of items) allItems.add(it)
    transactions.push({ id: i, items: items.sort() })
  })
  if (allItems.size > BASKET_CSV_LIMITS.maxItems) {
    throw new Error(
      `商品种类过多：最多 ${BASKET_CSV_LIMITS.maxItems} 种，当前 ${allItems.size} 种。` +
        `Apriori 要枚举 2^k 个商品子集（指数复杂度），种类一多浏览器会卡死——` +
        `请合并低频商品或提供类别级数据（如把"可乐/雪碧/芬达"合并为"碳酸饮料"）`,
    )
  }
  return transactions
}

/** 示例 CSV 文本（内置购物篮前 25 笔） */
export function sampleBasketCsv(): string {
  return genCampusBasket(25, 7)
    .map((t) => t.items.join(','))
    .join('\n')
}

// ------------------------------------------------------------
// 项集格（Lattice）：给定商品集合的全部子集 + 支持度
// ------------------------------------------------------------
export interface LatticeNode {
  items: string[]
  key: string
  level: number
  support: number
  frequent: boolean
}

export function buildLattice(items: string[], transactions: Transaction[], minSupport: number): LatticeNode[] {
  const nodes: LatticeNode[] = []
  const m = items.length
  for (let mask = 0; mask < 1 << m; mask++) {
    const subset = items.filter((_, i) => mask & (1 << i))
    const sup = transactions.length === 0 ? 0 : supportCount(transactions, subset) / transactions.length
    nodes.push({
      items: subset,
      key: itemsetKey(subset),
      level: subset.length,
      support: sup,
      frequent: sup >= minSupport - 1e-9,
    })
  }
  return nodes
}

/** 一个项集的所有严格超集键（在 items 全集范围内） */
export function supersetKeys(node: LatticeNode, items: string[]): Set<string> {
  const out = new Set<string>()
  const inNode = new Set(node.items)
  const rest = items.filter((it) => !inNode.has(it))
  for (let mask = 1; mask < 1 << rest.length; mask++) {
    const extra = rest.filter((_, i) => mask & (1 << i))
    out.add(itemsetKey([...node.items, ...extra].sort()))
  }
  return out
}
