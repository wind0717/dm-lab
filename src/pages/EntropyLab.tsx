// 模块一：熵 · 信息增益 · GINI（理论基础急救包）
import { useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import { binaryEntropy, giniBinary, entropyOfCounts, informationGain } from '@/lib/entropy'
import { gen1DTwoClass, type Pt1D } from '@/lib/datasets'
import { CLASS_COLORS } from '@/lib/cart'
import { RefreshCw } from 'lucide-react'

// ------------------------------------------------------------
// 第一节：摸球实验
// ------------------------------------------------------------
export function BallSection({ num = '1' }: { num?: string }) {
  const [p, setP] = useState(0.5)
  const xs = useMemo(() => Array.from({ length: 201 }, (_, i) => i / 200), [])
  const ys = useMemo(() => xs.map(binaryEntropy), [xs])
  const h = binaryEntropy(p)

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">{num}. 摸球实验：什么是"不确定性"？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          想象一个袋子，里面有红球和蓝球。如果袋子里的球<b className="text-stone-700">清一色</b>，你随手一摸就知道结果——不确定性为 0；
          如果红蓝<b className="text-stone-700">各占一半</b>，最难猜——不确定性最大。熵 H(p) 就是给这种"难猜程度"打分：
          <span className="ml-1 font-mono text-xs text-indigo-700">H(p) = -p·log₂p -(1-p)·log₂(1-p)</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <CurveChart
            xs={xs}
            series={[{ ys, color: '#4f46e5', label: 'H(p) 熵' }]}
            markers={[{ x: p, color: '#f97316', label: `H=${h.toFixed(3)}` }]}
            xLabel="红球比例 p"
            yLabel="bit"
            xFormat={(v) => v.toFixed(1)}
            yMax={1}
            height={240}
          />
          <div className="space-y-4">
            <SliderRow label="红球比例 p" value={p} min={0} max={1} step={0.01} onChange={setP} format={(v) => v.toFixed(2)} />
            {/* 袋子可视化 */}
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="mb-2 text-xs text-stone-500">袋子里的球（示意 20 个）</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 20 }, (_, i) => (
                  <span
                    key={i}
                    className="h-4 w-4 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: i < Math.round(p * 20) ? '#ef4444' : '#3b82f6' }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
              当前熵：<b className="font-mono text-base">{h.toFixed(4)}</b> bit
              <p className="mt-1 text-xs text-indigo-700/80">袋子越纯，熵越低；各占一半时熵最大（=1）。</p>
            </div>
          </div>
        </div>
        <ThinkBox
          questions={[
            '把 p 拖到 0 或 1，熵是多少？这对应袋子里什么情况？',
            'p = 0.5 时熵达到最大。为什么"一半一半"是最不确定的？',
            '如果袋子里有红、蓝、绿三种球，你觉得熵最大会出现在什么比例？（提示：1/3、1/3、1/3）',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// 第二节：分裂点拖动
// ------------------------------------------------------------
const AXIS_W = 560
const AXIS_H = 120

export function SplitSection({ num = '2' }: { num?: string }) {
  const [pts, setPts] = useState<Pt1D[]>(() => gen1DTwoClass(30))
  const [split, setSplit] = useState(50)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const xToPx = (x: number) => 30 + (x / 100) * (AXIS_W - 60)

  // 当前分裂的统计量
  const stats = useMemo(() => {
    const parent = [0, 0]
    const left = [0, 0]
    const right = [0, 0]
    for (const pt of pts) {
      parent[pt.label]++
      if (pt.x <= split) left[pt.label]++
      else right[pt.label]++
    }
    const hParent = entropyOfCounts(parent)
    const hLeft = entropyOfCounts(left)
    const hRight = entropyOfCounts(right)
    const n = pts.length
    const weighted = ((left[0] + left[1]) / n) * hLeft + ((right[0] + right[1]) / n) * hRight
    return { parent, left, right, hParent, hLeft, hRight, weighted, gain: hParent - weighted }
  }, [pts, split])

  // 分裂点位置 → 信息增益 曲线
  const gainCurve = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    const parent = [0, 0]
    pts.forEach((pt) => parent[pt.label]++)
    for (let t = 2; t <= 98; t += 1) {
      const left = [0, 0]
      const right = [0, 0]
      for (const pt of pts) {
        if (pt.x <= t) left[pt.label]++
        else right[pt.label]++
      }
      xs.push(t)
      ys.push(informationGain(parent, left, right, entropyOfCounts))
    }
    return { xs, ys }
  }, [pts])

  const bestSplit = useMemo(() => {
    let bi = 0
    gainCurve.ys.forEach((g, i) => {
      if (g > gainCurve.ys[bi]) bi = i
    })
    return { x: gainCurve.xs[bi], gain: gainCurve.ys[bi] }
  }, [gainCurve])

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current && e.type !== 'pointerdown') return
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left - 30) / (AXIS_W - 60)) * 100
    setSplit(Math.min(98, Math.max(2, x)))
  }

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">{num}. 分裂点拖动：信息增益是怎么算出来的？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          数轴上散落着 A（橙）、B（蓝）两类样本。<b className="text-stone-700">拖动竖线</b>选择一个分裂点：
          左边一堆、右边一堆。好的分裂让两边都"更纯"，信息增益 = 父节点熵 − 左右加权平均熵，越大越好。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start gap-6">
          {/* 一维数轴 */}
          <div>
            <svg
              ref={svgRef}
              width={AXIS_W}
              height={AXIS_H}
              className="cursor-ew-resize touch-none select-none rounded-lg border border-stone-200 bg-white"
              onPointerDown={(e) => {
                dragging.current = true
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                onPointer(e)
              }}
              onPointerMove={onPointer}
              onPointerUp={() => (dragging.current = false)}
              onPointerLeave={() => (dragging.current = false)}
            >
              {/* 数轴 */}
              <line x1={30} x2={AXIS_W - 30} y1={70} y2={70} stroke="#a8a29e" strokeWidth={1.5} />
              {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                  <line x1={xToPx(v)} x2={xToPx(v)} y1={66} y2={74} stroke="#a8a29e" />
                  <text x={xToPx(v)} y={88} textAnchor="middle" fontSize={10} fill="#78716c">
                    {v}
                  </text>
                </g>
              ))}
              {/* 数据点（上下交替错开避免重叠） */}
              {pts.map((pt, i) => (
                <circle
                  key={i}
                  cx={xToPx(pt.x)}
                  cy={52 - (i % 3) * 10}
                  r={5}
                  fill={CLASS_COLORS[pt.label]}
                  fillOpacity={0.9}
                  stroke="#fff"
                  strokeWidth={1}
                />
              ))}
              {/* 分裂竖线 */}
              <line x1={xToPx(split)} x2={xToPx(split)} y1={10} y2={100} stroke="#4f46e5" strokeWidth={2.5} />
              <circle cx={xToPx(split)} cy={14} r={7} fill="#4f46e5" stroke="#fff" strokeWidth={2} />
              <text x={xToPx(split)} y={112} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#4f46e5">
                分裂点 {split.toFixed(0)}
              </text>
            </svg>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setPts(gen1DTwoClass(30))
                setSplit(50)
              }}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              换一批数据
            </Button>
          </div>

          {/* 实时统计 */}
          <div className="min-w-[240px] flex-1 space-y-2 text-sm">
            <StatRow label="父节点熵 H(全部)" value={stats.hParent} detail={`A:${stats.parent[0]} B:${stats.parent[1]}`} />
            <StatRow label="左子集熵 H(左)" value={stats.hLeft} detail={`A:${stats.left[0]} B:${stats.left[1]}`} />
            <StatRow label="右子集熵 H(右)" value={stats.hRight} detail={`A:${stats.right[0]} B:${stats.right[1]}`} />
            <StatRow label="加权平均熵" value={stats.weighted} detail="按左右样本数加权" />
            <div className="rounded-lg bg-orange-50 px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-orange-800">信息增益 Gain</span>
                <span className="font-mono text-lg font-bold text-orange-600">{stats.gain.toFixed(4)}</span>
              </div>
              <p className="mt-0.5 text-xs text-orange-700/80">
                = {stats.hParent.toFixed(3)} − {stats.weighted.toFixed(3)}，最优分裂点在 x = {bestSplit.x.toFixed(0)}（增益 {bestSplit.gain.toFixed(3)}）
              </p>
            </div>
          </div>
        </div>

        {/* 增益曲线 */}
        <CurveChart
          xs={gainCurve.xs}
          series={[{ ys: gainCurve.ys, color: '#f97316', label: '信息增益' }]}
          markers={[
            { x: split, color: '#4f46e5', label: '你选的' },
            { x: bestSplit.x, color: '#059669', label: '最优' },
          ]}
          xLabel="分裂点位置 x"
          yLabel="Gain"
          xFormat={(v) => v.toFixed(0)}
          height={200}
        />
        <ThinkBox
          questions={[
            '把分裂点拖到最左端（或最右端），信息增益是多少？为什么接近 0？',
            '增益曲线最高点的位置，和两类点的"交界地带"有什么关系？',
            '点"换一批数据"，最优分裂点会变吗？如果两类点混得很厉害，最大增益会变大还是变小？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

function StatRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="flex items-baseline justify-between rounded-lg bg-stone-50 px-4 py-2">
      <span className="text-stone-600">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-xs text-stone-400">{detail}</span>
        <span className="font-mono font-semibold text-stone-800">{value.toFixed(4)}</span>
      </span>
    </div>
  )
}

