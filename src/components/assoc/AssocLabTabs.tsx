// ============================================================
// 关联规则实验区 —— 标签式（原理 / 演示 / 对比）
// ============================================================
//
// 设计目标：以「让学生充分理解」为第一优先，所以做了三件事：
//
//  1. **原理屏**：先把算法讲透再演示。学生最容易犯的错是「会用不会算」，
//     所以每屏都有：生活类比 → 形式化定义 → 一句话核心洞察 → 常见误区。
//
//  2. **演示屏**：两种算法各自独立的逐步动画。关键设计是
//     「���剪的东西要看得见」——不只是显示挖出了什么，
//     更要显示哪些候选被剪掉了、为什么（支持度反单调）。
//
//  3. **对比屏**：把「凭什么 FP-Growth 更快」变成可测量的数字，
//     而不是让学生背结论。
//
// 参数统一放在顶部，学生调一次、两个算法同步生效，便于对照。
// ============================================================

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GitBranch, PlayCircle, Scale } from 'lucide-react'
import SliderRow from '@/components/SliderRow'
import { apriori, genCampusBasket, type Transaction } from '@/lib/apriori'
import { fpGrowth, aprioriPassCount } from '@/lib/fpgrowth'
import AlgPrinciple from './AlgPrinciple'
import AlgWalkthrough from './AlgWalkthrough'
import AlgBenchmark from './AlgBenchmark'

type ViewId = 'principle' | 'demo' | 'bench'

const VIEWS: { id: ViewId; label: string; icon: typeof GitBranch; hint: string }[] = [
  { id: 'principle', label: '算法原理', icon: GitBranch, hint: '先讲透原理再看演示' },
  { id: 'demo', label: '逐步演示', icon: PlayCircle, hint: '一步一步看算法怎么跑' },
  { id: 'bench', label: '性能对比', icon: Scale, hint: '量化两种算法的代价' },
]

interface Props {
  /** 学生上传/编辑的交易数据；为空时用内置生成数据 */
  transactions: Transaction[]
}

export default function AssocLabTabs({ transactions }: Props) {
  const [view, setView] = useState<ViewId>('principle')

  // ---- 全局参数（两种算法共用，便于对照）----
  const [minSupport, setMinSupport] = useState(0.12)
  const [minConf, setMinConf] = useState(0.5)
  const [nTx, setNTx] = useState(400)
  const [seed, setSeed] = useState(42)

  // 优先用学生的数据；没有就用内置生成的
  const usingCustom = transactions.length > 0
  const data = useMemo(
    () => (usingCustom ? transactions : genCampusBasket(nTx, seed)),
    [usingCustom, transactions, nTx, seed],
  )

  // 两种算法的结果（同一份数据、同一组参数）
  const results = useMemo(() => {
    const a = apriori(data, minSupport)
    const f = fpGrowth(data, minSupport)
    // 一致性：两者必须挖出相同的频繁项集
    const keyOf = (items: string[]) => [...items].sort().join('|')
    const setA = new Set(a.frequentItemsets.map((x) => keyOf(x.items)))
    const setF = new Set(f.frequentItemsets.map((x) => keyOf(x.items)))
    const same = setA.size === setF.size && [...setA].every((k) => setF.has(k))
    return { a, f, same }
  }, [data, minSupport])

  return (
    <div className="space-y-5">
      {/* ================= 标签栏 ================= */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="关联分析视角">
        {VIEWS.map((v) => {
          const Icon = v.icon
          const on = view === v.id
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={on}
              data-testid={`assoc-view-${v.id}`}
              onClick={() => setView(v.id)}
              className={`group flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-all ${
                on
                  ? 'bg-indigo-600 font-medium text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Icon className={`h-4 w-4 ${on ? 'text-white' : 'text-stone-400 group-hover:text-stone-600'}`} />
              <span>{v.label}</span>
              {!on && <span className="hidden text-xs text-stone-400 sm:inline">· {v.hint}</span>}
            </button>
          )
        })}
      </div>

      {/* ================= 参数面板（常驻，三屏共用） ================= */}
      <Card className="border-stone-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="text-stone-800">实验参数</span>
            <span className="text-xs font-normal text-stone-400">
              {usingCustom ? '（正在使用你导入的交易数据）' : '（使用内置生成的购物篮）'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SliderRow
              label="最小支持度 minSupport"
              value={minSupport}
              min={0.02}
              max={0.6}
              step={0.01}
              onChange={setMinSupport}
              format={(v) => `${(v * 100).toFixed(0)}% · 至少 ${Math.ceil(v * data.length)} 笔`}
            />
            <SliderRow
              label="最小置信度 minConfidence"
              value={minConf}
              min={0.1}
              max={0.95}
              step={0.05}
              onChange={setMinConf}
              format={(v) => `${(v * 100).toFixed(0)}%`}
            />
          </div>

          {!usingCustom && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SliderRow
                label="交易笔数"
                value={nTx}
                min={200}
                max={3000}
                step={100}
                onChange={setNTx}
                format={(v) => `${v} 笔`}
              />
              <SliderRow label="随机种子" value={seed} min={1} max={100} step={1} onChange={setSeed} />
            </div>
          )}

          {/* 参数影响的即时反馈，让学生知道调了什么 */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
            <span>当前效果：</span>
            <span className="rounded bg-white px-2 py-0.5 font-mono">
              挖出 {results.a.frequentItemsets.length} 个频繁项集
            </span>
            <span className="rounded bg-white px-2 py-0.5 font-mono">
              最长 {aprioriPassCount(results.a.frequentItemsets)} 项
            </span>
            <span
              className={`rounded px-2 py-0.5 font-medium ${
                results.same ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {results.same ? '✓ 两种算法结果一致' : '⚠ 结果不一致（异常）'}
            </span>
          </div>

          {!usingCustom && (
            <p className="text-xs leading-relaxed text-stone-400">
              试试把交易笔数调到 2000 以上、支持度调到 5% 以下 ——
              此时 Apriori 的候选集数量会急剧膨胀，而 FP-Growth 依然稳定。
              这是理解两者差距最快的方式。
            </p>
          )}
        </CardContent>
      </Card>

      {/* ================= 各屏内容 ================= */}
      {view === 'principle' && (
        <AlgPrinciple
          minCount={results.a.minCount}
          nTrans={data.length}
          onGoDemo={() => setView('demo')}
        />
      )}

      {view === 'demo' && (
        <AlgWalkthrough
          transactions={data}
          minSupport={minSupport}
          minConf={minConf}
          aprioriResult={results.a}
          fpResult={results.f}
        />
      )}

      {view === 'bench' && (
        <AlgBenchmark
          transactions={data}
          minSupport={minSupport}
          aprioriResult={results.a}
          fpResult={results.f}
          onTweak={() => setView('principle')}
        />
      )}

      {/* 备用重置入口：参数调乱了让学生一键还原 */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-stone-400 hover:text-stone-600"
          onClick={() => {
            setMinSupport(0.12)
            setMinConf(0.5)
            setNTx(400)
            setSeed(42)
          }}
        >
          恢复默认参数
        </Button>
      </div>
    </div>
  )
}