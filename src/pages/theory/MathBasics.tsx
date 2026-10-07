// 理论基础 · 子页签 1：数学基础急救包
// 四个交互小节：概率与统计直觉 / 向量与高维空间 / 距离度量对比 / 矩阵与表格的对应
// 设计原则：先生活类比 → 再直觉图形 → 最后才是公式（公式用 HTML 排版）
import { useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import { Dices, RotateCcw, ArrowRight } from 'lucide-react'
import { bayesPosterior, bayesGrid, genCovPreset, covariance, pearson, linearFit, type CovPreset, type Pt } from '@/lib/theoryMath'
import type { PageId } from '@/App'

/** 页内统一导航类型（可带子页签深链） */
type Nav = (p: PageId, subTab?: string) => void

// ============================================================
// ① 概率与统计直觉
// ============================================================

/** 掷硬币：抽样 n 次，看频率收敛到概率 p（大数定律） */
function CoinSection() {
  const [p, setP] = useState(0.5)
  const [n, setN] = useState(100)
  const [curve, setCurve] = useState<number[] | null>(null)
  const [runs, setRuns] = useState(0)

  const sample = () => {
    let heads = 0
    const ys: number[] = []
    for (let i = 1; i <= n; i++) {
      if (Math.random() < p) heads++
      ys.push(heads / i)
    }
    setCurve(ys)
    setRuns((r) => r + 1)
  }

  const xs = useMemo(() => (curve ? curve.map((_, i) => i + 1) : []), [curve])
  const finalFreq = curve ? curve[curve.length - 1] : null

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">1. 掷硬币：为什么"多试几次"就靠谱了？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          硬币正面朝上的<b className="text-stone-700">真实概率是 p</b>（你可以偷偷调它，模拟一枚"不公平"的硬币）。
          每抽一次样，就统计到目前为止的正面频率。只抽 10 次时频率可能跑偏很多；抽到 1000 次，
          频率几乎一定贴在 p 附近——这就是<b className="text-stone-700">大数定律</b>：试验次数越多，频率越接近真实概率。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-56">
            <SliderRow label="真实概率 p（正面朝上）" value={p} min={0.05} max={0.95} step={0.05} onChange={setP} format={(v) => v.toFixed(2)} />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1">
            {[10, 100, 1000].map((v) => (
              <button
                key={v}
                onClick={() => setN(v)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${n === v ? 'bg-indigo-600 font-medium text-white' : 'text-stone-600 hover:bg-stone-100'}`}
              >
                {v} 次
              </button>
            ))}
          </div>
          <Button onClick={sample} className="bg-indigo-600 hover:bg-indigo-700">
            <Dices className="mr-1 h-4 w-4" />
            抽样 {n} 次
          </Button>
          {finalFreq !== null && (
            <div className="rounded-lg bg-indigo-50 px-4 py-2 text-sm text-indigo-900">
              第 {runs} 次实验：最终频率 <b className="font-mono text-base">{finalFreq.toFixed(3)}</b>
              <span className="ml-1 text-xs text-indigo-700/80">（真值 p = {p.toFixed(2)}，误差 {Math.abs(finalFreq - p).toFixed(3)}）</span>
            </div>
          )}
        </div>
        {curve ? (
          <CurveChart
            xs={xs}
            series={[
              { ys: curve, color: '#4f46e5', label: '累计正面频率' },
              { ys: xs.map(() => p), color: '#a8a29e', label: '真实概率 p', dashed: true },
            ]}
            xLabel="抽样次数"
            yLabel="频率"
            xFormat={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0))}
            yMax={1}
            height={220}
            width={640}
          />
        ) : (
          <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500">
            点「抽样」开始实验。建议先用 10 次抽几把，看频率有多飘；再切到 1000 次，看曲线怎样被"焊"在 p 上。
          </p>
        )}
        <ThinkBox
          questions={[
            '抽样 10 次时，最终频率和 p 差得多吗？多抽几把，误差大致在什么范围晃悠？',
            '切到 1000 次后，曲线开头仍然剧烈摆动——为什么"前面抖、后面稳"？',
            '如果你只能抽 10 次就下结论（比如"这批产品合格率 90%"），大数定律提醒你什么风险？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

/** 正态分布：调 μ、σ 看钟形曲线与 68-95-99.7 区间 */
function NormalSection() {
  const [mu, setMu] = useState(75)
  const [sigma, setSigma] = useState(10)

  const W = 620
  const H = 240
  const PAD = { l: 10, r: 10, t: 26, b: 30 }
  const xmin = mu - 4 * sigma
  const xmax = mu + 4 * sigma
  const pdf = (x: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI))
  const ymax = pdf(mu) * 1.15

  const sx = (x: number) => PAD.l + ((x - xmin) / (xmax - xmin)) * (W - PAD.l - PAD.r)
  const sy = (y: number) => PAD.t + (1 - y / ymax) * (H - PAD.t - PAD.b)

  const curvePath = useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i <= 200; i++) {
      const x = xmin + ((xmax - xmin) * i) / 200
      pts.push(`${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(pdf(x)).toFixed(1)}`)
    }
    return pts.join(' ')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mu, sigma])

  const band = (k: number, color: string) => {
    const a = mu - k * sigma
    const b = mu + k * sigma
    const pts: string[] = [`M${sx(a).toFixed(1)},${sy(0).toFixed(1)}`]
    for (let i = 0; i <= 60; i++) {
      const x = a + ((b - a) * i) / 60
      pts.push(`L${sx(x).toFixed(1)},${sy(pdf(x)).toFixed(1)}`)
    }
    pts.push(`L${sx(b).toFixed(1)},${sy(0).toFixed(1)} Z`)
    return <path key={k} d={pts.join(' ')} fill={color} />
  }

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">2. 正态分布：考试成绩的"钟形曲线"</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          一个班的考试成绩往往是这样：<b className="text-stone-700">大多数人挤在平均分附近，特别好和特别差的都很少</b>。
          μ（均值）决定钟的中心在哪，σ（标准差）决定钟有多"胖"。经验法则：约 <b className="text-indigo-700">68%</b> 的人落在 μ±σ 内，
          <b className="text-indigo-700">95%</b> 在 μ±2σ 内，<b className="text-indigo-700">99.7%</b> 在 μ±3σ 内。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-[1fr_240px]">
          <svg width={W} height={H} className="max-w-full rounded-lg border border-stone-200 bg-white">
            {band(3, '#e0e7ff')}
            {band(2, '#c7d2fe')}
            {band(1, '#a5b4fc')}
            <path d={curvePath} fill="none" stroke="#4f46e5" strokeWidth={2.5} />
            <line x1={sx(mu)} x2={sx(mu)} y1={sy(0)} y2={sy(pdf(mu))} stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={sx(mu)} y={H - 8} textAnchor="middle" fontSize={11} fill="#f97316" fontWeight={600}>
              μ = {mu} 分
            </text>
            {[
              { k: 1, pct: '68%', color: '#4338ca' },
              { k: 2, pct: '95%', color: '#6366f1' },
              { k: 3, pct: '99.7%', color: '#818cf8' },
            ].map((b, i) => (
              <text key={b.k} x={sx(mu + b.k * sigma * 0.9)} y={PAD.t + 4 + i * 14} fontSize={10.5} fill={b.color} fontWeight={600}>
                μ±{b.k}σ：{b.pct}
              </text>
            ))}
            {[mu - 3 * sigma, mu - 2 * sigma, mu - sigma, mu + sigma, mu + 2 * sigma, mu + 3 * sigma].map((x) => (
              <text key={x} x={sx(x)} y={H - 8} textAnchor="middle" fontSize={9.5} fill="#a8a29e">
                {x.toFixed(0)}
              </text>
            ))}
          </svg>
          <div className="space-y-4">
            <SliderRow label="平均分 μ" value={mu} min={50} max={95} step={1} onChange={setMu} format={(v) => `${v} 分`} />
            <SliderRow label="标准差 σ（离散程度）" value={sigma} min={2} max={20} step={1} onChange={setSigma} format={(v) => `±${v} 分`} />
            <div className="space-y-1.5 rounded-lg bg-stone-50 px-4 py-3 text-xs leading-5 text-stone-600">
              <p>· 约 68% 的同学在 <b className="font-mono text-indigo-700">{(mu - sigma).toFixed(0)} ~ {(mu + sigma).toFixed(0)}</b> 分</p>
              <p>· 约 95% 的同学在 <b className="font-mono text-indigo-700">{(mu - 2 * sigma).toFixed(0)} ~ {(mu + 2 * sigma).toFixed(0)}</b> 分</p>
              <p>· 超出 μ±3σ（{mu - 3 * sigma < 0 ? 0 : (mu - 3 * sigma).toFixed(0)} ~ {(mu + 3 * sigma).toFixed(0)} 分之外）的不到 0.3%——"离群"得厉害，值得怀疑</p>
            </div>
          </div>
        </div>
        <p className="rounded-lg bg-stone-50 px-4 py-2.5 text-xs text-stone-500">
          公式（看一眼就好）：钟形曲线的高度由 <span className="font-mono text-indigo-700">f(x) = (1/(σ√2π))·e^(−(x−μ)²/2σ²)</span> 决定——你只需要记住形状和 68-95-99.7。
        </p>
        <ThinkBox
          questions={[
            '把 σ 从 10 调到 3：曲线变"瘦"了。这对应一个什么样的班级？（提示：大家分数都差不多）',
            'Z-score 异常值法则就是"超出 μ±3σ 算异常"。根据 99.7% 法则，被误伤的正常样本大约占多少？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

/** 均值 / 中位数 / 标准差：拖动成绩点，看均值被极端值"拖走" */
function MeanMedianSection() {
  const INIT = [62, 68, 70, 72, 74, 75, 76, 78, 80, 85]
  const [scores, setScores] = useState<number[]>(INIT)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragIdx = useRef(-1)

  const W = 620
  const xToPx = (v: number) => 30 + (v / 100) * (W - 60)

  const stats = useMemo(() => {
    const sorted = [...scores].sort((a, b) => a - b)
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    const median = sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) * (b - mean), 0) / scores.length)
    return { mean, median, std }
  }, [scores])

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragIdx.current < 0) return
    const rect = svgRef.current!.getBoundingClientRect()
    const v = ((e.clientX - rect.left - 30) / (W - 60)) * 100
    const val = Math.min(100, Math.max(0, Math.round(v)))
    setScores((s) => s.map((x, i) => (i === dragIdx.current ? val : x)))
  }

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">3. 均值、中位数与"极端值的破坏力"</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          10 位同学的成绩排在数轴上，<b className="text-stone-700">拖动任何一个圆点</b>试试。
          均值像"跷跷板的支点"，每个点都在拉它；中位数只数"我左边几个、右边几个"，不在乎你跑多远。
          把一个分数拖成 100 分：<b className="text-orange-600">均值明显被拉高，中位数纹丝不动</b>——这就是"均值怕极端值"。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-[1fr_240px]">
          <div>
            <svg
              ref={svgRef}
              width={W}
              height={150}
              className="max-w-full cursor-ew-resize touch-none select-none rounded-lg border border-stone-200 bg-white"
              onPointerMove={onPointer}
              onPointerUp={() => (dragIdx.current = -1)}
              onPointerLeave={() => (dragIdx.current = -1)}
            >
              <line x1={30} x2={W - 30} y1={80} y2={80} stroke="#a8a29e" strokeWidth={1.5} />
              {[0, 20, 40, 60, 80, 100].map((v) => (
                <g key={v}>
                  <line x1={xToPx(v)} x2={xToPx(v)} y1={76} y2={84} stroke="#a8a29e" />
                  <text x={xToPx(v)} y={98} textAnchor="middle" fontSize={10} fill="#78716c">
                    {v}
                  </text>
                </g>
              ))}
              {/* 均值 / 中位数标记 */}
              <g>
                <polygon points={`${xToPx(stats.mean)},52 ${xToPx(stats.mean) - 6},40 ${xToPx(stats.mean) + 6},40`} fill="#f97316" />
                <text x={xToPx(stats.mean)} y={34} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#f97316">
                  均值 {stats.mean.toFixed(1)}
                </text>
              </g>
              <g>
                <polygon points={`${xToPx(stats.median)},108 ${xToPx(stats.median) - 6},120 ${xToPx(stats.median) + 6},120`} fill="#4f46e5" />
                <text x={xToPx(stats.median)} y={134} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#4f46e5">
                  中位数 {stats.median.toFixed(1)}
                </text>
              </g>
              {/* 成绩点 */}
              {scores.map((v, i) => (
                <circle
                  key={i}
                  cx={xToPx(v)}
                  cy={80 - (i % 3) * 12 - 8}
                  r={8}
                  fill={v >= 95 ? '#ef4444' : '#4f46e5'}
                  fillOpacity={0.85}
                  stroke="#fff"
                  strokeWidth={2}
                  className="cursor-grab"
                  onPointerDown={(e) => {
                    dragIdx.current = i
                    ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  }}
                >
                  <title>{v} 分（拖动我）</title>
                </circle>
              ))}
            </svg>
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const minIdx = scores.indexOf(Math.min(...scores))
                  setScores((s) => s.map((x, i) => (i === minIdx ? 100 : x)))
                }}
              >
                把最低分改成 100 分（制造极端值）
              </Button>
              <Button variant="outline" size="sm" onClick={() => setScores(INIT)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                重置
              </Button>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {[
              { label: '均值（平均成绩）', value: stats.mean, color: 'text-orange-600', tip: '每个点都在"拉"它' },
              { label: '中位数（中间那个人）', value: stats.median, color: 'text-indigo-700', tip: '只数左右各几个' },
              { label: '标准差（离散程度）', value: stats.std, color: 'text-stone-700', tip: '越大越参差不齐' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-stone-50 px-4 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-stone-600">{s.label}</span>
                  <span className={`font-mono text-lg font-bold ${s.color}`}>{s.value.toFixed(2)}</span>
                </div>
                <p className="text-xs text-stone-400">{s.tip}</p>
              </div>
            ))}
            <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-800">
              预处理伏笔：遇到 99999 这种极端值时，用中位数填充比用均值靠谱——后面的「数据预处理」模块会用到这一点。
            </p>
          </div>
        </div>
        <ThinkBox
          questions={[
            '制造一个极端高分后，均值和中位数谁动得多？如果把极端值改成 0 分呢？',
            '一个村 9 户年收入 8 万、1 户 800 万，"平均年收入"能代表这个村吗？该用哪个指标汇报？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// ② 向量与高维空间
// ============================================================

/** 二维向量：拖动端点，看点积 / 余弦相似度 / 欧氏距离 / 夹角 */
function VectorSection() {
  // 坐标系：x ∈ [0,10]，y ∈ [0,6]，原点在左下
  const [a, setA] = useState({ x: 7, y: 4 })
  const [b, setB] = useState({ x: 3, y: 5 })
  const svgRef = useRef<SVGSVGElement>(null)
  const dragVec = useRef<'a' | 'b' | null>(null)

  const W = 460
  const H = 300
  const xToPx = (x: number) => 36 + (x / 10) * (W - 56)
  const yToPx = (y: number) => H - 30 - (y / 6) * (H - 56)

  const dot = a.x * b.x + a.y * b.y
  const na = Math.hypot(a.x, a.y)
  const nb = Math.hypot(b.x, b.y)
  const cos = na * nb > 0 ? dot / (na * nb) : 0
  const angleDeg = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
  const euclid = Math.hypot(a.x - b.x, a.y - b.y)

  // 夹角弧（原点处，从 a 扫到 b）
  const angA = Math.atan2(a.y, a.x)
  const angB = Math.atan2(b.y, b.x)
  const rArc = 34
  const arcStart = { x: xToPx(0) + rArc * Math.cos(angA), y: yToPx(0) - rArc * Math.sin(angA) }
  const arcEnd = { x: xToPx(0) + rArc * Math.cos(angB), y: yToPx(0) - rArc * Math.sin(angB) }
  const sweep = angB > angA ? 0 : 1 // y 轴向下翻转

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragVec.current) return
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left - 36) / (W - 56)) * 10
    const y = ((H - 30 - (e.clientY - rect.top)) / (H - 56)) * 6
    const v = { x: +Math.min(10, Math.max(0.2, x)).toFixed(1), y: +Math.min(6, Math.max(0.2, y)).toFixed(1) }
    if (dragVec.current === 'a') setA(v)
    else setB(v)
  }

  const vecLine = (v: { x: number; y: number }, color: string, label: string) => (
    <g>
      <line x1={xToPx(0)} y1={yToPx(0)} x2={xToPx(v.x)} y2={yToPx(v.y)} stroke={color} strokeWidth={2.5} />
      <polygon
        points={`${xToPx(v.x)},${yToPx(v.y)} ${xToPx(v.x) - 7},${yToPx(v.y) - 3} ${xToPx(v.x) - 3},${yToPx(v.y) + 7}`}
        fill={color}
        opacity={0.9}
      />
      <circle
        cx={xToPx(v.x)}
        cy={yToPx(v.y)}
        r={9}
        fill={color}
        stroke="#fff"
        strokeWidth={2}
        className="cursor-grab"
        onPointerDown={(e) => {
          dragVec.current = label === 'a' ? 'a' : 'b'
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
        }}
      >
        <title>拖动改变向量 {label}</title>
      </circle>
      <text x={xToPx(v.x) + 12} y={yToPx(v.y) - 4} fontSize={12} fontWeight={700} fill={color}>
        {label}({v.x.toFixed(1)}, {v.y.toFixed(1)})
      </text>
    </g>
  )

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">4. 向量：把"一个方向 + 一个长度"当成一个数对</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          向量 a = (7, 4) 不过是"往右走 7、往上走 4"。<b className="text-stone-700">拖动两个端点</b>，看三个重要量的变化：
          <b className="text-stone-700">点积</b> a·b = a₁b₁ + a₂b₂（方向越一致越大）、
          <b className="text-stone-700">余弦相似度</b> cosθ = a·b / (|a||b|)（1 = 完全同向，0 = 垂直，−1 = 背道而驰）、
          <b className="text-stone-700">欧氏距离</b>（两个端点间的直线距离）。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-[460px_1fr]">
          <svg
            ref={svgRef}
            width={W}
            height={H}
            className="max-w-full touch-none select-none rounded-lg border border-stone-200 bg-white"
            onPointerMove={onPointer}
            onPointerUp={() => (dragVec.current = null)}
            onPointerLeave={() => (dragVec.current = null)}
          >
            {/* 网格 */}
            {Array.from({ length: 10 }, (_, i) => (
              <line key={`v${i}`} x1={xToPx(i + 1)} x2={xToPx(i + 1)} y1={yToPx(0)} y2={yToPx(6)} stroke="#f5f5f4" />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`h${i}`} x1={xToPx(0)} x2={xToPx(10)} y1={yToPx(i + 1)} y2={yToPx(i + 1)} stroke="#f5f5f4" />
            ))}
            <line x1={xToPx(0)} x2={xToPx(10)} y1={yToPx(0)} y2={yToPx(0)} stroke="#a8a29e" strokeWidth={1.5} />
            <line x1={xToPx(0)} x2={xToPx(0)} y1={yToPx(0)} y2={yToPx(6)} stroke="#a8a29e" strokeWidth={1.5} />
            {/* 端点间距离虚线 */}
            <line x1={xToPx(a.x)} y1={yToPx(a.y)} x2={xToPx(b.x)} y2={yToPx(b.y)} stroke="#059669" strokeWidth={1.5} strokeDasharray="5 4" />
            {/* 夹角弧 */}
            <path
              d={`M${arcStart.x.toFixed(1)},${arcStart.y.toFixed(1)} A${rArc},${rArc} 0 0 ${sweep} ${arcEnd.x.toFixed(1)},${arcEnd.y.toFixed(1)}`}
              fill="none"
              stroke="#f97316"
              strokeWidth={2}
            />
            <text x={xToPx(0) + 44} y={yToPx(0) - 10} fontSize={10.5} fill="#f97316" fontWeight={600}>
              θ = {angleDeg.toFixed(0)}°
            </text>
            {vecLine(a, '#4f46e5', 'a')}
            {vecLine(b, '#f97316', 'b')}
          </svg>
          <div className="space-y-2 text-sm">
            {[
              { label: '点积 a·b', value: dot, fmt: (v: number) => v.toFixed(1), tip: `${a.x.toFixed(1)}×${b.x.toFixed(1)} + ${a.y.toFixed(1)}×${b.y.toFixed(1)}`, color: 'text-stone-800' },
              { label: '余弦相似度 cosθ', value: cos, fmt: (v: number) => v.toFixed(3), tip: '−1 ~ 1，只管方向不管长短', color: 'text-indigo-700' },
              { label: '夹角 θ', value: angleDeg, fmt: (v: number) => `${v.toFixed(0)}°`, tip: '两条箭头的张开程度', color: 'text-orange-600' },
              { label: '欧氏距离 |a−b|', value: euclid, fmt: (v: number) => v.toFixed(2), tip: '绿色虚线的长度', color: 'text-emerald-700' },
            ].map((s) => (
              <div key={s.label} className="flex items-baseline justify-between rounded-lg bg-stone-50 px-4 py-2">
                <span className="text-stone-600">{s.label}</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-xs text-stone-400">{s.tip}</span>
                  <span className={`font-mono font-semibold ${s.color}`}>{s.fmt(s.value)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <ThinkBox
          questions={[
            '把 b 拖到和 a 同一个方向（但更长）：余弦相似度是多少？欧氏距离是多少？——"相似"和"离得近"是两回事。',
            '让两个向量垂直（θ≈90°），点积是多少？这就是为什么 cosθ = 0 表示"毫不相关"。',
          ]}
        />
      </CardContent>
    </Card>
  )
}

/** 每门课一个维度：两个学生的 5 维成绩向量算余弦相似度 */
const COURSES = ['会计学', '审计学', '统计学', '英语', '体育']
const PRESETS: Record<string, { a: number[]; b: number[] }> = {
  口味相同: { a: [90, 85, 62, 70, 65], b: [88, 87, 60, 72, 63] },
  甲爱专业乙爱文体: { a: [95, 92, 88, 60, 55], b: [60, 58, 55, 90, 95] },
}

function CourseSimSection() {
  const [sa, setSa] = useState(PRESETS.口味相同.a)
  const [sb, setSb] = useState(PRESETS.口味相同.b)

  const dot = sa.reduce((s, v, i) => s + v * sb[i], 0)
  const na = Math.sqrt(sa.reduce((s, v) => s + v * v, 0))
  const nb = Math.sqrt(sb.reduce((s, v) => s + v * v, 0))
  const cos = dot / (na * nb || 1)

  const row = (label: string, scores: number[], setScores: (v: number[]) => void, color: string) => (
    <tr className="border-b border-stone-100">
      <td className={`px-2 py-1.5 font-medium ${color}`}>{label}</td>
      {scores.map((v, i) => (
        <td key={i} className="px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              min={0}
              max={100}
              value={v}
              onChange={(e) => setScores(scores.map((x, j) => (j === i ? Number(e.target.value) : x)))}
              className="h-1.5 w-16 cursor-pointer accent-indigo-600"
            />
            <span className="w-7 font-mono text-xs text-stone-600">{v}</span>
          </div>
        </td>
      ))}
    </tr>
  )

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">5. 每门课就是一个维度：5 维空间里的"选课口味"</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          一个学生 5 门课的成绩 = 一个 5 维向量。没法画图，但<b className="text-stone-700">余弦相似度的公式照用不误</b>——
          维度再多，"方向一致程度"照样能算。拖动成绩滑块（或点预设），看两个学生的相似度变化。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {Object.keys(PRESETS).map((k) => (
            <Button key={k} variant="outline" size="sm" onClick={() => { setSa(PRESETS[k].a); setSb(PRESETS[k].b) }}>
              预设：{k}
            </Button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
                <th className="px-2 py-2 text-left">学生 \ 维度</th>
                {COURSES.map((c) => (
                  <th key={c} className="px-2 py-2 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row('学生甲', sa, setSa, 'text-indigo-700')}
              {row('学生乙', sb, setSb, 'text-orange-600')}
            </tbody>
          </table>
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-stone-600">余弦相似度（−1 ~ 1）</span>
            <span className="font-mono text-lg font-bold text-indigo-700">{cos.toFixed(4)}</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full rounded-full bg-indigo-600 transition-all duration-200" style={{ width: `${Math.max(0, cos * 100).toFixed(1)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-stone-500">
            {cos > 0.98 ? '几乎同向：两位同学的"口味地图"高度重合，推荐系统会把他们分到一组。' : cos > 0.9 ? '大方向相近，细节上开始有分歧。' : '方向明显偏离：专业课爱好者 vs 文体爱好者。'}
            注意：成绩都是正数，余弦天然偏高；工程上常先减去各自平均分（中心化）再算。
          </p>
        </div>
        <ThinkBox
          questions={[
            '把两人的所有成绩都减去 50 分（变成−50~50），相似度变化会更明显吗？想想"中心化"为什么有用。',
            '推荐系统"猜你喜欢"就是在高维空间里找和你余弦相似度最高的人——为什么不用欧氏距离？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

/** 高维直觉卡片：维度灾难预警 */
function HighDimCard({ onNavigate }: { onNavigate?: Nav }) {
  return (
    <Card className="border-indigo-200 bg-indigo-50/50 shadow-sm">
      <CardContent className="flex flex-wrap items-center gap-4 py-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-indigo-900">高维直觉：维度灾难（Curse of Dimensionality）</p>
          <p className="mt-1 text-sm leading-6 text-indigo-900/80">
            5 维还能想象，100 维呢？可以证明：在 100 维空间里随机撒点，<b>几乎所有点对之间的距离都差不多远</b>。
            "最近邻"和"最远邻"的距离比值趋近于 1——距离失去了区分度，依赖距离的算法（kNN、K-Means）在高维空间里会集体"失灵"。
            这就是为什么特征不是越多越好，也是"降维"存在的意义。
          </p>
        </div>
        {onNavigate && (
          <Button variant="outline" size="sm" className="shrink-0 border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => onNavigate('cluster')}>
            去聚类实验感受距离
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// ③ 距离度量对比
// ============================================================
type Metric = 'euclid' | 'manhattan' | 'chebyshev'

const METRIC_META: Record<Metric, { name: string; formula: string; scenario: string; color: string }> = {
  euclid: {
    name: '欧氏距离',
    formula: 'd = √(Δx² + Δy²)',
    scenario: '"两点之间直线最短"——鸟飞的距离，连续空间里最常用。',
    color: '#4f46e5',
  },
  manhattan: {
    name: '曼哈顿距离',
    formula: 'd = |Δx| + |Δy|',
    scenario: '= 城市街区开车距离：不能穿楼，只能横平竖直地绕。',
    color: '#f97316',
  },
  chebyshev: {
    name: '切比雪夫距离',
    formula: 'd = max(|Δx|, |Δy|)',
    scenario: '= 国际象棋国王的步数：横竖斜都算一步，看哪个方向更远。',
    color: '#059669',
  },
}

function DistanceSection() {
  const [metric, setMetric] = useState<Metric>('euclid')
  const A = { x: 15, y: 25 }
  const B = { x: 80, y: 70 }
  const W = 620
  const H = 220
  const xToPx = (x: number) => 30 + (x / 100) * (W - 60)
  const yToPx = (y: number) => H - 26 - (y / 100) * (H - 52)

  const dx = Math.abs(B.x - A.x)
  const dy = Math.abs(B.y - A.y)
  const value = metric === 'euclid' ? Math.hypot(dx, dy) : metric === 'manhattan' ? dx + dy : Math.max(dx, dy)

  // 曼哈顿阶梯路径
  const manhattanPath = useMemo(() => {
    const steps = 8
    const pts: string[] = [`M${xToPx(A.x)},${yToPx(A.y)}`]
    let cx = A.x
    let cy = A.y
    for (let i = 0; i < steps; i++) {
      cx += dx / steps
      pts.push(`L${xToPx(cx).toFixed(1)},${yToPx(cy).toFixed(1)}`)
      cy += dy / steps
      pts.push(`L${xToPx(cx).toFixed(1)},${yToPx(cy).toFixed(1)}`)
    }
    return pts.join(' ')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切比雪夫：先斜 45° 走 min(dx,dy)，再直线走 |dx−dy|
  const chebKnee = dy >= dx ? { x: A.x + dx * Math.sign(B.x - A.x), y: A.y + dx * Math.sign(B.y - A.y) } : { x: A.x + dy * Math.sign(B.x - A.x), y: A.y + dy * Math.sign(B.y - A.y) }

  const meta = METRIC_META[metric]

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">6. 三种距离：A 到 B 到底"有多远"？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          同样两个点，"距离"却有三种算法。<b className="text-stone-700">切换度量方式</b>，看路径形状和数值怎么变。
          选哪种距离，取决于你的现实场景允许怎么"走"。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1">
            {(Object.keys(METRIC_META) as Metric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${metric === m ? 'bg-indigo-600 font-medium text-white' : 'text-stone-600 hover:bg-stone-100'}`}
              >
                {METRIC_META[m].name}
              </button>
            ))}
          </div>
          <span className="font-mono text-xs text-indigo-700">{meta.formula}</span>
          <span className="rounded-lg bg-stone-50 px-3 py-1.5 text-sm">
            距离 = <b className="font-mono text-base" style={{ color: meta.color }}>{value.toFixed(1)}</b>
          </span>
        </div>
        <svg width={W} height={H} className="max-w-full rounded-lg border border-stone-200 bg-white">
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`v${i}`} x1={xToPx((i + 1) * 10)} x2={xToPx((i + 1) * 10)} y1={yToPx(0)} y2={yToPx(100)} stroke="#f5f5f4" />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`h${i}`} x1={xToPx(0)} x2={xToPx(100)} y1={yToPx((i + 1) * 10)} y2={yToPx((i + 1) * 10)} stroke="#f5f5f4" />
          ))}
          {metric === 'euclid' && <line x1={xToPx(A.x)} y1={yToPx(A.y)} x2={xToPx(B.x)} y2={yToPx(B.y)} stroke={meta.color} strokeWidth={3} />}
          {metric === 'manhattan' && <path d={manhattanPath} fill="none" stroke={meta.color} strokeWidth={3} strokeLinejoin="round" />}
          {metric === 'chebyshev' && (
            <g>
              <line x1={xToPx(A.x)} y1={yToPx(A.y)} x2={xToPx(chebKnee.x)} y2={yToPx(chebKnee.y)} stroke={meta.color} strokeWidth={3} />
              <line x1={xToPx(chebKnee.x)} y1={yToPx(chebKnee.y)} x2={xToPx(B.x)} y2={yToPx(B.y)} stroke={meta.color} strokeWidth={3} strokeDasharray="6 4" />
            </g>
          )}
          <circle cx={xToPx(A.x)} cy={yToPx(A.y)} r={8} fill="#ef4444" stroke="#fff" strokeWidth={2} />
          <text x={xToPx(A.x)} y={yToPx(A.y) + 22} textAnchor="middle" fontSize={12} fontWeight={700} fill="#ef4444">
            A
          </text>
          <circle cx={xToPx(B.x)} cy={yToPx(B.y)} r={8} fill="#3b82f6" stroke="#fff" strokeWidth={2} />
          <text x={xToPx(B.x)} y={yToPx(B.y) - 14} textAnchor="middle" fontSize={12} fontWeight={700} fill="#3b82f6">
            B
          </text>
        </svg>
        <p className="rounded-lg bg-stone-50 px-4 py-2.5 text-sm text-stone-600">{meta.scenario}</p>
        <ThinkBox
          questions={[
            '三种距离里，哪个永远最大、哪个永远最小？能证明"切比雪夫 ≤ 欧氏 ≤ 曼哈顿"吗？',
            'K-Means 默认用欧氏距离。如果数据是"各街区店铺的营业额"，哪种距离更合理？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// ④ 矩阵与表格的对应
// ============================================================
const MATRIX_STUDENTS = ['张同学', '李同学', '王同学', '赵同学', '陈同学']
const MATRIX_COURSES = ['会计学', '审计学', '统计学', '英语']
const MATRIX_SCORES = [
  [88, 76, 92, 85],
  [72, 81, 68, 90],
  [95, 88, 79, 72],
  [61, 70, 84, 78],
  [83, 69, 91, 66],
]

function MatrixSection() {
  const [hover, setHover] = useState<[number, number] | null>(null)

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">7. 一张表就是一个矩阵</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          数据挖掘里，<b className="text-stone-700">一张表格就是一个矩阵 X：一行是一个样本（一个学生），一列是一个特征（一门课成绩）</b>。
          鼠标悬停任意格子，看表格和矩阵如何一一对应。后面所有模块里说的"样本""特征"，指的都是行和列。
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-start gap-8">
          {/* 表格 */}
          <div>
            <p className="mb-2 text-xs font-medium text-stone-500">你熟悉的表格</p>
            <div className="overflow-x-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-500">学生</th>
                  {MATRIX_COURSES.map((c, j) => (
                    <th
                      key={c}
                      className={`border border-stone-200 px-3 py-1.5 text-xs transition-colors ${hover?.[1] === j ? 'bg-indigo-100 text-indigo-800' : 'bg-stone-50 text-stone-500'}`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX_STUDENTS.map((s, i) => (
                  <tr key={s}>
                    <td className={`border border-stone-200 px-3 py-1.5 text-xs transition-colors ${hover?.[0] === i ? 'bg-indigo-100 text-indigo-800' : 'bg-stone-50 text-stone-500'}`}>
                      {s}
                    </td>
                    {MATRIX_SCORES[i].map((v, j) => (
                      <td
                        key={j}
                        onMouseEnter={() => setHover([i, j])}
                        onMouseLeave={() => setHover(null)}
                        className={`cursor-crosshair border border-stone-200 px-3 py-1.5 text-center font-mono transition-colors ${
                          hover && hover[0] === i && hover[1] === j ? 'bg-indigo-600 font-bold text-white' : hover?.[0] === i || hover?.[1] === j ? 'bg-indigo-50' : ''
                        }`}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          {/* 矩阵 */}
          <div>
            <p className="mb-2 text-xs font-medium text-stone-500">算法眼中的矩阵 X（5 个样本 × 4 个特征）</p>
            <div className="flex items-stretch">
              <span className="mr-2 self-center font-mono text-lg text-stone-600">X =</span>
              <div className="rounded-l-lg border-y-2 border-l-2 border-stone-400" style={{ width: 8 }} />
              <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <tbody>
                  {MATRIX_SCORES.map((row, i) => (
                    <tr key={i}>
                      {row.map((v, j) => (
                        <td
                          key={j}
                          onMouseEnter={() => setHover([i, j])}
                          onMouseLeave={() => setHover(null)}
                          className={`cursor-crosshair px-3 py-1.5 text-center font-mono transition-colors ${
                            hover && hover[0] === i && hover[1] === j ? 'bg-indigo-600 font-bold text-white' : hover?.[0] === i || hover?.[1] === j ? 'bg-indigo-50' : ''
                          }`}
                        >
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="rounded-r-lg border-y-2 border-r-2 border-stone-400" style={{ width: 8 }} />
            </div>
            {hover && (
              <p className="mt-2 font-mono text-xs text-indigo-700">
                x{hover[0] + 1}
                {hover[1] + 1} = {MATRIX_SCORES[hover[0]][hover[1]]}（{MATRIX_STUDENTS[hover[0]]} 的{MATRIX_COURSES[hover[1]]}成绩）
              </p>
            )}
            {!hover && <p className="mt-2 font-mono text-xs text-stone-400">xᵢⱼ = 第 i 个样本的第 j 个特征</p>}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { t: '一行 = 一个样本', d: '张同学的 4 门课成绩拼成第 1 行，是他这个人的"数字画像"。' },
            { t: '一列 = 一个特征', d: '所有学生的会计学成绩组成第 1 列，是可比较的一个维度。' },
            { t: 'X 的形状 = n × d', d: 'n 个样本、d 个特征。后面的算法都在对这个矩阵做运算。' },
          ].map((c) => (
            <div key={c.t} className="rounded-lg bg-stone-50 px-4 py-3">
              <p className="text-sm font-medium text-stone-700">{c.t}</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">{c.d}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// ⑤ 贝叶斯定理：阳性 ≠ 确诊
// ============================================================
function BayesSection({ onNavigate }: { onNavigate?: Nav }) {
  const [prev, setPrev] = useState(1) // 患病率 %
  const [sens, setSens] = useState(99) // 灵敏度 %
  const [spec, setSpec] = useState(95) // 特异度 %

  const res = bayesPosterior(prev / 100, sens / 100, spec / 100)
  const grid = bayesGrid(prev / 100, sens / 100, spec / 100)

  // 1000 人点阵：前 sick 个是患者（检出=实心红，漏检=红圈），其后健康人中前 falseAlarm 个是误报（黄）
  const dots = useMemo(() => {
    const arr: Array<'tp' | 'fn' | 'fp' | 'ok'> = []
    for (let i = 0; i < grid.total; i++) {
      if (i < grid.detected) arr.push('tp')
      else if (i < grid.sick) arr.push('fn')
      else if (i < grid.sick + grid.falseAlarm) arr.push('fp')
      else arr.push('ok')
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev, sens, spec])

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">8. 贝叶斯定理：体检阳性，到底有多大概率真得病？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          一种病患病率 <b className="text-stone-700">1%</b>，检测灵敏度 99%（真患者 99% 被查出）、特异度 95%（健康人 95% 被判阴性）。
          如果你拿到一张<b className="text-orange-600">阳性</b>报告，真患病的概率是 99% 吗？<b className="text-stone-700">拖动三个滑块</b>，
          看下面 1000 人的点阵：<span className="text-red-600">红点 = 真患者被检出</span>、
          <span className="text-amber-600">黄点 = 健康人被误报</span>——数数谁多。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div data-testid="bayes-prev">
            <SliderRow label="患病率（先验概率）" value={prev} min={0.1} max={30} step={0.1} onChange={setPrev} format={(v) => `${v.toFixed(1)}%`} />
          </div>
          <div data-testid="bayes-sens">
            <SliderRow label="灵敏度（真患者检出率）" value={sens} min={50} max={99.9} step={0.1} onChange={setSens} format={(v) => `${v.toFixed(1)}%`} />
          </div>
          <div data-testid="bayes-spec">
            <SliderRow label="特异度（健康人排除率）" value={spec} min={50} max={99.9} step={0.1} onChange={setSpec} format={(v) => `${v.toFixed(1)}%`} />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          {/* 1000 人点阵 */}
          <div>
            <div data-testid="bayes-grid" className="grid rounded-lg border border-stone-200 bg-white p-3" style={{ gridTemplateColumns: 'repeat(50, minmax(0, 1fr))', gap: 2 }}>
              {dots.map((d, i) => (
                <span
                  key={i}
                  className="aspect-square rounded-full"
                  style={{
                    backgroundColor: d === 'tp' ? '#ef4444' : d === 'fp' ? '#f59e0b' : d === 'fn' ? 'transparent' : '#e7e5e4',
                    boxShadow: d === 'fn' ? 'inset 0 0 0 1.5px #ef4444' : undefined,
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              1000 人中：真患者 <b className="text-red-600">{grid.sick}</b> 人（检出 {grid.detected}、漏检 {grid.missed}），
              健康人被误报 <b className="text-amber-600">{grid.falseAlarm}</b> 人。
              {grid.falseAlarm > grid.detected && (
                <b className="text-orange-600"> 黄点比红点多得多——阳性报告里的大多数其实是健康人！</b>
              )}
            </p>
          </div>
          {/* 贝叶斯公式分步代入 */}
          <div className="space-y-2">
            <div className="rounded-lg bg-stone-50 px-4 py-3 text-sm">
              <p className="text-xs font-medium text-stone-500">分步代入贝叶斯公式</p>
              <p className="mt-1.5 font-mono text-xs leading-6 text-stone-700">
                分子 = 患病率 × 灵敏度
                <br />= {prev.toFixed(1)}% × {sens.toFixed(1)}% = <b className="text-indigo-700">{(res.numerator * 100).toFixed(2)}%</b>
                <br />
                分母 = 分子 + 健康人误报
                <br />= {(res.numerator * 100).toFixed(2)}% + {(100 - prev).toFixed(1)}% × {(100 - spec).toFixed(1)}%
                <br />= <b className="text-indigo-700">{((res.numerator + res.falseAlarmTerm) * 100).toFixed(2)}%</b>
              </p>
            </div>
            <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 px-4 py-3 text-center">
              <p className="text-xs text-indigo-700">P(真患病 | 检测阳性)</p>
              <p data-testid="bayes-posterior" className="font-mono text-3xl font-bold text-indigo-700">
                {(res.posterior * 100).toFixed(1)}%
              </p>
              <p className="mt-1 text-xs leading-5 text-indigo-900/70">
                基础概率越小的病，假阳性越"淹没问题真患者"。贝叶斯定理就是：<b>用新证据（阳性）更新先验（患病率）</b>。
              </p>
            </div>
            {onNavigate && (
              <Button variant="outline" size="sm" className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => onNavigate('tree', 'nb')}>
                朴素贝叶斯分类器用的就是这个公式 —— 去分类实验推演看看
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <ThinkBox
          questions={[
            '把患病率拖到 30%，误报还可怕吗？后验概率变成多少？——同样的检测，用在不同人群上结论完全不同。',
            '为什么复查（换一种检测再测一次）能大幅提高可信度？用贝叶斯的眼光想想：第一次阳性后，"先验"已经变了。',
            '特异度从 95% 提到 99.9%（只差 4.9 个百分点），黄点数量怎么变？为什么"特异度"对罕见病筛查如此关键？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// ⑥ 协方差与相关系数
// ============================================================
const COV_PRESETS: Array<{ id: CovPreset; label: string }> = [
  { id: 'positive', label: '正相关' },
  { id: 'negative', label: '负相关' },
  { id: 'none', label: '无关' },
  { id: 'nonlinear', label: '非线性' },
]

function CovSection({ onNavigate }: { onNavigate?: Nav }) {
  const [pts, setPts] = useState<Pt[]>(() => genCovPreset('positive'))
  const [preset, setPreset] = useState<CovPreset>('positive')
  const svgRef = useRef<SVGSVGElement>(null)
  const dragIdx = useRef(-1)

  const W = 460
  const H = 340
  const xToPx = (x: number) => 24 + (x / 100) * (W - 44)
  const yToPx = (y: number) => H - 28 - (y / 100) * (H - 52)

  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const cov = covariance(xs, ys)
  const r = pearson(xs, ys)
  const fit = linearFit(xs, ys)

  const applyPreset = (k: CovPreset) => {
    setPreset(k)
    setPts(genCovPreset(k))
  }

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragIdx.current < 0) return
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left - 24) / (W - 44)) * 100
    const y = ((H - 28 - (e.clientY - rect.top)) / (H - 52)) * 100
    const v = { x: +Math.min(100, Math.max(0, x)).toFixed(1), y: +Math.min(100, Math.max(0, y)).toFixed(1) }
    setPts((s) => s.map((p, i) => (i === dragIdx.current ? v : p)))
  }

  const rColor = r > 0.05 ? 'text-red-600' : r < -0.05 ? 'text-blue-600' : 'text-stone-700'
  const x1 = 0
  const x2 = 100
  const yLine = (x: number) => Math.min(110, Math.max(-10, fit.slope * x + fit.intercept))

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">9. 协方差与相关系数：两个变量"同涨同跌"吗？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          <b className="text-stone-700">协方差</b>的符号告诉我们两个变量同向（+）还是反向（−）变化，但它的数值大小受单位影响、没法横向比较；
          <b className="text-stone-700">皮尔逊相关系数 r</b> 把它归一化到 [−1, 1]：±1 = 完全线性，0 = 没有<b>线性</b>关系。
          点预设看四种典型形态，也可以<b className="text-stone-700">直接拖动任意点</b>改造数据。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {COV_PRESETS.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              size="sm"
              data-testid={`cov-preset-${p.id}`}
              className={preset === p.id ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : ''}
              onClick={() => applyPreset(p.id)}
            >
              预设：{p.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-[460px_1fr]">
          <svg
            ref={svgRef}
            width={W}
            height={H}
            data-testid="cov-canvas"
            className="max-w-full touch-none select-none rounded-lg border border-stone-200 bg-white"
            onPointerMove={onPointer}
            onPointerUp={() => (dragIdx.current = -1)}
            onPointerLeave={() => (dragIdx.current = -1)}
          >
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={xToPx((i + 1) * 10)} x2={xToPx((i + 1) * 10)} y1={yToPx(100)} y2={yToPx(0)} stroke="#f5f5f4" />
            ))}
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`h${i}`} x1={xToPx(0)} x2={xToPx(100)} y1={yToPx((i + 1) * 10)} y2={yToPx((i + 1) * 10)} stroke="#f5f5f4" />
            ))}
            {/* 回归参考线 */}
            <line x1={xToPx(x1)} y1={yToPx(yLine(x1))} x2={xToPx(x2)} y2={yToPx(yLine(x2))} stroke="#a8a29e" strokeWidth={1.5} strokeDasharray="6 4" />
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={xToPx(p.x)}
                cy={yToPx(p.y)}
                r={6.5}
                fill="#4f46e5"
                fillOpacity={0.8}
                stroke="#fff"
                strokeWidth={1.5}
                className="cursor-grab"
                onPointerDown={(e) => {
                  dragIdx.current = i
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                }}
              >
                <title>({p.x.toFixed(0)}, {p.y.toFixed(0)}) 拖动我</title>
              </circle>
            ))}
          </svg>
          <div className="space-y-2 text-sm">
            <div className="rounded-lg bg-stone-50 px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-stone-600">协方差 cov(x, y)</span>
                <span className="font-mono text-lg font-bold text-stone-700">{cov.toFixed(1)}</span>
              </div>
              <p className="text-xs text-stone-400">符号 = 同向 / 反向；数值受单位影响，只能看正负</p>
            </div>
            <div className="rounded-lg bg-stone-50 px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-stone-600">皮尔逊相关系数 r</span>
                <span data-testid="cov-r" className={`font-mono text-2xl font-bold ${rColor}`}>
                  {r.toFixed(3)}
                </span>
              </div>
              <p className="text-xs text-stone-400">红 = 正相关，蓝 = 负相关；r ∈ [−1, 1]，只量"线性"</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs leading-5 text-orange-900">
              <b>相关 ≠ 因果：</b>冰淇淋销量和溺水人数高度相关——不是冰淇淋导致溺水，而是"夏天气温"同时推高了两者。
              {preset === 'nonlinear' && (
                <span className="mt-1 block">
                  <b>再看现在：</b>抛物线明明关系很强，r 却 ≈ 0——r = 0 只代表"没有线性关系"，不代表"没关系"！
                </span>
              )}
            </div>
            {onNavigate && (
              <Button variant="outline" size="sm" className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => onNavigate('prep')}>
                离群点会剧烈拉动 r —— 去数据预处理看异常值处理
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <ThinkBox
          questions={[
            '切到"非线性"预设：r 接近 0 吗？这提醒我们"先看散点图，再看相关系数"有多重要。',
            '把右上角一个点使劲往右拖出人群，r 怎么变？——一个离群点就能"制造"出相关，预处理模块的异常值检测正是为此存在。',
            'r = 0.9 的两列数据，能说明一个导致另一个吗？各举一个"真有因果"和"纯属巧合"的例子。',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// 子页签导出
// ============================================================
export default function MathBasics({ onNavigate }: { onNavigate?: Nav }) {
  return (
    <div className="space-y-6">
      {/* 导览：六个小节分别给后面哪个模块打底 */}
      <p className="rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-xs leading-6 text-stone-500 shadow-sm">
        本页六个小节分别给后面的模块打底：<b className="text-stone-700">① 概率统计</b> → 朴素贝叶斯与模型评估（分类实验）；
        <b className="text-stone-700">② 向量与高维</b> → kNN 与"相似度"直觉；<b className="text-stone-700">③ 距离度量</b> → K-Means 与聚类评估（聚类实验）；
        <b className="text-stone-700">④ 矩阵 = 表格</b> → 所有模块共同的地基；<b className="text-stone-700">⑤ 贝叶斯定理</b> → 朴素贝叶斯分类器（分类实验）；
        <b className="text-stone-700">⑥ 协方差与相关</b> → 异常值预处理与特征选择（数据预处理）。
      </p>
      <div>
        <h2 className="text-lg font-bold text-stone-800">① 概率与统计直觉</h2>
        <p className="mt-0.5 text-sm text-stone-500">不懂概率，后面的熵和贝叶斯都是空中楼阁。三个小实验把"随机"变成看得见的曲线。</p>
      </div>
      <CoinSection />
      <NormalSection />
      <MeanMedianSection />

      <div className="pt-2">
        <h2 className="text-lg font-bold text-stone-800">② 向量与高维空间</h2>
        <p className="mt-0.5 text-sm text-stone-500">一条数据就是一个向量。先在二维里拖一拖，再鼓起勇气面对 100 维。</p>
      </div>
      <VectorSection />
      <CourseSimSection />
      <HighDimCard onNavigate={onNavigate} />

      <div className="pt-2">
        <h2 className="text-lg font-bold text-stone-800">③ 距离度量对比</h2>
        <p className="mt-0.5 text-sm text-stone-500">"相似"和"距离"是聚类与分类的地基，而距离不止一种量法。</p>
      </div>
      <DistanceSection />

      <div className="pt-2">
        <h2 className="text-lg font-bold text-stone-800">④ 矩阵与表格的对应</h2>
        <p className="mt-0.5 text-sm text-stone-500">最后一层窗户纸：Excel 表和矩阵 X 是同一个东西。</p>
      </div>
      <MatrixSection />

      <div className="pt-2">
        <h2 className="text-lg font-bold text-stone-800">⑤ 贝叶斯定理</h2>
        <p className="mt-0.5 text-sm text-stone-500">用新证据更新先验——一张阳性报告背后，藏着基础概率的"沉默大多数"。</p>
      </div>
      <BayesSection onNavigate={onNavigate} />

      <div className="pt-2">
        <h2 className="text-lg font-bold text-stone-800">⑥ 协方差与相关系数</h2>
        <p className="mt-0.5 text-sm text-stone-500">两个变量"同涨同跌"的量化方式，以及 r = 0 和"没关系"之间那条巨大的鸿沟。</p>
      </div>
      <CovSection onNavigate={onNavigate} />
    </div>
  )
}
