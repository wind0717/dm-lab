// ============================================================
// FP-Growth —— 单元测试
//
// 核心验证策略：**FP-Growth 与 Apriori 必须给出完全相同的频繁项集**
// 这是最强的正确性检验 —— 两种算法实现路径完全不同
// （前者压缩成树递归挖，后者逐层扫描），
// 结果一致就说明两边都对；若不一致，必有一方错。
// ============================================================
import { describe, it, expect } from 'vitest'
import { apriori, type Transaction } from '@/lib/apriori'
import {
  fpGrowth,
  buildFpTree,
  itemFrequency,
  orderByFrequency,
  flattenFpTree,
  genFpgBasket,
  aprioriPassCount,
  aprioriCandidateCount,
} from '@/lib/fpgrowth'

/** 经典 5 笔交易（与 apriori.test.ts 同一份，便于对照） */
const TX: Transaction[] = [
  { id: 1, items: ['牛奶', '饼干'].sort() },
  { id: 2, items: ['剃须刀', '牛奶', '饼干'].sort() },
  { id: 3, items: ['剃须刀', '牛奶'].sort() },
  { id: 4, items: ['剃须刀', '饼干'].sort() },
  { id: 5, items: ['剃须刀', '牛奶', '饼干'].sort() },
]

const sortedSets = (r: { items: string[] }[]) =>
  r.map((f) => [...f.items].sort().join('|')).sort()

describe('工具：频次统计与排序', () => {
  it('统计各商品出现次数', () => {
    const f = itemFrequency(TX)
    expect(f.get('牛奶')).toBe(4)
    expect(f.get('饼干')).toBe(4)
    expect(f.get('剃须刀')).toBe(4)
  })

  it('按频次降序排列', () => {
    const f = itemFrequency([
      { id: 1, items: ['a'] },
      { id: 2, items: ['b', 'c'] },
      { id: 3, items: ['c'] },
    ])
    const order = orderByFrequency(f)
    expect(order[0]).toBe('c') // 出现 2 次
    expect(order.slice(1).sort()).toEqual(['a', 'b'])
  })

  it('同频次时按名称排序，结果确定可复现', () => {
    const f1 = itemFrequency([
      { id: 1, items: ['z', 'a'] },
      { id: 2, items: ['a', 'z'] },
    ])
    expect(orderByFrequency(f1)).toEqual(orderByFrequency(f1))
    expect(orderByFrequency(f1)).toEqual(['a', 'z'])
  })
})

describe('FP-tree 构建', () => {
  it('节点数不超过交易数之和（压缩生效）', () => {
    const t = buildFpTree(TX, 1)
    // 5 笔交易，总商品数 = 2+3+2+2+3 = 12，节点数应远小于 12
    expect(t.stats.nodeCount).toBeLessThan(12)
    expect(t.stats.nodeCount).toBeGreaterThan(0)
  })

  it('低频商品被剪掉（全局剪枝）', () => {
    // minCount=5 意味着没有任何商品能达标
    const t = buildFpTree(TX, 5)
    expect(t.orderedItems).toHaveLength(0)
    expect(t.stats.prunedItems).toBe(3)
  })

  it('表头表包含所有保留商品', () => {
    const t = buildFpTree(TX, 2)
    for (const item of t.orderedItems) {
      expect(t.header.has(item)).toBe(true)
    }
  })

  it('相同前缀的交易共享路径（FP-tree 的压缩原理）', () => {
    // 交易 2 [剃须刀,牛奶,饼干]、3[剃须刀,牛奶]、5[剃须刀,牛奶,饼干]
    // 按频次排序后都以 剃须刀 开头 → 共享 剃须刀→牛奶 这段
    const t = buildFpTree(TX, 2)
    const razor = t.header.get('剃须刀') ?? []
    expect(razor.length).toBe(1)
    expect(razor[0].count).toBe(4) // 4 笔交易含剃须刀
    // 牛奶 在 剃须刀 下面有第二个节点（被 剃须刀→牛奶 共享）
    const milk = t.header.get('牛奶') ?? []
    expect(milk.some((n) => n.path.length === 2 && n.path[0] === '剃须刀' && n.path[1] === '牛奶')).toBe(true)
  })

  it('节点 path 记录从根到自己的路径，且长度 = depth+1', () => {
    const t = buildFpTree(TX, 2)
    for (const nodes of t.header.values()) {
      for (const n of nodes) {
        expect(n.path[n.path.length - 1]).toBe(n.item)
        expect(n.path.length).toBe(n.path.length) // 自身路径非空
        expect(n.path.length).toBeGreaterThan(0)
      }
    }
  })

  it('压缩比 = 节点数 / 原始商品总数（教学指标）', () => {
    const t = buildFpTree(TX, 1)
    // 原始商品总数 2+3+2+2+3 = 12，节点数应小于它
    expect(t.stats.compressionRatio).toBeGreaterThan(0)
    expect(t.stats.compressionRatio).toBeLessThanOrEqual(1)
  })

  it('树的最大深度不超过最长交易长度', () => {
    const t = buildFpTree(TX, 1)
    expect(t.stats.maxDepth).toBeLessThanOrEqual(3)
    expect(t.stats.maxDepth).toBeGreaterThan(0)
  })

  it('空数据不崩', () => {
    const t = buildFpTree([], 1)
    expect(t.stats.nodeCount).toBe(0)
  })
})

