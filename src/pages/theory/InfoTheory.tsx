// 理论基础 · 子页签 2：信息论全家桶
// 1-2 节复用 EntropyLab 的摸球实验 / 分裂点拖动（原样保留）
// 新增：联合熵与条件熵 / 互信息 / KL 散度与交叉熵 / 信息增益率
import { useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import { BallSection, SplitSection } from '@/pages/EntropyLab'
import { entropyOfCounts } from '@/lib/entropy'
import { jointEntropy, conditionalEntropy, mutualInformation, marginalCounts, klDivergence, crossEntropy, splitInfo, gainRatio } from '@/lib/infotheory'
import { gen1DTwoClass, type Pt1D } from '@/lib/datasets'
import { CLASS_COLORS } from '@/lib/cart'
import { RefreshCw, ArrowRight } from 'lucide-react'
import type { PageId } from '@/App'

// ============================================================
// 3 + 4. 联合熵 / 条件熵 / 互信息（共享同一张 2×2 列联表）
// ============================================================
type Counts2x2 = [[number, number], [number, number]] // 行=天气[晴,雨]，列=出游[是,否]

const PRESET_TABLES: Record<string, Counts2x2> = {
  随手填: [[14, 6], [6, 14]],
  完全独立: [[12, 18], [8, 12]],
  完全相关: [[16, 0], [0, 14]],
}

function HBar({ label, value, max, color, note }: { label: string; value: number; max: number; color: string; note?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-stone-600">{label}</span>
        <span className="font-mono font-semibold" style={{ color }}>
          {value.toFixed(3)} bit
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }} />
      </div>
      {note && <p className="text-xs text-stone-400">{note}</p>}
    </div>
  )
}

