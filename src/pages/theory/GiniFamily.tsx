// 理论基础 · 子页签 3：GINI 与不纯度家族
// 复用 EntropyLab 的 GINI 对比小节，新增三曲线同图对比 + 选型建议
import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import { GiniSection } from '@/pages/EntropyLab'
import { binaryEntropy, giniBinary } from '@/lib/entropy'
import { ArrowRight } from 'lucide-react'
import type { PageId } from '@/App'

/** 误分类误差：1 − max(p, 1−p)。含义：直接按多数类"一刀切"分类，分错的比例 */
const misclassError = (p: number) => 1 - Math.max(p, 1 - p)

function ImpurityCurvesSection({ num }: { num: string }) {
  const [p, setP] = useState(0.5)
  const xs = useMemo(() => Array.from({ length: 201 }, (_, i) => i / 200), [])
  const entYs = useMemo(() => xs.map(binaryEntropy), [xs])
  const giniYs = useMemo(() => xs.map(giniBinary), [xs])
  const misYs = useMemo(() => xs.map(misclassError), [xs])

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">{num}. 不纯度家族同框：熵 vs GINI vs 误分类误差</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          衡量"一袋球有多混"其实有三把尺子：<b className="text-stone-700">熵</b>（信息论视角）、<b className="text-stone-700">GINI</b>（连摸两次不一致的概率）、
          <b className="text-stone-700">误分类误差</b> 1 − max pᵢ（直接押多数类会错的比例）。
          三条曲线都在 p = 0.5 处登顶、端点归零——所以选分裂时结论几乎一致，差别只在"中段有多弯"。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <CurveChart
            xs={xs}
            series={[
              { ys: entYs, color: '#4f46e5', label: 'Entropy 熵' },
              { ys: giniYs, color: '#f97316', label: 'GINI', dashed: true },
              { ys: misYs, color: '#059669', label: '误分类误差' },
            ]}
            markers={[{ x: p, color: '#dc2626' }]}
            xLabel="红球比例 p"
            xFormat={(v) => v.toFixed(1)}
            yMax={1}
            height={250}
          />
          <div className="space-y-4">
            <SliderRow label="红球比例 p" value={p} min={0} max={1} step={0.01} onChange={setP} format={(v) => v.toFixed(2)} />
            <div className="space-y-1.5 rounded-lg bg-stone-50 px-4 py-3 text-sm">
              <p className="flex justify-between">
                <span className="text-indigo-700">Entropy</span>
                <span className="font-mono font-semibold">{binaryEntropy(p).toFixed(4)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-orange-600">GINI</span>
                <span className="font-mono font-semibold">{giniBinary(p).toFixed(4)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-emerald-700">误分类误差</span>
                <span className="font-mono font-semibold">{misclassError(p).toFixed(4)}</span>
              </p>
              <p className="pt-1 text-xs leading-5 text-stone-500">
                误分类误差是条"折线"，中段增长慢——它对"已经过半的纯度改善"不敏感，所以决策树一般不用它选分裂，只用它给叶子定类别。
              </p>
            </div>
          </div>
        </div>
        <ThinkBox
          questions={[
            '把 p 从 0.5 拖到 0.7：三条曲线谁下降最慢？（误分类误差——它"反应迟钝"，不适合当分裂指标）',
            '三条曲线的最大值分别是多少？为什么比较它们时不能只看数值大小？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

export default function GiniFamily({ onNavigate }: { onNavigate?: (p: PageId, subTab?: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-stone-800">GINI 与不纯度家族</h2>
        <p className="mt-0.5 text-sm text-stone-500">三把"混不混"的尺子放在一起比一比，顺便回答"决策树到底选 gini 还是 entropy"。</p>
      </div>
      <GiniSection num="1" />
      <ImpurityCurvesSection num="2" />
      <Card className="border-indigo-200 bg-indigo-50/50 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-4 py-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-indigo-900">工程建议：选 gini 还是 entropy？</p>
            <p className="mt-1 text-sm leading-6 text-indigo-900/80">
              一句话：<b>默认用 gini 就够</b>——不用算对数、速度快，分裂结果和 entropy 九成九一致；
              只有在做信息论分析、或论文复现明确要求时才用 entropy。真正影响树形状的是最大深度、最小叶样本这些"刹车"参数。
            </p>
          </div>
          {onNavigate && (
            <Button variant="outline" size="sm" className="shrink-0 border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => onNavigate('tree', 'dtree')}>
              去"决策树逐步推演"切换 gini / entropy 对比
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
