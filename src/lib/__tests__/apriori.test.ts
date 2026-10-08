// ============================================================
// 关联规则（Apriori）—— 单元测试
//
// 用 5 笔交易的小数据集手工核对每一步：
//   t1: 牛奶 饼干
//   t2: 牛奶 饼干 剃须刀
//   t3: 牛奶 剃须刀
//   t4: 饼干 剃须刀
//   t5: 牛奶 饼干 剃须刀
//
// 支持度表（5 笔为分母）：
//   牛奶 4/5   饼干 4/5   剃须刀 4/5
//   {牛奶,饼干} 3/5   {牛奶,剃须刀} 3/5   {饼干,剃须刀} 3/5
//   {牛奶,饼干,剃须刀} 2/5
//
// 注意 API 约定（易错点）：
//   itemsetKey(items) = items.join('|')，不排序 —— 顺序由调用方保证
//   apriori().levels 是 { level, candidates, counts, frequent } 结构
//   扁平后的频繁项集在 .frequentItemsets（含 support 比例）
// ============================================================
import { describe, it, expect } from 'vitest'
import { apriori, genRules, supportCount, itemsetKey, type Transaction } from '@/lib/apriori'

/** 按「集合」查找规则（项集内元素顺序由实现决定，不能用 join 字符串直接比较） */
function findRule(
  rules: ReturnType<typeof genRules>,
  ante: string[],
  cons: string[],
) {
  const eq = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
  return rules.find((r) => eq(r.antecedent, ante) && eq(r.consequent, cons))
}

/** 按集合判断频繁项集列表里是否含某项集 */
function hasItemset(result: ReturnType<typeof apriori>, items: string[]): boolean {
  return result.frequentItemsets.some((f) => f.items.length === items.length && items.every((x) => f.items.includes(x)))
}

/**
 * 注意 Transaction.items 的约定：**去重 + 按 Unicode 码点排序**。
 * itemsetKey 依赖这个约定（它是 supMap 的 key，顺序不一致就查不到支撑度）。
 * '剃须刀'(U+5265) < '牛奶'(U+725B) < '饼干'(U+94CA) —— 中文按 Unicode 码点排。
 * 所以下面的 items 数组都写成已排序形式。
 */
const TX: Transaction[] = [
  { id: 1, items: ['牛奶', '饼干'].sort() },
  { id: 2, items: ['剃须刀', '牛奶', '饼干'].sort() },
  { id: 3, items: ['剃须刀', '牛奶'].sort() },
  { id: 4, items: ['剃须刀', '饼干'].sort() },
  { id: 5, items: ['剃须刀', '牛奶', '饼干'].sort() },
]

/** 某层里被标记为频繁的项集（用 itemsetKey 表示） */
function frequentKeys(result: ReturnType<typeof apriori>, levelIndex: number): string[] {
  const lv = result.levels[levelIndex]
  const out: string[] = []
  lv.candidates.forEach((cand, i) => {
    if (lv.frequent[i]) out.push(itemsetKey(cand))
  })
  return out.sort()
}

describe('支持度计数', () => {
  it('单项集计数正确', () => {
    expect(supportCount(TX, ['牛奶'])).toBe(4) // t1,t2,t3,t5
    expect(supportCount(TX, ['饼干'])).toBe(4) // t1,t2,t4,t5
    expect(supportCount(TX, ['剃须刀'])).toBe(4) // t2,t3,t4,t5
  })

  it('两项集计数正确', () => {
    expect(supportCount(TX, ['牛奶', '饼干'].sort())).toBe(3) // t1,t2,t5
    expect(supportCount(TX, ['剃须刀', '牛奶'].sort())).toBe(3) // t2,t3,t5
    expect(supportCount(TX, ['剃须刀', '饼干'].sort())).toBe(3) // t2,t4,t5
  })

  it('三项集计数 = 2', () => {
    expect(supportCount(TX, ['剃须刀', '牛奶', '饼干'].sort())).toBe(2) // t2,t5
  })

  it('不存在的项集计数为 0', () => {
    expect(supportCount(TX, ['不存在'])).toBe(0)
    expect(supportCount(TX, ['牛奶', '不存在'])).toBe(0)
  })

  it('空项集匹配所有交易', () => {
    expect(supportCount(TX, [])).toBe(5)
  })

  it('itemsetKey 用 | 连接，且与元素顺序无关', () => {
    expect(itemsetKey(['a'])).toBe('a')
    expect(itemsetKey([])).toBe('')
    expect(itemsetKey(['b', 'a'])).toBe(itemsetKey(['a', 'b']))
    // 不修改调用方的数组
    const arr = ['c', 'a', 'b']
    itemsetKey(arr)
    expect(arr).toEqual(['c', 'a', 'b'])
  })

  it('itemsetKey 顺序无关：未排序数据也能正确匹配规则', () => {
    // 回归测试：曾因 itemsetKey 依赖「数组已排序」这个隐式约定，
    // 导致未排序的输入在 genRules 里查不到支撑度、规则被静默丢弃
    const unsorted: Transaction[] = [
      { id: 1, items: ['牛奶', '饼干'] }, // 未排序
      { id: 2, items: ['牛奶', '饼干', '剃须刀'] },
      { id: 3, items: ['牛奶'] },
    ]
    const r = apriori(unsorted, 0.5)
    const rules = genRules(r, 0.5)
    // {牛奶,饼干} 出现 2 次，sup(牛奶)=3/3 → conf = 2/3
    const r1 = findRule(rules, ['牛奶'], ['饼干'])
    expect(r1).toBeDefined()
    expect(r1!.confidence).toBeCloseTo(2 / 3, 9)
  })
})