function WeatherModule({ num1, num2 }: { num1: string; num2: string }) {
  const [t, setT] = useState<Counts2x2>(PRESET_TABLES.随手填)

  const m = useMemo(() => {
    const counts = t.map((r) => [...r]) as number[][]
    const { rows, cols } = marginalCounts(counts)
    const hx = entropyOfCounts(rows) // H(天气)
    const hy = entropyOfCounts(cols) // H(出游)
    const hgiven = conditionalEntropy(counts) // H(出游|天气)
    const hxy = jointEntropy(counts) // H(天气,出游)
    const mi = mutualInformation(counts) // I(天气;出游)
    return { hx, hy, hgiven, hxy, mi }
  }, [t])

  const total = t[0][0] + t[0][1] + t[1][0] + t[1][1]
  const barMax = Math.max(1.01, m.hxy)

  // 互信息文氏图：圆半径 ∝ √H，重叠程度 ∝ I / min(H)
  const r1 = 14 + 40 * Math.sqrt(m.hx)
  const r2 = 14 + 40 * Math.sqrt(m.hy)
  const ratio = Math.min(1, m.mi / (Math.min(m.hx, m.hy) || 1))
  const dist = r1 + r2 - ratio * (r1 + r2 - Math.abs(r1 - r2))
  const cx1 = 150
  const cx2 = 150 + Math.max(Math.abs(r1 - r2), Math.min(r1 + r2, dist))

  const cellSlider = (i: 0 | 1, j: 0 | 1, label: string, color: string) => (
    <div className="rounded-lg border border-stone-200 bg-white p-2.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className={color}>{label}</span>
        <span className="font-mono font-semibold text-stone-700">{t[i][j]} 人</span>
      </div>
      <input
        type="range"
        min={0}
        max={30}
        value={t[i][j]}
        onChange={(e) => {
          const v = Number(e.target.value)
          setT((prev) => {
            const next = prev.map((r) => [...r]) as Counts2x2
            next[i][j] = v
            return next
          })
        }}
        className="mt-1.5 h-1.5 w-full cursor-pointer accent-indigo-600"
      />
    </div>
  )

  return (
    <>
      {/* -------- 3. 联合熵与条件熵 -------- */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-stone-800">{num1}. 联合熵与条件熵：知道"天气"能帮你多少？</CardTitle>
          <p className="text-sm leading-6 text-stone-500">
            村里 40 位老乡的"天气 × 是否出游"调查表。<b className="text-stone-700">拖动四个格子的人数</b>，看四种熵的此消彼长：
            条件熵 H(出游|天气) = "知道天气之后，出游还剩多少不确定性"。
            <span className="ml-1 font-mono text-xs text-indigo-700">链式法则：H(X,Y) = H(X) + H(Y|X)</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-500">快捷填充：</span>
            {Object.keys(PRESET_TABLES).map((k) => (
              <Button key={k} variant="outline" size="sm" onClick={() => setT(PRESET_TABLES[k].map((r) => [...r]) as Counts2x2)}>
                {k}
              </Button>
            ))}
            <span className="text-xs text-stone-400">（共 {total} 人）</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            {/* 2×2 列联表 */}
            <div>
              <table className="w-full border-collapse text-center text-sm">
                <thead>
                  <tr>
                    <th className="p-1 text-xs text-stone-400">天气 \ 出游</th>
                    <th className="p-1 text-xs font-medium text-stone-500">出游</th>
                    <th className="p-1 text-xs font-medium text-stone-500">不出游</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-1 text-xs font-medium text-stone-500">晴</td>
                    <td className="p-1">{cellSlider(0, 0, '晴·出游', 'text-indigo-700')}</td>
                    <td className="p-1">{cellSlider(0, 1, '晴·不出游', 'text-stone-500')}</td>
                  </tr>
                  <tr>
                    <td className="p-1 text-xs font-medium text-stone-500">雨</td>
                    <td className="p-1">{cellSlider(1, 0, '雨·出游', 'text-orange-600')}</td>
                    <td className="p-1">{cellSlider(1, 1, '雨·不出游', 'text-stone-500')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* 熵条形 */}
            <div className="space-y-3">
              <HBar label="H(天气) —— 不看出游，单看天气的不确定性" value={m.hx} max={barMax} color="#4f46e5" />
              <HBar label="H(出游) —— 不看天气，单看出游的不确定性" value={m.hy} max={barMax} color="#f97316" />
              <HBar label="H(出游|天气) —— 知道天气后，出游剩余的不确定性" value={m.hgiven} max={barMax} color="#059669" note="永远 ≤ H(出游)：知道更多信息，不确定性只会减少（或不变）" />
              <HBar label="H(天气,出游) —— 联合熵：两件事一起的不确定性" value={m.hxy} max={barMax} color="#7c3aed" note={`验算：${m.hx.toFixed(3)} + ${m.hgiven.toFixed(3)} = ${(m.hx + m.hgiven).toFixed(3)} ✓`} />
            </div>
          </div>
          <ThinkBox
            questions={[
              '点"完全独立"：H(出游|天气) 和 H(出游) 一样大——为什么"知道天气"一点忙都帮不上？',
              '点"完全相关"：H(出游|天气) 变成多少？这时联合熵和 H(天气) 是什么关系？',
            ]}
          />
        </CardContent>
      </Card>

      {/* -------- 4. 互信息 -------- */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-stone-800">{num2}. 互信息：两个变量的"重叠信息量"</CardTitle>
          <p className="text-sm leading-6 text-stone-500">
            互信息 I(X;Y) = H(Y) − H(Y|X)，就是"知道 X 替你消除的关于 Y 的不确定性"。
            下面两个圆分别代表 H(天气) 和 H(出游)，<b className="text-stone-700">重叠面积就是互信息</b>。继续拖上面的表格试试。
            <span className="ml-1 font-mono text-xs text-indigo-700">I(X;Y) = H(Y) − H(Y|X)</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-6 md:grid-cols-[1fr_280px]">
            <svg width={420} height={150} className="max-w-full rounded-lg border border-stone-200 bg-white">
              <circle cx={cx1} cy={72} r={r1} fill="#4f46e5" fillOpacity={0.25} stroke="#4f46e5" strokeWidth={1.5} />
              <circle cx={cx2} cy={72} r={r2} fill="#f97316" fillOpacity={0.25} stroke="#f97316" strokeWidth={1.5} />
              <text x={cx1 - r1 * 0.55} y={40} textAnchor="middle" fontSize={11} fontWeight={600} fill="#4f46e5">
                H(天气)={m.hx.toFixed(2)}
              </text>
              <text x={cx2 + r2 * 0.55} y={40} textAnchor="middle" fontSize={11} fontWeight={600} fill="#f97316">
                H(出游)={m.hy.toFixed(2)}
              </text>
              <text x={(cx1 + cx2) / 2} y={78} textAnchor="middle" fontSize={11} fontWeight={700} fill="#7c3aed">
                I={m.mi.toFixed(3)}
              </text>
            </svg>
            <div className="space-y-2 text-sm">
              <div className="rounded-lg bg-violet-50 px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-violet-800">互信息 I(天气;出游)</span>
                  <span className="font-mono text-lg font-bold text-violet-600">{m.mi.toFixed(4)}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-violet-700/80">
                  = {m.hy.toFixed(3)} − {m.hgiven.toFixed(3)}
                  {m.mi < 0.001 ? '（≈0：两者独立，互不知情）' : m.mi >= m.hy - 0.001 ? '（= H(出游)：天气完全决定出游）' : '（部分相关）'}
                </p>
              </div>
              <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-500">
                特征选择里的"互信息法"就是给每个特征算 I(特征;标签)，排名靠前的留下——它和信息增益本质上是同一个量。
              </p>
            </div>
          </div>
          <ThinkBox
            questions={[
              '把表格拖到"完全相关"：重叠区域发生了什么？此时互信息等于哪个熵？',
              '互信息能不能比 H(出游) 还大？为什么？（提示：知道得再多，消除的不确定性也不可能超过原本就有的）',
            ]}
          />
        </CardContent>
      </Card>
    </>
  )
}

// ============================================================
// 5. KL 散度与交叉熵（轻量版）：拖骰子分布 P 与模型分布 Q
// ============================================================
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function DraggableBars({
  values,
  onChange,
  color,
  label,
  maxV = 40,
  x0,
  barW = 30,
  gap = 62,
  height = 150,
}: {
  values: number[]
  onChange: (i: number, v: number) => void
  color: string
  label: string
  maxV?: number
  x0: number
  barW?: number
  gap?: number
  height?: number
}) {
  const dragIdx = useRef(-1)
  const svgWrapRef = useRef<SVGSVGElement | null>(null)

  const setFromClientY = (clientY: number, svg: SVGSVGElement) => {
    if (dragIdx.current < 0) return
    const rect = svg.getBoundingClientRect()
    const frac = 1 - (clientY - rect.top) / height
    const v = Math.round(Math.min(maxV, Math.max(0, frac * maxV)))
    onChange(dragIdx.current, v)
  }

  return (
    <g>
      {values.map((v, i) => {
        const h = (v / maxV) * height
        return (
          <g key={i}>
            <rect
              x={x0 + i * gap}
              y={height - h}
              width={barW}
              height={h}
              rx={3}
              fill={color}
              fillOpacity={0.85}
              className="cursor-ns-resize"
              onPointerDown={(e) => {
                dragIdx.current = i
                const svg = (e.target as Element).closest('svg') as SVGSVGElement
                svgWrapRef.current = svg
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (dragIdx.current === i && svgWrapRef.current) setFromClientY(e.clientY, svgWrapRef.current)
              }}
              onPointerUp={() => (dragIdx.current = -1)}
            >
              <title>拖动调整{label}的 {FACES[i]} 概率</title>
            </rect>
            <text x={x0 + i * gap + barW / 2} y={height - h - 6} textAnchor="middle" fontSize={10} fill={color} fontWeight={600}>
              {((v / (values.reduce((a, b) => a + b, 0) || 1)) * 100).toFixed(0)}%
            </text>
          </g>
        )
      })}
    </g>
  )
}

function KLSection({ num, onNavigate }: { num: string; onNavigate?: (p: PageId, subTab?: string) => void }) {
  const [pRaw, setPRaw] = useState<number[]>([26, 5, 4, 3, 2, 1]) // 真实分布 P：灌铅骰子
  const [qMode, setQMode] = useState<'uniform' | 'custom'>('uniform')
  const [qRaw, setQRaw] = useState<number[]>([7, 7, 7, 7, 7, 7])

  const norm = (v: number[]) => {
    const s = v.reduce((a, b) => a + b, 0) || 1
    return v.map((x) => x / s)
  }
  const P = norm(pRaw)
  const Q = qMode === 'uniform' ? Array(6).fill(1 / 6) : norm(qRaw)
  const kl = klDivergence(P, Q)
  const hp = entropyOfCounts(pRaw)
  const ce = crossEntropy(P, Q)

  const H = 150
  const GAP = 62

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">{num}. KL 散度与交叉熵：模型的"预测"离真相有多远？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          一颗灌了铅的骰子，真实出点分布是 P（蓝，<b className="text-stone-700">拖柱子</b>改变它）；
          你的模型猜它是 Q（橙，默认"均匀分布"，也可以切成自定义拖一拖）。
          KL 散度 D_KL(P‖Q) 衡量"用 Q 代替 P 的代价"：<b className="text-stone-700">两个分布一模一样时 KL = 0</b>，差得越多越大。
          <span className="ml-1 font-mono text-xs text-indigo-700">H(P,Q) = H(P) + D_KL(P‖Q)</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-stone-500">模型分布 Q：</span>
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1">
            {(
              [
                ['uniform', '均匀分布（模型的默认猜测）'],
                ['custom', '自定义（可拖）'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setQMode(id)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${qMode === id ? 'bg-orange-500 font-medium text-white' : 'text-stone-600 hover:bg-stone-100'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-stone-400">上下拖动柱子改变概率（会自动归一化）</span>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <svg width={560} height={H + 40} className="max-w-full touch-none select-none rounded-lg border border-stone-200 bg-white">
            {/* 基线 */}
            <line x1={20} x2={540} y1={H} y2={H} stroke="#a8a29e" strokeWidth={1.2} />
            {FACES.map((f, i) => (
              <text key={i} x={20 + i * GAP + 46} y={H + 24} textAnchor="middle" fontSize={18} fill="#57534e">
                {f}
              </text>
            ))}
            {/* P 蓝（左半）Q 橙（右半） */}
            <DraggableBars values={pRaw} onChange={(i, v) => setPRaw((s) => s.map((x, j) => (j === i ? v : x)))} color="#4f46e5" label="真实分布 P" x0={20} barW={28} gap={GAP} height={H} />
            {qMode === 'custom' ? (
              <DraggableBars values={qRaw} onChange={(i, v) => setQRaw((s) => s.map((x, j) => (j === i ? v : x)))} color="#f97316" label="模型分布 Q" x0={20 + 32} barW={28} gap={GAP} height={H} />
            ) : (
              Q.map((q, i) => {
                const h = q * 6 * (H / 6) * (6 / 6) // 均匀：每根一样高
                return (
                  <g key={i}>
                    <rect x={20 + i * GAP + 32} y={H - h} width={28} height={h} rx={3} fill="#f97316" fillOpacity={0.7} />
                    <text x={20 + i * GAP + 46} y={H - h - 6} textAnchor="middle" fontSize={10} fill="#f97316" fontWeight={600}>
                      17%
                    </text>
                  </g>
                )
              })
            )}
            <text x={30} y={16} fontSize={11} fill="#4f46e5" fontWeight={600}>
              ■ P 真实分布
            </text>
            <text x={150} y={16} fontSize={11} fill="#f97316" fontWeight={600}>
              ■ Q 模型预测
            </text>
          </svg>
          <div className="space-y-2 text-sm">
            {[
              { label: 'H(P) 真实分布的熵', value: hp, color: '#4f46e5', tip: '骰子本身的不确定性' },
              { label: 'H(P,Q) 交叉熵', value: ce, color: '#f97316', tip: '用 Q 编码 P 的平均代价' },
              { label: 'D_KL(P‖Q)', value: kl, color: '#dc2626', tip: '交叉熵比熵多出来的部分', highlight: true },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg px-4 py-2.5 ${s.highlight ? 'bg-red-50' : 'bg-stone-50'}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-stone-600">{s.label}</span>
                  <span className="font-mono text-lg font-bold" style={{ color: s.color }}>
                    {Number.isFinite(s.value) ? s.value.toFixed(4) : '∞'}
                  </span>
                </div>
                <p className="text-xs text-stone-400">{s.tip}</p>
              </div>
            ))}
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-900">
              逻辑回归的损失函数就是交叉熵：训练 = 不断调整 Q，让 H(P,Q)（等价地，D_KL）变小。
            </p>
            {onNavigate && (
              <Button variant="outline" size="sm" className="border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => onNavigate('tree', 'logreg')}>
                去分类实验看逻辑回归推演
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <ThinkBox
          questions={[
            '把 Q 切成自定义，拖到和 P 完全一致：KL 和交叉熵各是多少？交叉熵能降到 0 吗？为什么？',
            'Q 用均匀分布时，P 越"偏"（比如全是⚀），KL 越大。训练模型时你在"惩罚"什么？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// 6. 信息增益率：分裂点拖动的扩展面板 + "按学号分裂"极端例子
// ============================================================
const GR_AXIS_W = 560

function GainRatioSection({ num }: { num: string }) {
  const [pts, setPts] = useState<Pt1D[]>(() => gen1DTwoClass(30))
  const [split, setSplit] = useState(50)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const xToPx = (x: number) => 30 + (x / 100) * (GR_AXIS_W - 60)

  // 当前二分裂的 IG / SplitInfo / GainRatio
  const cur = useMemo(() => {
    const parent = [0, 0]
    const left = [0, 0]
    const right = [0, 0]
    for (const pt of pts) {
      parent[pt.label]++
      if (pt.x <= split) left[pt.label]++
      else right[pt.label]++
    }
    const n = pts.length
    const hP = entropyOfCounts(parent)
    const hL = entropyOfCounts(left)
    const hR = entropyOfCounts(right)
    const nL = left[0] + left[1]
    const nR = right[0] + right[1]
    const weighted = (nL / n) * hL + (nR / n) * hR
    const ig = hP - weighted
    const si = splitInfo([nL, nR])
    return { ig, si, gr: gainRatio(ig, si), hP, n }
  }, [pts, split])

  // 按学号分裂：每个样本一组
  const byId = useMemo(() => {
    const ig = cur.hP // 每个叶子只有自己 → 加权熵 = 0
    const si = splitInfo(Array(cur.n).fill(1)) // = log2(n)
    return { ig, si, gr: gainRatio(ig, si) }
  }, [cur])

  // 曲线：IG 与 GainRatio 随分裂点变化
  const curves = useMemo(() => {
    const xs: number[] = []
    const igYs: number[] = []
    const grYs: number[] = []
    const parent = [0, 0]
    pts.forEach((pt) => parent[pt.label]++)
    for (let t = 5; t <= 95; t += 1) {
      const left = [0, 0]
      const right = [0, 0]
      for (const pt of pts) {
        if (pt.x <= t) left[pt.label]++
        else right[pt.label]++
      }
      const n = pts.length
      const nL = left[0] + left[1]
      const nR = right[0] + right[1]
      const hP = entropyOfCounts(parent)
      const ig = hP - ((nL / n) * entropyOfCounts(left) + (nR / n) * entropyOfCounts(right))
      xs.push(t)
      igYs.push(ig)
      grYs.push(gainRatio(ig, splitInfo([nL, nR])))
    }
    return { xs, igYs, grYs }
  }, [pts])

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current && e.type !== 'pointerdown') return
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left - 30) / (GR_AXIS_W - 60)) * 100
    setSplit(Math.min(95, Math.max(5, x)))
  }

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">{num}. 信息增益率：C4.5 为什么给信息增益"打个折扣"？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          信息增益偏爱"分得越碎越好"的分裂——极端例子：<b className="text-stone-700">按学号分裂</b>，每人一组，每组都绝对纯，信息增益爆炸，
          但这棵树没有任何泛化能力。增益率 GainRatio = 信息增益 ÷ 分裂信息 SplitInfo，分母惩罚"拆得太碎"，把虚高的增益打回原形。
          <span className="ml-1 font-mono text-xs text-indigo-700">GainRatio = IG / SplitInfo，SplitInfo = −Σ(nᵢ/n)·log₂(nᵢ/n)</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <svg
              ref={svgRef}
              width={GR_AXIS_W}
              height={110}
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
              <line x1={30} x2={GR_AXIS_W - 30} y1={64} y2={64} stroke="#a8a29e" strokeWidth={1.5} />
              {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                  <line x1={xToPx(v)} x2={xToPx(v)} y1={60} y2={68} stroke="#a8a29e" />
                  <text x={xToPx(v)} y={82} textAnchor="middle" fontSize={10} fill="#78716c">
                    {v}
                  </text>
                </g>
              ))}
              {pts.map((pt, i) => (
                <circle key={i} cx={xToPx(pt.x)} cy={46 - (i % 3) * 9} r={5} fill={CLASS_COLORS[pt.label]} fillOpacity={0.9} stroke="#fff" strokeWidth={1} />
              ))}
              <line x1={xToPx(split)} x2={xToPx(split)} y1={8} y2={92} stroke="#4f46e5" strokeWidth={2.5} />
              <circle cx={xToPx(split)} cy={12} r={7} fill="#4f46e5" stroke="#fff" strokeWidth={2} />
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
          {/* 对比表 */}
          <div className="min-w-[300px] flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="px-2 py-1.5">分裂方式</th>
                  <th className="px-2 py-1.5">信息增益 IG</th>
                  <th className="px-2 py-1.5">SplitInfo</th>
                  <th className="px-2 py-1.5">增益率</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-100">
                  <td className="px-2 py-2 text-stone-700">你拖的分裂点 x = {split.toFixed(0)}</td>
                  <td className="px-2 py-2 font-mono text-indigo-700">{cur.ig.toFixed(3)}</td>
                  <td className="px-2 py-2 font-mono text-stone-600">{cur.si.toFixed(3)}</td>
                  <td className="px-2 py-2 font-mono font-bold text-orange-600">{cur.gr.toFixed(3)}</td>
                </tr>
                <tr className="border-b border-stone-100 bg-red-50/60">
                  <td className="px-2 py-2 text-red-700">按学号分裂（{cur.n} 人 {cur.n} 组）</td>
                  <td className="px-2 py-2 font-mono text-red-600">{byId.ig.toFixed(3)} ↑爆炸</td>
                  <td className="px-2 py-2 font-mono text-red-600">{byId.si.toFixed(3)} ↑也爆炸</td>
                  <td className="px-2 py-2 font-mono font-bold text-red-600">{byId.gr.toFixed(3)} 打回原形</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-500">
              按学号分裂的 IG = {byId.ig.toFixed(3)} 看似最优，但 SplitInfo = log₂{cur.n} ≈ {byId.si.toFixed(2)} 也很大，增益率反而平平——C4.5 正是用增益率避开这种"死记硬背"的分裂。
            </p>
          </div>
        </div>
        <CurveChart
          xs={curves.xs}
          series={[
            { ys: curves.igYs, color: '#4f46e5', label: '信息增益 IG' },
            { ys: curves.grYs, color: '#f97316', label: '增益率 GainRatio', dashed: true },
          ]}
          markers={[{ x: split, color: '#059669', label: '你选的' }]}
          xLabel="分裂点位置 x"
          xFormat={(v) => v.toFixed(0)}
          height={200}
        />
        <ThinkBox
          questions={[
            '把分裂点拖到最边缘：SplitInfo 接近多少？此时增益率还可靠吗？（提示：除以接近 0 的数会不稳定，C4.5 因此要求先过 IG 平均线）',
            '"身份证号""学号"这类列为什么绝不能拿来做分裂特征？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// 子页签导出
// ============================================================
export default function InfoTheory({ onNavigate }: { onNavigate?: (p: PageId, subTab?: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-stone-800">信息论全家桶</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          从"摸球"建立熵的直觉，一路走到互信息、KL 散度与增益率——决策树和逻辑回归的数学引擎都在这里。
        </p>
      </div>
      <BallSection num="1" />
      <SplitSection num="2" />
      <WeatherModule num1="3" num2="4" />
      <KLSection num="5" onNavigate={onNavigate} />
      <GainRatioSection num="6" />
    </div>
  )
}
