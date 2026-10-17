// ============================================================
// Apriori vs FP-Growth 对比 —— 用量化指标说清"快在哪"
// ============================================================
//
// 教学目标：不给结论，让学生从三个数字自己看出来——
//   ① 扫数据库遍数：Apriori 随项集长度增长，FP-Growth 恒为 1
//   ② 候选集规模：Apriori 要验证 C(n,1)+C(n,2)+…（组合爆炸）
//   ③ FP-tree 压缩比：原始交易被压成多少节点
// ============================================================

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import FpTreeView from '@/components/FpTreeView'
import { apriori, genCampusBasket, type Transaction } from '@/lib/apriori'
import {
  fpGrowth,
  aprioriPassCount,
  aprioriCandidateCount,
} from '@/lib/fpgrowth'
import SliderRow from '@/components/SliderRow'

/** 实测两种算法的耗时（各跑几次取平均，避免单次抖动） */
function measure(fn: () => void, times = 3): number {
  const t0 = performance.now()
  for (let i = 0; i < times; i++) fn()
  return (performance.now() - t0) / times
}

export default function FpgCompare({ transactions }: { transactions: Transaction[] }) {
  const [minSupport, setMinSupport] = useState(0.1)
  const [seed, setSeed] = useState(42)
  const [nTx, setNTx] = useState(500)
  const [highlight, setHighlight] = useState<string | null>(null)

  const data = useMemo(
    () => (transactions.length > 0 ? transactions : genCampusBasket(nTx, seed)),
    [transactions, nTx, seed],
  )

  const result = useMemo(() => {
    const a = apriori(data, minSupport)
    const f = fpGrowth(data, minSupport)

    // 一致性检查（顺便展示给学生看：两者答案必须一样）
    const keyOf = (items: string[]) => [...items].sort().join('|')
    const setA = new Set(a.frequentItemsets.map((x) => keyOf(x.items)))
    const setF = new Set(f.frequentItemsets.map((x) => keyOf(x.items)))
    const same = setA.size === setF.size && [...setA].every((k) => setF.has(k))

    const aPasses = aprioriPassCount(a.frequentItemsets)
    const nSingles = a.frequentItemsets.filter((x) => x.items.length === 1).length
    const maxLen = aPasses
    const aCandidates = aprioriCandidateCount(nSingles, maxLen)

    const tApriori = measure(() => apriori(data, minSupport))
    const tFp = measure(() => fpGrowth(data, minSupport))

    return {
      a,
      f,
      same,
      aPasses,
      fPasses: f.cost.fpTreePasses,
      aCandidates,
      fCounts: f.cost.countOperations,
      nSingles,
      maxLen,
      tApriori,
      tFp,
    }
  }, [data, minSupport])

  const rows = [
    {
      label: '扫描数据库遍数',
      apriori: `${result.aPasses} 遍`,
      fp: `${result.fPasses} 遍`,
      note: result.aPasses > 1 ? `Apriori 每挖一层就要重扫一次全库` : '本例项集较短，两者相同',
      better: result.fPasses < result.aPasses,
    },
    {
      label: '需要验证的候选集数量',
      apriori: `≈ ${result.aCandidates.toLocaleString()} 个`,
      fp: `${result.fCounts.toLocaleString()} 次计数`,
      note: `Apriori 要枚举 ${result.nSingles} 种商品的全部组合`,
      better: result.fCounts < result.aCandidates,
    },
    {
      label: '得到的频繁项集',
      apriori: `${result.a.frequentItemsets.length} 个`,
      fp: `${result.f.frequentItemsets.length} 个`,
      note: result.same ? '✅ 两者结果完全一致（算法正确）' : '⚠️ 结果不一致',
      better: result.same,
    },
    {
      label: '本机耗时',
      apriori: `${result.tApriori.toFixed(2)} ms`,
      fp: `${result.tFp.toFixed(2)} ms`,
      note:
        result.tApriori > result.tFp * 1.2
          ? `FP-Growth 快 ${(result.tApriori / Math.max(result.tFp, 0.001)).toFixed(1)} 倍`
          : '数据量小，差异不明显（试试增大交易数）',
      better: result.tFp < result.tApriori,
    },
  ]

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">为什么要发明 FP-Growth？</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-stone-600">
            两种算法挖出来的频繁项集<strong className="text-stone-800">完全一样</strong>
            —— 它们的区别不在结果，而在<strong className="text-stone-800">怎么找</strong>。
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-medium text-stone-500">Apriori 的做法</p>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
                一层一层地挖。第 1 层扫一遍数据库统计单品，生成第 2 层的候选，
                再扫一遍统计第 2 层…… 一直挖到最长的频繁项集。
              </p>
              <p className="mt-1.5 text-xs text-stone-500">
                痛点：每层都要重扫全库，且候选集按组合数增长，容易爆炸。
              </p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
              <p className="text-xs font-medium text-indigo-600">FP-Growth 的做法</p>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
                只扫<strong>一遍</strong>数据库，把所有交易压成一棵 FP-tree，
                之后所有挖掘都在这棵树上进行，一次都不再碰原始数据。
              </p>
              <p className="mt-1.5 text-xs text-stone-500">
                关键洞察：前缀相同的交易可以合并成一条路径，计数直接累加。
              </p>
            </div>
          </div>

          <SliderRow
            label="最小支持度"
            value={minSupport}
            min={0.02}
            max={0.5}
            step={0.01}
            onChange={(v) => setMinSupport(v)}
            format={(v) => `${(v * 100).toFixed(0)}%`}
          />

          {transactions.length === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SliderRow
                label="交易笔数"
                value={nTx}
                min={200}
                max={2000}
                step={100}
                onChange={setNTx}
                format={(v) => `${v} 笔`}
              />
              <SliderRow
                label="随机种子"
                value={seed}
                min={1}
                max={100}
                step={1}
                onChange={setSeed}
              />
            </div>
          )}

          <p className="text-xs text-stone-400">
            提示：把「交易笔数」调到 1000 以上、支持度调低，
            两者的候选集规模差异会非常明显。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">FP-tree 长什么样</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed text-stone-600">
            下面是当前数据按支持度 <strong className="text-stone-800">{(minSupport * 100).toFixed(0)}%</strong>{' '}
            剪枝后建出的 FP-tree。点节点名可以高亮它在表头表里的位置。
          </p>
          <FpTreeView tree={result.f.tree} highlight={highlight} />
          {result.f.tree.orderedItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-stone-500">表头表：</span>
              {result.f.tree.orderedItems.map((it) => (
                <button
                  key={it}
                  onClick={() => setHighlight(highlight === it ? null : it)}
                  className={`rounded px-2 py-0.5 text-xs transition-colors ${
                    highlight === it
                      ? 'bg-indigo-600 font-medium text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {it} : {result.f.tree.itemFreq.get(it)}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">两算法的代价对比</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="px-2 py-2 font-medium">对比项</th>
                  <th className="px-2 py-2 font-medium">Apriori</th>
                  <th className="px-2 py-2 font-medium">FP-Growth</th>
                  <th className="px-2 py-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-stone-100">
                    <td className="px-2 py-2.5 text-stone-700">{r.label}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 font-mono text-xs text-stone-600">
                      {r.apriori}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-2.5 font-mono text-xs ${
                        r.better ? 'font-semibold text-indigo-700' : 'text-stone-600'
                      }`}
                    >
                      {r.fp}
                      {r.better && <span className="ml-1 text-[10px]">← 更省</span>}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-stone-500">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg bg-stone-50 p-3">
            <p className="text-xs leading-relaxed text-stone-600">
              <strong className="text-stone-800">怎么理解这个对比：</strong>
              Apriori 慢在<strong>重复</strong>——同一批交易被扫了 {result.aPasses} 遍；
              FP-Growth 慢在<strong>枚举</strong>，但它只枚举那些已经证明频繁的项集。
              当数据量变大、支持度调低时，Apriori 的候选集会按组合数爆炸，
              而 FP-Growth 的增长要平缓得多 —— 这就是它在工业界被广泛采用的原因。
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">自底向上挖掘的每一步</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed text-stone-600">
            FP-Growth 从频繁单品出发，一层层往上加商品。
            每一轮都会有些候选因支持度不够被剪掉 —— 它们连同其所有扩展一起放弃
            （因为非频繁项集的超集一定非频繁）。
          </p>
          <div className="space-y-2">
            {result.f.steps.map((st) => (
              <div key={st.depth} className="rounded-lg border border-stone-200 p-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium text-stone-700">第 {st.depth + 1} 层</p>
                  <p className="text-xs text-stone-500">
                    本层新增 {st.found.length} 个频繁项集
                    {st.pruned.length > 0 && ` ·剪掉 ${st.pruned.length} 个`}
                  </p>
                </div>
                {st.found.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {st.found.map((x) => (
                      <span
                        key={x.items.join('|')}
                        className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-700"
                      >
                        {'{'}
                        {x.items.join(',')}
                        {'}'} : {x.support.toFixed(2)}
                      </span>
                    ))}
                  </div>
                )}
                {st.pruned.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {st.pruned.slice(0, 8).map((x) => (
                      <span
                        key={x.items.join('|')}
                        className="rounded bg-stone-100 px-2 py-0.5 font-mono text-xs text-stone-400 line-through"
                      >
                        {'{'}
                        {x.items.join(',')}
                        {'}'} : {x.count}
                      </span>
                    ))}
                    {st.pruned.length > 8 && (
                      <span className="text-xs text-stone-400">…还有 {st.pruned.length - 8} 个</span>
                    )}
                  </div>
                )}
                {st.found.length === 0 && st.pruned.length === 0 && (
                  <p className="mt-1.5 text-xs text-stone-400">本层没有需要考察的候选</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setHighlight(null)
            setMinSupport(0.1)
            setNTx(500)
            setSeed(42)
          }}
        >
          重置参数
        </Button>
      </div>
    </div>
  )
}