describe('FP-Growth 与 Apriori 结果一致（最关键的正确性检验）', () => {
  it('5 笔小数据集：两者频繁项集完全相同', () => {
    for (const ms of [0.2, 0.4, 0.5, 0.6, 0.8]) {
      const a = sortedSets(apriori(TX, ms).frequentItemsets)
      const f = sortedSets(fpGrowth(TX, ms).frequentItemsets)
      expect(f, `minSupport=${ms} 时不一致`).toEqual(a)
    }
  })

  it('生成的 200 笔购物篮：两者频繁项集完全相同', () => {
    const data = genFpgBasket(200, 42)
    for (const ms of [0.05, 0.1, 0.15, 0.2, 0.3, 0.4]) {
      const a = sortedSets(apriori(data, ms).frequentItemsets)
      const f = sortedSets(fpGrowth(data, ms).frequentItemsets)
      expect(f.length, `minSupport=${ms} 时数量不同`).toBe(a.length)
      expect(f, `minSupport=${ms} 时内容不同`).toEqual(a)
    }
  })

  it('不同种子、不同交易数下仍一致', () => {
    for (const [n, seed] of [[50, 1], [120, 7], [300, 99]] as const) {
      const data = genFpgBasket(n, seed)
      const a = sortedSets(apriori(data, 0.12).frequentItemsets)
      const f = sortedSets(fpGrowth(data, 0.12).frequentItemsets)
      expect(f).toEqual(a)
    }
  })

  it('极高阈值时两者都返回空', () => {
    const a = apriori(TX, 0.99).frequentItemsets
    const f = fpGrowth(TX, 0.99).frequentItemsets
    expect(f).toHaveLength(0)
    expect(a).toHaveLength(0)
  })

  it('支持度数值与 Apriori 一致', () => {
    const data = genFpgBasket(120, 42)
    const aMap = new Map(apriori(data, 0.15).frequentItemsets.map((f) => [[...f.items].sort().join('|'), f.support]))
    for (const f of fpGrowth(data, 0.15).frequentItemsets) {
      const key = [...f.items].sort().join('|')
      expect(aMap.has(key)).toBe(true)
      expect(f.support).toBeCloseTo(aMap.get(key)!, 9)
    }
  })

  it('频繁项集按长度升序排列（便于展示）', () => {
    const r = fpGrowth(genFpgBasket(150, 3), 0.1)
    for (let i = 1; i < r.frequentItemsets.length; i++) {
      expect(r.frequentItemsets[i].items.length).toBeGreaterThanOrEqual(
        r.frequentItemsets[i - 1].items.length,
      )
    }
  })
})

describe('FP-Growth 的成本优势（教学重点）', () => {
  it('只扫数据库 1 遍（cost.fpTreePasses = 1）', () => {
    const r = fpGrowth(genFpgBasket(200, 42), 0.1)
    expect(r.cost.fpTreePasses).toBe(1)
  })

  it('Apriori 的扫描遍数 = 最长频繁项集长度', () => {
    const data = genFpgBasket(200, 42)
    const freq = apriori(data, 0.1).frequentItemsets
    const passes = aprioriPassCount(freq)
    expect(passes).toBeGreaterThanOrEqual(2)
    // FP-Growth 恒为 1，Apriori 随项集长度增长
    expect(fpGrowth(data, 0.1).cost.fpTreePasses).toBeLessThan(passes)
  })

  it('阈值降低时 Apriori 遍数增加，FP-Growth 仍为 1', () => {
    const data = genFpgBasket(200, 42)
    const loose = aprioriPassCount(apriori(data, 0.05).frequentItemsets)
    const strict = aprioriPassCount(apriori(data, 0.3).frequentItemsets)
    expect(loose).toBeGreaterThanOrEqual(strict)
    expect(fpGrowth(data, 0.05).cost.fpTreePasses).toBe(1)
    expect(fpGrowth(data, 0.3).cost.fpTreePasses).toBe(1)
  })

  it('候选集规模：Apriori 组合数增长快于 FP-Growth 的精确计数次数', () => {
    const data = genFpgBasket(200, 42)
    const aFreq = apriori(data, 0.1).frequentItemsets
    const nSingles = aFreq.filter((f) => f.items.length === 1).length
    const maxLen = aprioriPassCount(aFreq)
    const aprioriCand = aprioriCandidateCount(nSingles, maxLen)
    const fpCount = fpGrowth(data, 0.1).cost.countOperations
    // FP-Growth 的精确计数次数应明显少于 Apriori 的候选集总数
    expect(fpCount).toBeLessThan(aprioriCand)
  })

  it('候选集数量公式：n=5、maxLen=2 时 C(5,1)+C(5,2)=5+10=15', () => {
    expect(aprioriCandidateCount(5, 2)).toBe(15)
    expect(aprioriCandidateCount(5, 1)).toBe(5)
    expect(aprioriCandidateCount(3, 5)).toBe(7) // C(3,1)+C(3,2)+C(3,3)=3+3+1，k>3 的项为 0
  })
})