describe('Apriori 频繁项集挖掘', () => {
  it('minSupport=0.5 → minCount 应为 3（5×0.5=2.5 向上取整）', () => {
    const r = apriori(TX, 0.5)
    expect(r.nTrans).toBe(5)
    expect(r.minCount).toBe(3)
  })

  it('L1 找出 3 个满足条件的单项集', () => {
    const r = apriori(TX, 0.5)
    for (const item of ['牛奶', '饼干', '剃须刀']) {
      expect(hasItemset(r, [item])).toBe(true)
    }
    expect(r.frequentItemsets.filter((f) => f.items.length === 1)).toHaveLength(3)
  })

  it('L2 找出 3 个频繁两项集', () => {
    // minCount=3，三个两项集都恰好出现 3 次
    const r = apriori(TX, 0.5)
    expect(frequentKeys(r, 1)).toHaveLength(3)
  })

  it('L3 三元集出现 2 次 < minCount 3，应被剪掉', () => {
    const r = apriori(TX, 0.5)
    // 三元 {牛奶,饼干,剃须刀} 出现 2 次 → 不频繁
    // 所以没有第 3 层（或第 3 层全不频繁）
    expect(r.levels.length).toBeLessThanOrEqual(3)
    const l3 = r.levels[2]
    if (l3) {
      expect(l3.frequent.some((f) => f)).toBe(false)
    }
  })

  it('降低阈值到 0.4（minCount=2）后三元集变频繁', () => {
    const r = apriori(TX, 0.4)
    expect(r.minCount).toBe(2)
    expect(hasItemset(r, ['牛奶', '饼干', '剃须刀'])).toBe(true)
  })

  it('提高阈值后频繁项集数不增（支持度反单调）', () => {
    const count = (r: ReturnType<typeof apriori>) => r.frequentItemsets.length
    expect(count(apriori(TX, 0.6))).toBeLessThanOrEqual(count(apriori(TX, 0.4)))
    expect(count(apriori(TX, 0.8))).toBeLessThanOrEqual(count(apriori(TX, 0.6)))
  })

  it('支持度反单调：频繁项集的所有子集也必频繁', () => {
    const r = apriori(TX, 0.4)
    for (const f of r.frequentItemsets) {
      if (f.items.length >= 3) {
        // 三元集的两个二元子集必须也频繁（按集合比较，顺序由实现决定）
        expect(hasItemset(r, f.items.slice(0, -1))).toBe(true)
        expect(hasItemset(r, f.items.slice(1))).toBe(true)
      }
    }
  })

  it('频繁项集总数不超过 2³−1 = 7', () => {
    const r = apriori(TX, 0)
    expect(r.frequentItemsets.length).toBe(7) // 3 单 + 3 两 + 1 三
  })

  it('frequentItemsets 里的 support 是比例而非计数', () => {
    const r = apriori(TX, 0.4)
    for (const f of r.frequentItemsets) {
      expect(f.support).toBeGreaterThan(0)
      expect(f.support).toBeLessThanOrEqual(1)
      // 与手工计数一致
      expect(f.support).toBeCloseTo(supportCount(TX, f.items) / TX.length, 9)
    }
  })

  it('minSupport=0.99 时挖不出任何频繁项集', () => {
    // 5 × 0.99 = 4.95 → minCount = 5，单项集最多 4 次
    const r = apriori(TX, 0.99)
    expect(r.frequentItemsets).toHaveLength(0)
  })

  it('空数据集不崩', () => {
    const r = apriori([], 0.3)
    expect(r.frequentItemsets).toHaveLength(0)
  })
})

