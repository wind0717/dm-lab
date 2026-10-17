// ============================================================
// 演示屏：Apriori 与 FP-Growth 的逐步动画
// ============================================================
// 设计要点：
//  1. 两种算法各自独立的步进序列，学生可以来回切换对照
//  2. 每一步都同时显示「发生了什么」和「为什么这一步有意义」
//  3. **被剪掉的候选用删除线显示** —— 学生必须看到算法"放弃了什么"
//  4. Apriori 显示每层候选/计数/去留；FP-Growth 显示每层扩展/剪枝/树的变化
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import StepControls from '@/components/StepControls'
import FpTreeView from '@/components/FpTreeView'
import { genRules, type AprioriResult, type Transaction } from '@/lib/apriori'
import type { FpGrowthResult } from '@/lib/fpgrowth'

interface Props {
  transactions: Transaction[]
  minSupport: number
  minConf: number
  aprioriResult: AprioriResult
  fpResult: FpGrowthResult
}

type AlgId = 'apriori' | 'fpgrowth'

/** 一个演示步骤的归一化结构 */
interface DemoStep {
  title: string
  /** 这一步在做什么（面向学生的一句话） */
  what: string
  /** 为什么这一步有意义（概念解释） */
  why: string
  /** 本步详细数据，随算法不同 */
  payload: React.ReactNode
}