describe('挖掘过程可视化数据', () => {
  it('提供挖掘步骤供动画使用', () => {
    const r = fpGrowth(genFpgBasket(200, 42), 0.1)
    expect(r.steps.length).toBeGreaterThan(0)
    for (const s of r.steps) {
      expect(typeof s.depth).toBe('number')
      expect(Array.isArray(s.candidates)).toBe(true)
      expect(Array.isArray(s.found)).toBe(true)
      expect(Array.isArray(s.pruned)).toBe(true)
    }
    // 第 0 步应是全部频繁单品
    expect(r.steps[0].depth).toBe(0)
  })

  it('步骤深度递增，且第 0 步输出全部单品', () => {
    const r = fpGrowth(TX, 0.4)
    const singles = r.frequentItemsets.filter((f) => f.items.length === 1)
    expect(singles.length).toBe(3) // 牛奶/饼干/剃须刀各 4 次 ≥ 2
    for (const f of singles) expect(f.count).toBe(4)
  })
})

describe('树的可视化（flattenFpTree）', () => {
  it('展平后父子关系正确', () => {
    const t = buildFpTree(TX, 1)
    const flat = flattenFpTree(t)
    const byId = new Map(flat.map((n) => [n.id, n]))
    for (const n of flat) {
      if (n.parentId) {
        expect(byId.has(n.parentId)).toBe(true)
        // 子节点 depth 必须比父节点大 1
        expect(n.depth).toBe(byId.get(n.parentId)!.depth + 1)
      } else {
        expect(n.depth).toBe(0)
      }
    }
  })

  it('根节点的直接孩子 depth = 0', () => {
    const t = buildFpTree(TX, 1)
    const flat = flattenFpTree(t)
    expect(flat.some((n) => n.depth === 0)).toBe(true)
  })

  it('限量参数生效（防止大树渲染卡顿）', () => {
    const t = buildFpTree(genFpgBasket(300, 1), 1)
    const flat = flattenFpTree(t, 20)
    expect(flat.length).toBeLessThanOrEqual(20)
  })

  it('无循环引用（React 不能直接渲染带parent 的对象）', () => {
    const t = buildFpTree(TX, 1)
    const flat = flattenFpTree(t)
    // 展平后的数据只有原始类型，可以安全进 JSON
    expect(() => JSON.stringify(flat)).not.toThrow()
  })
})

describe('边界情况', () => {
  it('空数据不崩', () => {
    const r = fpGrowth([], 0.5)
    expect(r.frequentItemsets).toHaveLength(0)
  })

  it('全不同商品的交易（无频繁对）', () => {
    const data: Transaction[] = [
      { id: 1, items: ['a'] },
      { id: 2, items: ['b'] },
      { id: 3, items: ['c'] },
    ]
    const r = fpGrowth(data, 0.5) // minCount=2，单品频次都是 1，全被剪
    expect(r.frequentItemsets).toHaveLength(0)
  })

  it('所有交易相同（树退化成一条链）', () => {
    const data: Transaction[] = Array.from({ length: 10 }, (_, i) => ({ id: i, items: ['a', 'b', 'c'] }))
    const t = buildFpTree(data, 2)
    expect(t.stats.nodeCount).toBe(3) // 完全共享路径
    expect(t.stats.maxDepth).toBe(3)
    const r = fpGrowth(data, 0.2)
    // {a,b,c} 也频繁（10 次）
    expect(sortedSets(r.frequentItemsets)).toContain('a|b|c')
  })

  it('单个商品反复出现', () => {
    const data: Transaction[] = Array.from({ length: 5 }, (_, i) => ({ id: i, items: ['x'] }))
    const r = fpGrowth(data, 0.5)
    expect(r.frequentItemsets).toHaveLength(1)
    expect(r.frequentItemsets[0].items).toEqual(['x'])
    expect(r.frequentItemsets[0].count).toBe(5)
  })

  it('数据可复现（同种子同结果）', () => {
    expect(genFpgBasket(50, 42)).toEqual(genFpgBasket(50, 42))
    expect(genFpgBasket(50, 42)).not.toEqual(genFpgBasket(50, 7))
  })
})