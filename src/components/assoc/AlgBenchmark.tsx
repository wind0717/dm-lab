// ============================================================
// 对比屏：把「凭什么 FP-Growth 更快」变成可测量的数字
// ============================================================
// 这一屏的设计意图：学生已经看过两个算法的原理和演示，
// 但「FP-Growth 更快」仍是结论。这里把它变成实验——
// 调数据量、调支持度，看代价怎么变化，自己得出结论。
// ============================================================

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apriori, type Transaction } from '@/lib/apriori'
import {
  fpGrowth,
  aprioriPassCount,
  aprioriCandidateCount,
  type FpGrowthResult,
} from '@/lib/fpgrowth'
import type { AprioriResult } from '@/lib/apriori'
import FpTreeView from '@/components/FpTreeView'

interface Props {
  transactions: Transaction[]
  minSupport: number
  aprioriResult: AprioriResult
  fpResult: FpGrowthResult
  onTweak: () => void
}

/** 实测耗时：跑多次取平均，避免单次抖动误导 */
function measure(fn: () => void, times: number): number {
  const t0 = performance.now()
  for (let i = 0; i < times; i++) fn()
  return (performance.now() - t0) / times
}

export default function AlgBenchmark({
  transactions,
  minSupport,
  aprioriResult,
  fpResult,
  onTweak,
}: Props) {
  // 内部做一组「不同数据规模」的扫描实验，让学生看曲线趋势
  const nProbes = 4

  /** 在 nProbes 个逐渐变大的规模上各跑一次，看代价增长曲线 */
  const probes = useMemo(() => {
    const out: {
      n: number
      aPasses: number
      aCand: number
      fCounts: number
      aMs: number
      fMs: number
      aFreq: number
      compression: number
    }[] = []

    for (let i = 0; i < nProbes; i++) {
      // 规模按 2 的幂增长：200, 400, 800, 1600, 3200
      const n = 200 * 2 ** i
      if (n > transactions.length * 3) break

      const slice = transactions.slice(0, Math.min(n, transactions.length))
      const times = n <= 500 ? 5 : 3

      const a = apriori(slice, minSupport)
      const f = fpGrowth(slice, minSupport)

      const aPasses = aprioriPassCount(a.frequentItemsets)
      const nSingles = a.frequentItemsets.filter((x) => x.items.length === 1).length
      const aCand = aprioriCandidateCount(nSingles, aPasses)

      out.push({
        n,
        aPasses,
        aCand,
        fCounts: f.cost.countOperations,
        aMs: measure(() => apriori(slice, minSupport), times),
        fMs: measure(() => fpGrowth(slice, minSupport), times),
        aFreq: a.frequentItemsets.length,
        compression: f.tree.stats.compressionRatio,
      })
    }
    return out
  }, [transactions, minSupport, nProbes])

  const keyOf = (items: string[]) => [...items].sort().join('|')
  const sameResults = useMemo(() => {
    const a = new Set(aprioriResult.frequentItemsets.map((x) => keyOf(x.items)))
    const f = new Set(fpResult.frequentItemsets.map((x) => keyOf(x.items)))
    return a.size === f.size && [...a].every((k) => f.has(k))
  }, [aprioriResult, fpResult])

  const curAPasses = aprioriPassCount(aprioriResult.frequentItemsets)
  const curSingles = aprioriResult.frequentItemsets.filter((x) => x.items.length === 1).length
  const curACand = aprioriCandidateCount(curSingles, curAPasses)

  const maxCand = Math.max(...probes.map((p) => p.aCand), 1)

  return (
    <div className="space-y-5">
      {/* ① 一致性：这是对比的前提 */}
      <Card className={sameResults ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-stone-800">先确认一件事：结果是否一致？</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                sameResults
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {sameResults ? '✓ 两个算法挖出的频繁项集完全相同' : '⚠ 结果不一致（异常，请检查）'}
            </span>
            <span className="text-xs text-stone-500">
              共 {aprioriResult.frequentItemsets.length} 个 · 结果相同才有资格比速度
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-stone-600">
            两个算法的目标与剪枝依据完全相同，所以结果必须一致。
            如果你在作业里发现不一致，那是 bug 不是特性。
          </p>
        </CardContent>
      </Card>

      {/* ② 当前参数的代价对比 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-stone-800">当前数据集上的代价对比</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="py-2 pr-2 font-medium">对比项</th>
                  <th className="py-2 pr-2 font-medium">Apriori</th>
                  <th className="py-2 pr-2 font-medium">FP-Growth</th>
                  <th className="py-2 font-medium">差异说明</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100">
                  <td className="py-2 pr-2 text-stone-700">扫描数据库遍数</td>
                  <td className="py-2 pr-2 font-mono text-xs text-stone-600">
                    {curAPasses} 遍
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs font-semibold text-indigo-700">
                    1 遍
                  </td>
                  <td className="py-2 text-xs text-stone-500">
                    {curAPasses > 1
                      ? `Apriori 每挖一层就重扫一次全库`
                      : '本例项集较短，两者相同'}
                  </td>
                </tr>
                <tr className="border-b border-stone-100">
                  <td className="py-2 pr-2 text-stone-700">需验证的候选数</td>
                  <td className="py-2 pr-2 font-mono text-xs text-stone-600">
                    ≈ {curACand.toLocaleString()}
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs font-semibold text-indigo-700">
                    {fpResult.cost.countOperations.toLocaleString()}
                  </td>
                  <td className="py-2 text-xs text-stone-500">
                    Apriori 按组合数增长（
                    <span className="font-mono">C({curSingles},1)+C({curSingles},2)+…</span>），
                    FP-Growth 只枚举已证明频繁的项集
                  </td>
                </tr>
                <tr className="border-b border-stone-100">
                  <td className="py-2 pr-2 text-stone-700">FP-tree 压缩比</td>
                  <td className="py-2 pr-2 text-xs text-stone-400">不适用</td>
                  <td className="py-2 pr-2 font-mono text-xs font-semibold text-indigo-700">
                    {(fpResult.tree.stats.compressionRatio * 100).toFixed(0)}%
                  </td>
                  <td className="py-2 text-xs text-stone-500">
                    {fpResult.tree.stats.nodeCount} 个节点承载了全部{' '}
                    {fpResult.nTrans} 笔交易
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-stone-50 p-3">
            <FpTreeView tree={fpResult.tree} maxNodes={40} />
          </div>
        </CardContent>
      </Card>

      {/* ③ 规模实验：让学生亲眼看代价如何随数据量增长 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm text-stone-800">
            <span>规模实验：代价随数据量怎么变？</span>
            <span className="text-xs font-normal text-stone-400">
              {probes.length > 0 ? `已测 ${probes.length} 个规模` : '数据量不足，无法扫描'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-relaxed text-stone-600">
            下面在几个逐渐变大的数据规模上分别跑两个算法。
            <strong className="text-stone-800">重点看两个柱子的相对高度变化</strong>——
            数据越大，Apriori 的候选集增长得越快。
          </p>

          {probes.length === 0 ? (
            <p className="rounded-lg bg-stone-100 px-3 py-6 text-center text-xs text-stone-500">
              当前数据集只有 {transactions.length} 笔交易，不足以做规模扫描。
              回到参数面板把「交易笔数」调大试试。
            </p>
          ) : (
            <div className="space-y-3">
              {probes.map((p) => (
                <div key={p.n} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-medium text-stone-700">{p.n} 笔交易</p>
                    <p className="text-[10px] text-stone-400">
                      挖出 {p.aFreq} 个频繁项集
                      {p.fCounts < p.aCand && (
                        <span className="ml-1 text-indigo-600">
                          · 候选量比 {(p.aCand / Math.max(p.fCounts, 1)).toFixed(1)}×
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {/* Apriori 候选集 */}
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-[10px] text-stone-500">Apriori</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-stone-100">
                        <div
                          className="h-full rounded bg-amber-400 transition-all"
                          style={{ width: `${(p.aCand / maxCand) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right font-mono text-[10px] text-stone-600">
                        {p.aCand.toLocaleString()}
                      </span>
                    </div>
                    {/* FP-Growth 计数 */}
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-[10px] text-stone-500">FP-Growth</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-stone-100">
                        <div
                          className="h-full rounded bg-indigo-500 transition-all"
                          style={{
                            width: `${(p.fCounts / maxCand) * 100}%`,
                            minWidth: p.fCounts > 0 ? 2 : 0,
                          }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right font-mono text-[10px] text-stone-600">
                        {p.fCounts.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 耗时对比 */}
          {probes.length > 1 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-stone-500">
                    <th className="py-1.5 pr-2 font-medium">交易数</th>
                    <th className="py-1.5 pr-2 font-medium">Apriori 耗时</th>
                    <th className="py-1.5 pr-2 font-medium">FP-Growth 耗时</th>
                    <th className="py-1.5 font-medium">倍数</th>
                  </tr>
                </thead>
                <tbody>
                  {probes.map((p) => (
                    <tr key={p.n} className="border-b border-stone-100">
                      <td className="py-1.5 pr-2 font-mono text-stone-700">{p.n}</td>
                      <td className="py-1.5 pr-2 font-mono text-stone-600">{p.aMs.toFixed(2)} ms</td>
                      <td className="py-1.5 pr-2 font-mono text-stone-600">{p.fMs.toFixed(2)} ms</td>
                      <td
                        className={`py-1.5 font-mono ${
                          p.aMs > p.fMs * 1.1 ? 'font-semibold text-indigo-600' : 'text-stone-400'
                        }`}
                      >
                        {(p.aMs / Math.max(p.fMs, 0.0001)).toFixed(1)}×
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <strong>诚实提示：</strong>本项目为教学清晰起见，FP-Growth 的挖掘阶段采用
            「精确计数」而非经典的「条件 FP-tree 递归」，
            所以它的实际耗时未必总优于 Apriori（少扫库 ≠ 少计数）。
            <strong>但候选集规模的差距是真实的</strong> —— 而这正是算法复杂度差异的根源。
            工业界的高效实现会配合条件树把计数次数也降下来。
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onTweak}>
          回去调参数重新实验
        </Button>
      </div>
    </div>
  )
}