export default function AlgWalkthrough({
  transactions,
  minSupport,
  minConf,
  aprioriResult,
  fpResult,
}: Props) {
  const [alg, setAlg] = useState<AlgId>('apriori')
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  // 切换算法/参数时回到第 0 步。
  // 用「渲染期比对」而不是 effect：effect 要多渲染一轮才复位，
  // 学生会看到一闪而过的旧步骤。
  const resetKey = `${alg}|${minSupport}|${transactions.length}`
  const [lastKey, setLastKey] = useState(resetKey)
  if (lastKey !== resetKey) {
    setLastKey(resetKey)
    setStep(0)
    setPlaying(false)
  }

  const aprioriSteps = useMemo(
    () => buildAprioriSteps(aprioriResult, minConf),
    [aprioriResult, minConf],
  )
  const fpSteps = useMemo(() => buildFpSteps(fpResult), [fpResult])

  const steps = alg === 'apriori' ? aprioriSteps : fpSteps
  const cur = Math.min(step, Math.max(0, steps.length - 1))

  // 自动播放
  useEffect(() => {
    if (!playing) return
    if (cur >= steps.length - 1) {
      // 播到最后一步就停：这是对定时器这一外部系统的同步，
      // 属useEffect 的正当用途（不是把 props 同步成 state）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setStep((s) => s + 1), 1900)
    return () => clearTimeout(t)
  }, [playing, cur, steps.length])

  return (
    <div className="space-y-4">
      {/* 算法切换 */}
      <div className="flex gap-2">
        {(
          [
            ['apriori', 'Apriori 逐步演示'],
            ['fpgrowth', 'FP-Growth 逐步演示'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            data-testid={`alg-switch-${id}`}
            onClick={() => setAlg(id)}
            className={`rounded-lg px-4 py-2 text-sm transition-all ${
              alg === id
                ? 'bg-indigo-600 font-medium text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {steps.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-stone-500">
            当前支持度下没有挖到频繁项集，试试把支持度阈值调低一些
          </CardContent>
        </Card>
      ) : (
        <StepControls
          step={cur}
          totalSteps={steps.length}
          playing={playing}
          onStep={setStep}
          onPlaying={setPlaying}
          intervalMs={1900}
          title={steps[cur].title}
          extra={
            alg === 'apriori' ? (
              <span className="text-xs text-stone-400">
                共 {aprioriResult.levels.length} 层 · 扫库 {aprioriResult.levels.length} 遍
              </span>
            ) : (
              <span className="text-xs text-stone-400">
                树 {fpResult.tree.stats.nodeCount} 节点 · 压缩比{' '}
                {(fpResult.tree.stats.compressionRatio * 100).toFixed(0)}%
              </span>
            )
          }
        >
          <div className="space-y-3">
            {/* 本步做了什么 */}
            <div className="rounded-lg border-l-4 border-indigo-400 bg-indigo-50/50 px-3 py-2">
              <p className="text-xs font-medium text-indigo-900">{steps[cur].what}</p>
            </div>
            {/* 为什么重要 */}
            <p className="text-xs leading-relaxed text-stone-600">{steps[cur].why}</p>
            {/* 数据 */}
            <div className="overflow-x-auto">{steps[cur].payload}</div>
          </div>
        </StepControls>
      )}
    </div>
  )
}

// ============================================================
// Apriori 步骤构建
// ============================================================
function buildAprioriSteps(res: AprioriResult, minConf: number): DemoStep[] {
  const steps: DemoStep[] = []
  const minCount = res.minCount

  // 第 0 步：说明任务
  steps.push({
    title: '任务定义',
    what: '目标：从购物篮里找出所有「出现次数 ≥ 阈值」的项集',
    why: '频繁项集是关联规则的原料。只有先找到频繁项集，才能从中提取「A → B」这样的规则。',
    payload: (
      <div className="rounded-lg bg-stone-50 p-3 text-sm">
        <p>
          当前参数：最小支持度 {res.minCount}/{res.nTrans} ={' '}
          <span className="font-mono">{(minCount / res.nTrans * 100).toFixed(0)}%</span>
          ，即项集至少出现 <span className="font-mono font-semibold text-indigo-600">{minCount}</span> 笔
        </p>
      </div>
    ),
  })

  // 逐层步骤
  res.levels.forEach((lv, li) => {
    const keptCount = lv.counts.filter((c) => c >= minCount).length
    const kept = lv.candidates.filter((_, i) => lv.counts[i] >= minCount)
    const dropped = lv.candidates.filter((_, i) => lv.counts[i] < minCount)

    steps.push({
      title: `第 ${lv.level} 层 · ${lv.candidates.length === 0 ? '结束' : '扫描数据库'}`,
      what:
        lv.candidates.length === 0
          ? '这一层没有产生新的候选，挖掘结束'
          : `生成了 ${lv.candidates.length} 个候选，扫一遍数据库数它们各出现多少次`,
      why:
        lv.level === 1
          ? '第 1 层是所有单品，只需统计每个商品出现了多少次——这是唯一无法通过连接生成的一层。'
          : `这 ${lv.candidates.length} 个候选由第 ${lv.level - 1} 层的频繁项集两两连接而来（前 ${lv.level - 2} 项相同）。注意这里又要扫一遍数据库。`,
      payload: (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-indigo-50 px-2 py-1 font-medium text-indigo-700">
              候选 {lv.candidates.length} 个
            </span>
            <span className="rounded bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
              保留 {keptCount} 个
            </span>
            {dropped.length > 0 && (
              <span className="rounded bg-rose-50 px-2 py-1 font-medium text-rose-700">
                剪掉 {dropped.length} 个
              </span>
            )}
          </div>

          <div className="space-y-1">
            {lv.candidates.map((cand, i) => {
              const c = lv.counts[i]
              const ok = c >= minCount
              return (
                <div
                  key={cand.join('|')}
                  className={`flex items-center gap-2 rounded px-2 py-1 font-mono text-xs ${
                    ok ? 'bg-emerald-50/60' : 'bg-rose-50/60'
                  }`}
                >
                  <span className={ok ? 'text-stone-800' : 'text-stone-400 line-through'}>
                    {'{'}
                    {cand.join(', ')}
                    {'}'}
                  </span>
                  <span className="ml-auto font-medium">
                    {c} 笔
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {ok ? '频繁 ✓' : `不足 ${minCount} ✗`}
                  </span>
                  <span className="w-16 text-right text-[10px] text-stone-500">
                    sup {(c / res.nTrans).toFixed(3)}
                  </span>
                </div>
              )
            })}
          </div>

          {dropped.length > 0 && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800">
              <strong>被剪掉的 {dropped.length} 个候选：</strong>
              它们的任何超集也一定不频繁（反单调性），所以这些候选连同它们的「后代」
              都不必再考虑。这就是 Apriori 少算很多组合的原因。
            </p>
          )}

          {li === res.levels.length - 2 && kept.length > 0 && (
            <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
              这一层的 {kept.length} 个频繁项集将进入下一层继续连接生成候选。
            </p>
          )}
        </div>
      ),
    })

    // 最后一层之后展示规则
    if (li === res.levels.length - 1 && kept.length >= 2) {
      const rules = genRules(res, minConf)
      const shown = rules.slice(0, 12)
      steps.push({
        title: '生成关联规则',
        what: `从频繁项集中提取 ${rules.length} 条满足置信度 ≥ ${(minConf * 100).toFixed(0)}% 的规则`,
        why:
          '规则的两个方向要分开看：conf(A→B) 与 conf(B→A) 通常差别很大。提升度 lift = conf / sup(B)，lift≈1 说明只是碰巧同时热，没有真正的关联。',
        payload: (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="py-1.5 pr-2 font-medium">规则</th>
                  <th className="py-1.5 pr-2 font-medium">支持度</th>
                  <th className="py-1.5 pr-2 font-medium">置信度</th>
                  <th className="py-1.5 pr-2 font-medium">提升度</th>
                  <th className="py-1.5 font-medium">解读</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i} className="border-b border-stone-100">
                    <td className="py-1.5 pr-2 font-mono text-stone-800">
                      {'{'}
                      {r.antecedent.join(',')}
                      {'} → {'}
                      {r.consequent.join(',')}
                      {'}'}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-stone-600">
                      {r.support.toFixed(3)}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-stone-600">
                      {r.confidence.toFixed(3)}
                    </td>
                    <td
                      className={`py-1.5 pr-2 font-mono font-medium ${
                        r.lift > 1.05 ? 'text-emerald-600' : 'text-stone-400'
                      }`}
                    >
                      {r.lift.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-[10px] text-stone-500">
                      {r.lift > 1.05
                        ? '正相关：买前者更可能买后者'
                        : r.lift < 0.95
                          ? '负相关'
                          : '基本独立（lift≈1）'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rules.length > shown.length && (
              <p className="mt-1.5 text-[10px] text-stone-400">
                还有 {rules.length - shown.length} 条未显示
              </p>
            )}
          </div>
        ),
      })
    }
  })

  return steps
}

// ============================================================
// FP-Growth 步骤构建
// ============================================================
function buildFpSteps(res: FpGrowthResult): DemoStep[] {
  const steps: DemoStep[] = []
  const minCount = res.minCount

  steps.push({
    title: '第 1 步 · 扫一遍数据库，建 FP-tree',
    what: `把 ${res.nTrans} 笔交易压缩成一棵树，节点 ${res.tree.stats.nodeCount} 个`,
    why:
      '这一步是 FP-Growth 唯一接触原始数据库的机会。做的两件事：① 统计各商品频次，把出现不足阈值的直接丢掉；② 把每笔交易按「频次降序」重排后插入树。前缀相同的交易会走到同一节点，计数累加。',
    payload: (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-stone-100 px-2 py-1 font-medium text-stone-600">
            交易 {res.nTrans} 笔
          </span>
          <span className="rounded bg-indigo-50 px-2 py-1 font-medium text-indigo-700">
            节点 {res.tree.stats.nodeCount} 个
          </span>
          <span className="rounded bg-stone-100 px-2 py-1 font-medium text-stone-600">
            树深 {res.tree.stats.maxDepth}
          </span>
          {res.tree.stats.prunedItems > 0 && (
            <span className="rounded bg-rose-50 px-2 py-1 font-medium text-rose-700">
              全局剪掉 {res.tree.stats.prunedItems} 个低频商品
            </span>
          )}
        </div>
        <FpTreeView tree={res.tree} maxNodes={60} />
      </div>
    ),
  })

  // 逐层挖掘
  res.steps.forEach((st, i) => {
    if (i === 0) {
      // 第 0 层已包含在建树步骤里，这里只补一条说明
      steps.push({
        title: '第 2 步 · 确认第 1 层频繁项集',
        what: `${st.found.length} 个商品出现次数 ≥ ${minCount}，都是频繁项集`,
        why:
          '建树时已经把低频商品剪掉了，所以根节点的孩子天然就是全部频繁单品。这是「全局剪枝」的成果——Apriori 要扫完库才知道哪些单品频繁。',
        payload: (
          <div className="flex flex-wrap gap-1.5">
            {st.found.map((f) => (
              <span
                key={f.items.join('|')}
                className="rounded bg-emerald-50 px-2 py-1 font-mono text-xs text-emerald-700"
              >
                {'{'}
                {f.items.join(',')}
                {'}'} : {f.count}
              </span>
            ))}
          </div>
        ),
      })
      return
    }

    steps.push({
      title: `第 ${i + 2} 步 · 自底向上第 ${st.depth} 层扩展`,
      what:
        st.found.length > 0
          ? `用更频繁的商品扩展上一层频繁项集，${st.candidates.length} 个候选中 ${st.found.length} 个达标、${st.pruned.length} 个被剪`
          : '本层没有候选能通过剪枝，挖掘终止',
      why:
        '扩展顺序遵循「只加比当前项集最不频繁项更频繁的商品」——这样既不重不漏，又能让最不可能频繁的组合尽早失败。注意：一旦某个候选被剪掉，它的全部后代（再加任何商品）都不用试，这就是反单调性在树上的体现。',
      payload: (
        <div className="space-y-2">
          {st.found.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-emerald-700">
                ✓ 保留 {st.found.length} 个
              </p>
              <div className="flex flex-wrap gap-1.5">
                {st.found.map((f) => (
                  <span
                    key={f.items.join('|')}
                    className="rounded bg-emerald-50 px-2 py-1 font-mono text-xs text-emerald-700"
                  >
                    {'{'}
                    {f.items.join(',')}
                    {'}'} : {f.support.toFixed(3)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {st.pruned.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-rose-700">
                ✗ 剪掉 {st.pruned.length} 个
              </p>
              <div className="flex flex-wrap gap-1.5">
                {st.pruned.slice(0, 14).map((p) => (
                  <span
                    key={p.items.join('|')}
                    className="rounded bg-rose-50 px-2 py-1 font-mono text-xs text-rose-600"
                  >
                    {'{'}
                    {p.items.join(',')}
                    {'}'} : {p.count}
                  </span>
                ))}
                {st.pruned.length > 14 && (
                  <span className="text-xs text-rose-400">
                    …还有 {st.pruned.length - 14} 个
                  </span>
                )}
              </div>
              <p className="mt-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800">
                这些项集出现次数不足 {minCount} 笔。
                <strong>它们的任何扩展也一定不够</strong>（超集的交易数只会更少），
                所以整棵子树直接砍掉，不用继续尝试。
              </p>
            </div>
          )}
          {st.found.length === 0 && st.pruned.length === 0 && (
            <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
              没有需要考察的候选，算法结束。共扫库 1 遍。
            </p>
          )}
        </div>
      ),
    })
  })

  return steps
}