describe('关联规则生成', () => {
  it('规则方向敏感：P(牛奶→剃须刀) ≠ P(剃须刀→牛奶)', () => {
    const r = apriori(TX, 0.4)
    const rules = genRules(r, 0.5)
    const milkToShave = findRule(rules, ['牛奶'], ['剃须刀'])
    const shaveToMilk = findRule(rules, ['剃须刀'], ['牛奶'])
    expect(milkToShave).toBeDefined()
    expect(shaveToMilk).toBeDefined()
    // 牛奶→剃须刀：sup=3/5，sup(牛奶)=4/5 → conf = 0.75
    expect(milkToShave!.confidence).toBeCloseTo(0.75, 9)
    // 剃须刀→牛奶：sup=3/5，sup(剃须刀)=4/5 → conf = 0.75（对称，因两商品边际相同）
    expect(shaveToMilk!.confidence).toBeCloseTo(0.75, 9)
    // 但提升度不同：A→B 的 lift = 0.75 / sup(B)，两者 sup 相同故也相同
  })

  it('置信度 = sup(A∪B) / sup(A)', () => {
    const r = apriori(TX, 0.4)
    for (const rule of genRules(r, 0.5)) {
      const supA = supportCount(TX, rule.antecedent) / TX.length
      const supAB = supportCount(TX, [...rule.antecedent, ...rule.consequent]) / TX.length
      if (supA > 0) expect(rule.confidence).toBeCloseTo(supAB / supA, 9)
    }
  })

  it('提升度 lift = 置信度 / 后件支持度', () => {
    const r = apriori(TX, 0.4)
    for (const rule of genRules(r, 0.5)) {
      const supB = supportCount(TX, rule.consequent) / TX.length
      if (supB > 0) expect(rule.lift).toBeCloseTo(rule.confidence / supB, 9)
    }
  })

  it('完美正相关时 lift 最大', () => {
    // 4 笔同时买 A 和 B，1 笔只买 A
    const pos: Transaction[] = [
      { id: 1, items: ['A', 'B'] },
      { id: 2, items: ['A', 'B'] },
      { id: 3, items: ['A', 'B'] },
      { id: 4, items: ['A', 'B'] },
      { id: 5, items: ['A'] },
    ]
    const r = apriori(pos, 0.5)
    const rules = genRules(r, 0.5)
    const ab = findRule(rules, ['A'], ['B'])
    expect(ab).toBeDefined()
    // conf = 4/5 = 0.8, sup(B) = 4/5 = 0.8 → lift = 1
    expect(ab!.lift).toBeCloseTo(1, 9)
    // B→A：conf = 4/4 = 1，sup(A) = 5/5 = 1 → lift = 1
    const ba = findRule(rules, ['B'], ['A'])
    expect(ba!.lift).toBeCloseTo(1, 9)
  })

  it('负相关时 lift < 1', () => {
    // 3 笔同时买，1 笔只买 A，1 笔只买 B → 共现率低于边际
    const neg: Transaction[] = [
      { id: 1, items: ['A', 'B'] },
      { id: 2, items: ['A', 'B'] },
      { id: 3, items: ['A', 'B'] },
      { id: 4, items: ['A'] },
      { id: 5, items: ['B'] },
    ]
    const r = apriori(neg, 0.5)
    const rules = genRules(r, 0.5)
    const ab = findRule(rules, ['A'], ['B'])
    expect(ab).toBeDefined()
    // conf = 3/4 = 0.75, sup(B) = 4/5 = 0.8 → lift = 0.9375 < 1
    expect(ab!.lift).toBeLessThan(1)
  })

  it('从不出共现的商品不会生成规则', () => {
    // A 与 B 从不同时出现 → 支持度 0 → 不进频繁项集
    const indep: Transaction[] = [
      { id: 1, items: ['A'] },
      { id: 2, items: ['A'] },
      { id: 3, items: ['B'] },
      { id: 4, items: ['B'] },
    ]
    const r = apriori(indep, 0.4)
    const rules = genRules(r, 0.5)
    expect(rules.find((x) => x.antecedent.includes('A') && x.consequent.includes('B'))).toBeUndefined()
  })

  it('置信度阈值收紧后规则数不增', () => {
    const r = apriori(TX, 0.4)
    const loose = genRules(r, 0)
    const strict = genRules(r, 0.99)
    expect(strict.length).toBeLessThanOrEqual(loose.length)
    for (const rule of strict) expect(rule.confidence).toBeGreaterThanOrEqual(0.99)
  })

  it('规则的前件与后件不相交', () => {
    const r = apriori(TX, 0.4)
    for (const rule of genRules(r, 0.5)) {
      for (const a of rule.antecedent) expect(rule.consequent).not.toContain(a)
    }
  })

  it('无频繁项集时不生成任何规则', () => {
    const r = apriori(TX, 0.99)
    expect(genRules(r, 0)).toHaveLength(0)
  })

  it('规则的 support 与 source 项集一致', () => {
    const r = apriori(TX, 0.4)
    for (const rule of genRules(r, 0.5)) {
      const supAB = supportCount(TX, [...rule.antecedent, ...rule.consequent]) / TX.length
      expect(rule.support).toBeCloseTo(supAB, 9)
    }
  })
})