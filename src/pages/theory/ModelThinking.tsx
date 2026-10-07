// 理论基础 · 子页签 4：模型思维实验室
// 五节：数据类型 / 损失函数与梯度下降 / 偏差与方差 / 交叉验证 / PCA 降维直觉
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import { ArrowRight, Play, RotateCcw, StepForward, Check, X } from 'lucide-react'
import {
  gdLoss,
  gdGrad,
  gdStep,
  GD_WMIN,
  kfoldDemo,
  pca2d,
  genEllipse,
  projectOnto,
  mulberry32,
} from '@/lib/theoryMath'
import type { PageId } from '@/App'

type Nav = (p: PageId, subTab?: string) => void

// ============================================================
// 1. 数据的四种类型
// ============================================================
type DataType = '定类' | '定序' | '定距' | '定比'
const TYPE_ORDER: DataType[] = ['定类', '定序', '定距', '定比']

const TYPE_CARDS: Array<{ t: DataType; name: string; eg: string; can: string; color: string }> = [
  { t: '定类', name: '定类（名义）', eg: '血型、地区、性别', can: '只有"是不是"。能数频数、算众数；不能排序、不能算均值', color: 'border-indigo-200 bg-indigo-50/60' },
  { t: '定序', name: '定序（有序）', eg: '满意度星级、客户等级', can: '有顺序，但"差值"没意义。能用中位数；星级差不恒定', color: 'border-sky-200 bg-sky-50/60' },
  { t: '定距', name: '定距（区间）', eg: '摄氏温度、年份', can: '差值有意义但没有真零点：20℃ 不是 10℃ 的"两倍热"', color: 'border-teal-200 bg-teal-50/60' },
  { t: '定比', name: '定比（比率）', eg: '收入、销售额、身高', can: '有真零点，倍数有意义：200 元真的是 100 元的两倍', color: 'border-emerald-200 bg-emerald-50/60' },
]

const QUIZ: Array<{ field: string; answer: DataType; why: string }> = [
  { field: '邮政编码（如 100081）', answer: '定类', why: '经典陷阱！数字只是编号——100081 并不比 100001 "大"，对邮编算均值毫无意义。' },
  { field: '成绩排名（第 1、2、3 名）', answer: '定序', why: '有顺序，但第 1 名和第 2 名的分数差不固定，差值没有意义。' },
  { field: '气温（℃）', answer: '定距', why: '0℃ 不是"没有温度"（是人为定的冰点），差值可比但倍数不可比。' },
  { field: '身高（cm）', answer: '定比', why: '0 cm 是真零点（没有高度），180 cm 确实是 90 cm 的两倍。' },
  { field: '客户等级（钻石 / 金 / 银）', answer: '定序', why: '等级有高低顺序，但"钻石 − 金"不是等距的差。' },
  { field: '利润（万元）', answer: '定比', why: '有真零点（0 = 不赚不赔），利润倍数有意义；还可以为负，但零点依然是真的。' },
]