// ------------------------------------------------------------
// 第三节：GINI 对比
// ------------------------------------------------------------
export function GiniSection({ num = '3' }: { num?: string }) {
  const [p, setP] = useState(0.5)
  const xs = useMemo(() => Array.from({ length: 201 }, (_, i) => i / 200), [])
  const entYs = useMemo(() => xs.map(binaryEntropy), [xs])
  const giniYs = useMemo(() => xs.map(giniBinary), [xs])

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">{num}. GINI 系数：熵的"平替"？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          基尼系数 Gini(p) = 1 − p² − (1−p)²，含义是"连摸两个球、结果不一样的概率"。
          它不用算对数，计算更快，形状和熵曲线几乎一样——所以决策树用哪个，结论通常一致。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <CurveChart
            xs={xs}
            series={[
              { ys: entYs, color: '#4f46e5', label: 'Entropy 熵' },
              { ys: giniYs, color: '#f97316', label: 'Gini 基尼', dashed: true },
            ]}
            markers={[{ x: p, color: '#059669' }]}
            xLabel="红球比例 p"
            xFormat={(v) => v.toFixed(1)}
            yMax={1}
            height={240}
          />
          <div className="space-y-4">
            <SliderRow label="红球比例 p" value={p} min={0} max={1} step={0.01} onChange={setP} format={(v) => v.toFixed(2)} />
            <div className="space-y-2 rounded-lg bg-stone-50 px-4 py-3 text-sm">
              <p className="flex justify-between">
                <span className="text-indigo-700">Entropy</span>
                <span className="font-mono font-semibold">{binaryEntropy(p).toFixed(4)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-orange-600">Gini</span>
                <span className="font-mono font-semibold">{giniBinary(p).toFixed(4)}</span>
              </p>
              <p className="pt-1 text-xs leading-5 text-stone-500">
                注意两者最大值不同（熵=1，Gini=0.5），但<b>最高点都在 p=0.5</b>，形状相似、结论通常一致。
              </p>
            </div>
          </div>
        </div>
        <ThinkBox
          questions={[
            '两条曲线在哪些 p 值上相等？（提示：端点和中点）',
            '既然结论差不多，为什么工程上更爱用 Gini？（想想 log 的计算成本）',
            '下一个模块里，试着用两种指标各训一棵树，看看分裂顺序会不会不一样。',
          ]}
        />
      </CardContent>
    </Card>
  )
}

export default function EntropyLab() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">模块一 · 理论基础急救包</h1>
        <p className="mt-1 text-sm text-stone-500">
          熵、信息增益、基尼系数是决策树的"数学引擎"。这一模块不写代码，只用三个小实验建立直觉。
        </p>
      </div>
      <BallSection />
      <SplitSection />
      <GiniSection />
    </div>
  )
}