function DataTypesSection() {
  const [order, setOrder] = useState<number[]>(() => QUIZ.map((_, i) => i))
  const [answers, setAnswers] = useState<Record<number, DataType>>({})

  const answered = Object.keys(answers).length
  const correct = Object.entries(answers).filter(([i, a]) => QUIZ[Number(i)].answer === a).length

  const reshuffle = () => {
    const idx = QUIZ.map((_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    setOrder(idx)
    setAnswers({})
  }

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">1. 数据的四种类型：先看清"是什么"，再决定"怎么算"</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          同样一列"数字"，可能只是编号（邮编），也可能是真数值（收入）。<b className="text-stone-700">类型决定能用什么方法</b>：
          定类列不能算均值，要先编码（预处理模块的活）；定序列可以用中位数。先看四张类型卡，再做下面的判断小练习。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TYPE_CARDS.map((c) => (
            <div key={c.t} className={`rounded-lg border px-4 py-3 ${c.color}`}>
              <p className="text-sm font-semibold text-stone-800">{c.name}</p>
              <p className="mt-0.5 text-xs text-stone-500">例：{c.eg}</p>
              <p className="mt-1.5 text-xs leading-5 text-stone-600">{c.can}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-stone-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2.5">
            <p className="text-sm font-medium text-stone-700">判断小练习：这列数据是哪种类型？</p>
            <div className="flex items-center gap-3">
              <span data-testid="quiz-score" className="text-sm text-stone-600">
                答对 <b className={`font-mono text-base ${answered === QUIZ.length ? (correct === QUIZ.length ? 'text-emerald-600' : 'text-orange-600') : 'text-indigo-700'}`}>{correct}</b> / {QUIZ.length}
                {answered === QUIZ.length && (correct === QUIZ.length ? ' 🎉 全对！' : '，看看解析再巩固一下')}
              </span>
              <Button variant="outline" size="sm" onClick={reshuffle}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                换一批顺序
              </Button>
            </div>
          </div>
          <div className="divide-y divide-stone-100" data-testid="quiz-list">
            {order.map((qi) => {
              const q = QUIZ[qi]
              const chosen = answers[qi]
              return (
                <div key={qi} className="px-4 py-3" data-testid={`quiz-row-${qi}`}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="min-w-44 text-sm font-medium text-stone-800">{q.field}</span>
                    <div className="flex gap-1.5">
                      {TYPE_ORDER.map((t) => {
                        const isChosen = chosen === t
                        const isRight = chosen !== undefined && t === q.answer
                        return (
                          <button
                            key={t}
                            disabled={chosen !== undefined}
                            onClick={() => setAnswers((s) => ({ ...s, [qi]: t }))}
                            className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                              isRight
                                ? 'border-emerald-400 bg-emerald-50 font-medium text-emerald-700'
                                : isChosen
                                  ? 'border-red-300 bg-red-50 text-red-600 line-through'
                                  : chosen !== undefined
                                    ? 'border-stone-200 text-stone-400'
                                    : 'border-stone-200 text-stone-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
                            }`}
                          >
                            {t}
                          </button>
                        )
                      })}
                    </div>
                    {chosen !== undefined && (
                      <span className={`flex items-center gap-1 text-xs font-medium ${chosen === q.answer ? 'text-emerald-600' : 'text-red-500'}`}>
                        {chosen === q.answer ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        {chosen === q.answer ? '正确' : `应为「${q.answer}」`}
                      </span>
                    )}
                  </div>
                  {chosen !== undefined && <p className="mt-1.5 text-xs leading-5 text-stone-500">{q.why}</p>}
                </div>
              )
            })}
          </div>
        </div>

        <ThinkBox
          questions={[
            '把"满意度 1~5 星"当定距算平均星级，大家都在做——严格说它是什么类型？为什么实践中又常常"睁一只眼闭一只眼"？',
            '预处理模块里，"地区"这列要先做独热编码才能进模型。用本节的知识解释：为什么不能直接把"北京=1、上海=2"喂给算法？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// 2. 损失函数与梯度下降
// ============================================================
function GdSection({ onNavigate }: { onNavigate?: Nav }) {
  const [w, setW] = useState(6.2)
  const [eta, setEta] = useState(0.2)
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState(0)

  const W = 620
  const H = 300
  const PAD = { l: 40, r: 16, t: 20, b: 34 }
  const wmin = -3
  const wmax = 7
  const jmax = 27
  const sx = (v: number) => PAD.l + ((v - wmin) / (wmax - wmin)) * (W - PAD.l - PAD.r)
  const sy = (j: number) => PAD.t + (1 - j / jmax) * (H - PAD.t - PAD.b)

  const curvePath = useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i <= 200; i++) {
      const v = wmin + ((wmax - wmin) * i) / 200
      pts.push(`${i === 0 ? 'M' : 'L'}${sx(v).toFixed(1)},${sy(gdLoss(v)).toFixed(1)}`)
    }
    return pts.join(' ')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const converged = Math.abs(w - GD_WMIN) < 0.01
  const diverged = !Number.isFinite(w) || Math.abs(w) > 50
  const status = diverged
    ? '💥 发散了：η 太大，小球在谷底两边越跳越远，飞出去了！点「重置」再来。'
    : converged
      ? `✅ 已收敛到谷底：w ≈ ${GD_WMIN}，J ≈ ${gdLoss(GD_WMIN)}（共走了 ${steps} 步）`
      : running
        ? '正在下降……'
        : '等待指令：点「走一步」或「自动下降」'

  // 自动下降动画
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      setW((cur) => {
        const next = gdStep(cur, eta)
        if (!Number.isFinite(next) || Math.abs(next) > 50 || Math.abs(next - GD_WMIN) < 0.01) {
          setRunning(false)
        }
        return next
      })
      setSteps((s) => s + 1)
    }, 140)
    return () => clearInterval(timer)
  }, [running, eta])

  const doStep = () => {
    setW((cur) => gdStep(cur, eta))
    setSteps((s) => s + 1)
  }
  const reset = () => {
    setRunning(false)
    setW(+(Math.random() * 9 - 2.5).toFixed(2))
    setSteps(0)
  }

  // 切线箭头：从当前点沿梯度反方向画出"这一步要走的位移"
  const grad = gdGrad(w)
  const stepLen = eta * grad // 带符号：w 方向的位移是 −stepLen
  const wNext = w - stepLen
  const arrowToW = Math.min(wmax - 0.1, Math.max(wmin + 0.1, wNext))
  const jw = gdLoss(w)
  const jNext = gdLoss(arrowToW)
  // 切线（斜率 grad）两端
  const tSpan = 0.9

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">2. 损失函数与梯度下降：小球怎么滚到谷底？</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          训练模型 = 在一个高维山坡上找最低点。<b className="text-stone-700">损失函数 J(w)</b> 衡量"当前参数有多烂"，
          <b className="text-stone-700">梯度</b>就是脚下"最陡的下山方向"。每一步按 <span className="font-mono text-indigo-700">w ← w − η·dJ/dw</span> 移动，
          学习率 η 决定步子大小。逻辑回归、神经网络都是这么学出来的。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-56" data-testid="gd-eta">
            <SliderRow label="学习率 η" value={eta} min={0.05} max={1.5} step={0.05} onChange={setEta} format={(v) => v.toFixed(2)} />
          </div>
          <Button size="sm" variant="outline" onClick={doStep} disabled={running || converged || diverged} data-testid="gd-step">
            <StepForward className="mr-1 h-3.5 w-3.5" />
            走一步
          </Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setRunning((r) => !r)} disabled={converged || diverged} data-testid="gd-auto">
            <Play className="mr-1 h-3.5 w-3.5" />
            {running ? '暂停' : '自动下降'}
          </Button>
          <Button size="sm" variant="outline" onClick={reset} data-testid="gd-reset">
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            重置（随机起点）
          </Button>
        </div>
        <div className="grid gap-6 md:grid-cols-[1fr_240px]">
          <svg width={W} height={H} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="gd-canvas">
            {/* 抛物线地形 */}
            <path d={curvePath} fill="none" stroke="#4f46e5" strokeWidth={2.5} />
            <line x1={sx(wmin)} x2={sx(wmax)} y1={sy(0)} y2={sy(0)} stroke="#a8a29e" strokeWidth={1.2} />
            {[wmin, GD_WMIN, wmax].map((v) => (
              <text key={v} x={sx(v)} y={H - 12} textAnchor="middle" fontSize={10} fill="#78716c">
                {v === GD_WMIN ? `谷底 w=${v}` : `w=${v}`}
              </text>
            ))}
            <text x={PAD.l} y={14} fontSize={11} fill="#57534e">
              损失 J(w) = (w − 2)² + 1
            </text>
            {!diverged && (
              <g>
                {/* 切线 */}
                <line
                  x1={sx(w - tSpan)}
                  y1={sy(jw - grad * tSpan)}
                  x2={sx(w + tSpan)}
                  y2={sy(jw + grad * tSpan)}
                  stroke="#f97316"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
                {/* 梯度下降方向箭头 */}
                <line x1={sx(w)} y1={sy(jw)} x2={sx(arrowToW)} y2={sy(jNext)} stroke="#ef4444" strokeWidth={2.5} markerEnd="url(#gdArrow)" />
                <defs>
                  <marker id="gdArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#ef4444" />
                  </marker>
                </defs>
                {/* 小球 */}
                <circle cx={sx(w)} cy={sy(jw)} r={9} fill="#f97316" stroke="#fff" strokeWidth={2.5} data-testid="gd-ball" />
                <text x={sx(w)} y={sy(jw) - 16} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#f97316">
                  w = {w.toFixed(2)}
                </text>
              </g>
            )}
            {diverged && (
              <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={14} fontWeight={700} fill="#ef4444">
                小球已飞出山谷（w = {Number.isFinite(w) ? w.toFixed(1) : '∞'}）
              </text>
            )}
          </svg>
          <div className="space-y-2 text-sm">
            <div className="rounded-lg bg-stone-50 px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-stone-600">当前位置 w</span>
                <span data-testid="gd-w" className="font-mono text-lg font-bold text-stone-800">
                  {Number.isFinite(w) ? w.toFixed(4) : '发散'}
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-stone-50 px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-stone-600">当前损失 J(w)</span>
                <span className="font-mono text-lg font-bold text-indigo-700">{Number.isFinite(jw) && Math.abs(w) <= 50 ? jw.toFixed(4) : '爆炸'}</span>
              </div>
            </div>
            <div className="rounded-lg bg-stone-50 px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-stone-600">当前梯度 dJ/dw</span>
                <span className="font-mono text-lg font-bold text-orange-600">{Number.isFinite(grad) && Math.abs(w) <= 50 ? grad.toFixed(3) : '—'}</span>
              </div>
              <p className="text-xs text-stone-400">越靠近谷底，梯度越接近 0，步子自动变小</p>
            </div>
            <p data-testid="gd-status" className={`rounded-lg px-3 py-2 text-xs leading-5 ${diverged ? 'bg-red-50 text-red-700' : converged ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-50 text-stone-600'}`}>
              {status}
            </p>
          </div>
        </div>
        <p className="rounded-lg bg-stone-50 px-4 py-2.5 text-xs leading-5 text-stone-600">
          亲手调出三种命运：η ≈ 0.2 稳步到谷底；η ≥ 1.0 在谷底两边来回跳、甚至飞出去；η = 0.05 慢吞吞急死人。
          红色箭头 = 这一步的位移（方向沿切线向下，长度 = η × 梯度）。
        </p>
        {onNavigate && (
          <div>
            <Button variant="outline" size="sm" className="border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => onNavigate('tree', 'logreg')}>
              逻辑回归就是这样一步步降损失的 —— 去分类实验看真实损失曲线
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <ThinkBox
          questions={[
            'η = 0.95 时小球还能收敛，但路径是"之"字形——为什么越接近 1 抖得越厉害？（提示：看每一步位移公式）',
            '如果损失曲面有很多坑（局部最低点），从山顶不同位置出发的小球会掉进同一个坑吗？这就是为什么神经网络要随机初始化。',
            'η 为什么不能太小也不能太大？工程上"学习率衰减"（越训越小）是在解决什么矛盾？',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// 3. 偏差与方差
// ============================================================
function Target({ bias, spread, seed, label, sub }: { bias: number; spread: number; seed: number; label: string; sub: string }) {
  const shots = useMemo(() => {
    const rng = mulberry32(seed)
    const g = () => {
      const u = Math.max(rng(), 1e-12)
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
    }
    return Array.from({ length: 8 }, () => ({ dx: bias + g() * spread, dy: g() * spread }))
  }, [bias, spread, seed])
  const S = 170
  const c = S / 2
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-2.5" data-testid="bv-target">
      <svg width={S} height={S} className="mx-auto">
        {[64, 44, 24].map((r) => (
          <circle key={r} cx={c} cy={c} r={r} fill="none" stroke="#d6d3d1" strokeWidth={1.5} />
        ))}
        <circle cx={c} cy={c} r={7} fill="#ef4444" fillOpacity={0.25} stroke="#ef4444" strokeWidth={1.5} />
        {shots.map((s, i) => (
          <circle key={i} cx={c + s.dx} cy={c + s.dy} r={4.5} fill="#4f46e5" fillOpacity={0.85} stroke="#fff" strokeWidth={1} />
        ))}
      </svg>
      <p className="text-center text-xs font-semibold text-stone-700">{label}</p>
      <p className="text-center text-[11px] text-stone-400">{sub}</p>
    </div>
  )
}

function BiasVarianceSection({ onNavigate }: { onNavigate?: Nav }) {
  const [round, setRound] = useState(1)
  const [complexity, setComplexity] = useState(4)

  // 经典 U 形曲线
  const xs = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), [])
  const bias2 = xs.map((c) => 6 * Math.exp(-0.55 * (c - 1)))
  const variance = xs.map((c) => 0.13 * (c - 1) * (c - 1))
  const total = xs.map((_, i) => bias2[i] + variance[i] + 0.4)
  const sweetIdx = total.indexOf(Math.min(...total))

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">3. 偏差与方差：打靶图看懂"欠拟合"和"过拟合"</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          把"训练一个模型"想象成打一枪：<b className="text-stone-700">偏差</b> = 平均弹着点离靶心多远（系统性打偏），
          <b className="text-stone-700">方差</b> = 每次换批数据重训，弹着点散开多大（不稳定）。
          对应到模型：拿直线硬拟合弯曲的数据 = 高偏差（<b className="text-stone-700">欠拟合</b>）；
          把每个噪声都背下来 = 高方差（<b className="text-stone-700">过拟合</b>）。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="bv-targets">
              <Target bias={0} spread={8} seed={round * 11 + 1} label="低偏差 · 低方差" sub="又准又稳：理想模型" />
              <Target bias={0} spread={28} seed={round * 11 + 2} label="低偏差 · 高方差" sub="平均准但不稳：过拟合" />
              <Target bias={30} spread={8} seed={round * 11 + 3} label="高偏差 · 低方差" sub="稳定地打偏：欠拟合" />
              <Target bias={30} spread={26} seed={round * 11 + 4} label="高偏差 · 高方差" sub="又偏又散：最差情况" />
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setRound((r) => r + 1)} data-testid="bv-reroll">
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              重新打一轮（换批数据重训）
            </Button>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-stone-600">
              模型复杂度是一根"此消彼长"的跷跷板：复杂度上升，<b className="text-indigo-700">偏差² 一路下降</b>（拟合能力变强），
              但<b className="text-emerald-700">方差一路上升</b>（越来越敏感于训练数据的噪声）。总误差 = 偏差² + 方差 + 不可消除的噪声，
              呈 <b className="text-orange-600">U 形</b>——最好的模型在谷底"甜点"。
            </p>
            <CurveChart
              xs={xs}
              series={[
                { ys: total, color: '#f97316', label: '总误差（U 形）' },
                { ys: bias2, color: '#4f46e5', label: '偏差²' },
                { ys: variance, color: '#059669', label: '方差' },
              ]}
              markers={[
                { x: xs[sweetIdx], color: '#f97316', label: '甜点' },
                { x: complexity, color: '#a8a29e' },
              ]}
              xLabel="模型复杂度 →"
              yLabel="误差"
              xFormat={(v) => v.toFixed(0)}
              width={560}
              height={230}
            />
            <div className="w-64">
              <SliderRow label="模型复杂度（你来定位）" value={complexity} min={1} max={10} step={1} onChange={setComplexity} format={(v) => `${v}`} />
            </div>
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
              {complexity < xs[sweetIdx]
                ? '当前在甜点左侧：模型太简单，偏差主导——欠拟合区。'
                : complexity > xs[sweetIdx]
                  ? '当前在甜点右侧：模型太复杂，方差主导——过拟合区。'
                  : '当前正在甜点：偏差与方差的最佳平衡！'}
            </p>
            {onNavigate && (
              <Button variant="outline" size="sm" className="border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => onNavigate('tree', 'dtree')}>
                去决策树推演把深度从 1 调到 6，就是在滑这条曲线
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <ThinkBox
          questions={[
            '"训练集上 100 分、测试集上 60 分"对应哪个象限？它是偏差问题还是方差问题？',
            '为什么"增加训练数据"主要降的是方差而不是偏差？',
            '集成学习（随机森林把 20 棵树投票平均）是在降偏差还是降方差？想想打靶图里"取平均"的效果。',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// 4. 交叉验证
// ============================================================
function CvSection() {
  const demo = useMemo(() => kfoldDemo(100, 5, 7), [])
  const [done, setDone] = useState(0) // 已完成的轮数 0..5

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">4. 交叉验证：一次划分有运气，轮流当考卷才公平</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          把 100 个样本切成 5 折。<b className="text-stone-700">每一轮，挑一折当测试集（考卷），其余 4 折当训练集（复习资料）</b>，
          5 轮下来每个样本都恰好当过一次考卷。最后看 <b className="text-stone-700">平均分 ± 波动</b>：
          平均分估计泛化能力，波动告诉你"这个模型稳不稳"。数据少、调参数（选深度、选 k）时尤其需要它。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={done >= 5}
            onClick={() => setDone((d) => d + 1)}
            data-testid="cv-next"
          >
            {done < 5 ? `第 ${done + 1} 轮：第 ${done + 1} 折当考卷` : '5 轮已完成'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDone(0)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            重置
          </Button>
          <span className="text-xs text-stone-400">红色 = 测试折，蓝色 = 训练折，灰色 = 还没轮到</span>
        </div>
        {/* 数据条：5 折 */}
        <div className="flex gap-1" data-testid="cv-bar">
          {demo.folds.map((_, i) => (
            <div
              key={i}
              className={`flex h-16 flex-1 flex-col items-center justify-center rounded-lg border text-xs font-medium transition-colors duration-300 ${
                done >= 5
                  ? 'border-stone-200 bg-stone-100 text-stone-500'
                  : i === done
                    ? 'border-red-300 bg-red-100 text-red-700'
                    : i < done
                      ? 'border-stone-200 bg-stone-100 text-stone-400'
                      : 'border-indigo-200 bg-indigo-50 text-indigo-600'
              }`}
            >
              <span>第 {i + 1} 折</span>
              <span className="mt-0.5 text-[10px] font-normal">
                {done >= 5 ? '已考完' : i === done ? '测试集（考卷）' : i < done ? '已考完' : '训练集'}
              </span>
            </div>
          ))}
        </div>
        {/* 每轮得分 */}
        <div className="grid gap-2 sm:grid-cols-5" data-testid="cv-scores">
          {demo.scores.map((s, i) => (
            <div key={i} className={`rounded-lg px-3 py-2 text-center text-sm ${i < done ? 'bg-indigo-50 text-indigo-800' : 'bg-stone-50 text-stone-300'}`}>
              <p className="text-[11px]">第 {i + 1} 轮得分</p>
              <p className="font-mono text-base font-bold">{i < done ? s.toFixed(3) : '—'}</p>
            </div>
          ))}
        </div>
        {done >= 5 && (
          <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 px-4 py-3 text-center" data-testid="cv-summary">
            <p className="text-sm text-indigo-900">
              交叉验证结论：平均准确率{' '}
              <b className="font-mono text-2xl">{(demo.mean * 100).toFixed(1)}%</b>{' '}
              ± <b className="font-mono text-xl">{(demo.std * 100).toFixed(1)}%</b>
            </p>
            <p className="mt-1 text-xs text-indigo-900/70">
              比"只划分一次"可信得多——5 个得分如果互相差很多（波动大），说明模型对数据划分很敏感，要警惕。
            </p>
          </div>
        )}
        <ThinkBox
          questions={[
            '为什么调参数（比如选决策树深度）时必须用交叉验证，而不是在测试集上反复试？——试多了你就"记住"测试集了。',
            'K 取多少合适？K = 样本数（留一法）为什么听起来最公平、实际却很少用？（提示：训练次数和训练集高度重叠）',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// 5. PCA 降维直觉
// ============================================================
function PcaSection({ onNavigate }: { onNavigate?: Nav }) {
  const [angle, setAngle] = useState(25)
  const [step, setStep] = useState(0) // 0 原始 / 1 画出主轴 / 2 投影
  const [t, setT] = useState(0) // 投影动画进度

  const W = 600
  const H = 330
  const xToPx = (x: number) => 20 + (x / 100) * (W - 40)
  const yToPx = (y: number) => H - 46 - (y / 100) * (H - 76)

  const pts = useMemo(() => genEllipse(120, angle, 7), [angle])
  const pca = useMemo(() => pca2d(pts), [pts])

  // 投影动画
  useEffect(() => {
    if (step !== 2 || t >= 1) return
    const timer = setInterval(() => setT((v) => Math.min(1, v + 0.04)), 40)
    return () => clearInterval(timer)
  }, [step, t])

  const setAngleAnd = (v: number) => {
    setAngle(v)
    setStep(0)
    setT(0)
  }

  // 主轴两端（延长到画布边缘附近）
  const axisLen = 55
  const ax1 = { x: pca.mean[0] - pca.dir[0] * axisLen, y: pca.mean[1] - pca.dir[1] * axisLen }
  const ax2 = { x: pca.mean[0] + pca.dir[0] * axisLen, y: pca.mean[1] + pca.dir[1] * axisLen }
  // 1D 投影带的标量范围
  const scalars = pts.map((p) => projectOnto(p, pca.mean, pca.dir))
  const sMin = Math.min(...scalars)
  const sMax = Math.max(...scalars)
  const sToPx = (s: number) => xToPx(8 + ((s - sMin) / (sMax - sMin || 1)) * 84)

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-stone-800">5. PCA 降维直觉：把椭圆"压扁"到它最长的那条轴上</CardTitle>
        <p className="text-sm leading-6 text-stone-500">
          100 列数据太多？PCA 的想法：<b className="text-stone-700">找到数据方差最大（= 信息量最大）的方向，只保留它</b>。
          下面这团二维椭圆点云：第一步找到"最长"的方向（第一主成分）；第二步把所有点投影上去，二维变一维——
          牺牲一点点信息，换来维度大降。它正是「数学急救包」里维度灾难卡片的解法之一。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-56" data-testid="pca-angle">
            <SliderRow label="点云旋转角度" value={angle} min={-60} max={60} step={5} onChange={setAngleAnd} format={(v) => `${v}°`} />
          </div>
          <Button size="sm" variant={step >= 1 ? 'outline' : 'default'} className={step >= 1 ? '' : 'bg-indigo-600 hover:bg-indigo-700'} onClick={() => setStep(1)} data-testid="pca-step1">
            ① 找出方差最大的方向
          </Button>
          <Button
            size="sm"
            variant={step >= 2 ? 'outline' : 'default'}
            className={step >= 2 ? '' : 'bg-indigo-600 hover:bg-indigo-700'}
            disabled={step < 1}
            onClick={() => {
              setStep(2)
              setT(0)
            }}
            data-testid="pca-step2"
          >
            ② 投影到主轴（2D → 1D）
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setStep(0); setT(0) }}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            重看
          </Button>
        </div>
        <div className="grid gap-6 md:grid-cols-[1fr_230px]">
          <svg width={W} height={H} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="pca-canvas">
            {/* 主轴 */}
            {step >= 1 && (
              <g>
                <line x1={xToPx(ax1.x)} y1={yToPx(ax1.y)} x2={xToPx(ax2.x)} y2={yToPx(ax2.y)} stroke="#f97316" strokeWidth={2.5} />
                <text x={xToPx(ax2.x) - 4} y={yToPx(ax2.y) - 8} textAnchor="end" fontSize={11} fontWeight={700} fill="#f97316">
                  第一主成分
                </text>
                <circle cx={xToPx(pca.mean[0])} cy={yToPx(pca.mean[1])} r={4} fill="#f97316" />
              </g>
            )}
            {/* 投影虚线 */}
            {step >= 2 &&
              pts.map((p, i) => {
                const s = scalars[i]
                const px = pca.mean[0] + pca.dir[0] * s
                const py = pca.mean[1] + pca.dir[1] * s
                const cx = p.x + (px - p.x) * t
                const cy = p.y + (py - p.y) * t
                return <line key={`l${i}`} x1={xToPx(p.x)} y1={yToPx(p.y)} x2={xToPx(cx)} y2={yToPx(cy)} stroke="#c7d2fe" strokeWidth={0.7} opacity={t * 0.8} />
              })}
            {/* 数据点（动画移向投影位置） */}
            {pts.map((p, i) => {
              const s = scalars[i]
              const px = pca.mean[0] + pca.dir[0] * s
              const py = pca.mean[1] + pca.dir[1] * s
              const cx = step >= 2 ? p.x + (px - p.x) * t : p.x
              const cy = step >= 2 ? p.y + (py - p.y) * t : p.y
              return <circle key={i} cx={xToPx(cx)} cy={yToPx(cy)} r={4} fill="#4f46e5" fillOpacity={0.75} />
            })}
            {/* 1D 投影带 */}
            {step >= 2 && t >= 1 && (
              <g data-testid="pca-1d">
                <line x1={sToPx(sMin) - 8} x2={sToPx(sMax) + 8} y1={H - 22} y2={H - 22} stroke="#a8a29e" strokeWidth={1.2} />
                {scalars.map((s, i) => (
                  <circle key={i} cx={sToPx(s)} cy={H - 22} r={3} fill="#f97316" fillOpacity={0.85} />
                ))}
                <text x={sToPx(sMin) - 10} y={H - 6} fontSize={10.5} fill="#78716c">
                  ↑ 降维后的一维数据（点在主轴上的坐标）
                </text>
              </g>
            )}
          </svg>
          <div className="space-y-2 text-sm">
            <div className="rounded-lg bg-stone-50 px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-stone-600">主轴方向角</span>
                <span className="font-mono text-lg font-bold text-orange-600">{pca.angleDeg.toFixed(1)}°</span>
              </div>
              <p className="text-xs text-stone-400">算法自己找到的，跟着你的旋转滑块走</p>
            </div>
            <div className="rounded-lg bg-stone-50 px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-stone-600">保留的方差</span>
                <span data-testid="pca-ratio" className="font-mono text-2xl font-bold text-indigo-700">
                  {(pca.varRatio * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-stone-400">λ₁ / (λ₁ + λ₂)：只丢 {(100 - pca.varRatio * 100).toFixed(1)}% 的信息</p>
            </div>
            <div className="rounded-lg bg-stone-50 px-4 py-2.5 text-xs leading-5 text-stone-600">
              椭圆越"扁"，保留率越高——因为信息本来就集中在长轴上。100 维数据若主要由 5 个方向承载，PCA 就能 100 → 5。
            </div>
            {onNavigate && (
              <Button variant="outline" size="sm" className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => onNavigate('cluster')}>
                降维后再聚类更稳 —— 去聚类实验看看
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <ThinkBox
          questions={[
            '如果数据是个正圆形（各方向方差一样），PCA 还有用吗？——什么样的数据"天生不可降维"？',
            'PCA 找的是"方差最大"的方向，不是"最能把两类分开"的方向——什么时候这两者会冲突？（提示：这是 PCA 和 LDA 的区别）',
            '为什么做 PCA 之前通常要先标准化（把每列缩放到同量纲）？想想"收入（万元）"和"年龄（岁）"混在一起会怎样。',
          ]}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================
// 子页签导出
// ============================================================
export default function ModelThinking({ onNavigate }: { onNavigate?: Nav }) {
  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-xs leading-6 text-stone-500 shadow-sm">
        数学备齐了，这一页解决"模型观"：<b className="text-stone-700">① 数据类型</b> → 决定预处理与可用方法；
        <b className="text-stone-700">② 梯度下降</b> → 逻辑回归 / 神经网络怎么"学"；<b className="text-stone-700">③ 偏差与方差</b> → 欠拟合与过拟合的本质；
        <b className="text-stone-700">④ 交叉验证</b> → 可靠的模型评估；<b className="text-stone-700">⑤ PCA</b> → 对抗维度灾难的降维直觉。
      </p>
      <DataTypesSection />
      <GdSection onNavigate={onNavigate} />
      <BiasVarianceSection onNavigate={onNavigate} />
      <CvSection />
      <PcaSection onNavigate={onNavigate} />
    </div>
  )
}
