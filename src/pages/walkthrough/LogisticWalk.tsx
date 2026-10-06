// 逻辑回归逐步推演：每一步 = 一次梯度下降迭代
// 画布：散点 + 当前决策边界 + 概率渐变背景；右侧：w₁/w₂/b/损失；下方：损失曲线
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import StepControls from '@/components/StepControls'
import { MethodIntroCard } from '@/components/MethodIntro'
import { WalkDataPanel, genPts } from '@/pages/walkthrough/walkShared'
import { logisticWalkthrough } from '@/lib/walkthroughs'
import { CLASS_COLORS } from '@/lib/cart'
import type { DTPreset, Pt } from '@/lib/datasets'

const W = 520
const H = 420
const GX = 52
const GY = 42

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

export default function LogisticWalk() {
  // ---- 数据 ----
  const [preset, setPreset] = useState<DTPreset>('linear')
  const [perClass, setPerClass] = useState(60)
  const [noise, setNoise] = useState(6)
  const [points, setPoints] = useState<Pt[]>(() => genPts('linear', 60, 6))
  const [lr, setLr] = useState(0.5)

  // ---- 步进 ----
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const X = useMemo(() => points.map((p) => [p.x, p.y]), [points])
  const y = useMemo(() => points.map((p) => p.label), [points])

  // 数据或学习率变化 → 重新推演出整条迭代序列
  const walk = useMemo(() => (points.length >= 10 ? logisticWalkthrough(X, y, lr, 200) : null), [X, y, lr, points.length])
  const totalSteps = walk ? walk.steps.length - 1 : 0
  const curStep = Math.min(step, totalSteps)

  useEffect(() => {
    if (step > totalSteps) setStep(totalSteps)
  }, [totalSteps, step])

  const cur = walk?.steps[curStep]

  // ---- 概率渐变背景（网格采样） ----
  const bgCells = useMemo(() => {
    if (!walk || !cur) return null
    const [m1, m2] = walk.mean
    const [s1, s2] = walk.std
    const [w1, w2] = cur.w
    const cells: number[] = []
    for (let r = 0; r < GY; r++) {
      for (let c = 0; c < GX; c++) {
        const x = ((c + 0.5) / GX) * 100
        const yy = ((r + 0.5) / GY) * 100
        cells.push(sigmoid(w1 * ((x - m1) / s1) + w2 * ((yy - m2) / s2) + cur.b))
      }
    }
    return cells
  }, [walk, cur])

  // ---- 决策边界直线（标准化空间 w·z+b=0 还原到原始坐标） ----
  const boundaryLine = useMemo(() => {
    if (!walk || !cur) return null
    const [m1, m2] = walk.mean
    const [s1, s2] = walk.std
    const [w1, w2] = cur.w
    // a·x + c·y + e = 0（原始坐标）
    const a = w1 / s1
    const c = w2 / s2
    const e = cur.b - (w1 * m1) / s1 - (w2 * m2) / s2
    // 与画布四边求交，取落在框内的两个交点
    const pts: Array<[number, number]> = []
    const push = (x: number, yy: number) => {
      if (x >= -0.01 && x <= 100.01 && yy >= -0.01 && yy <= 100.01) pts.push([x, yy])
    }
    if (Math.abs(c) > 1e-9) {
      push(0, -e / c)
      push(100, -(e + 100 * a) / c)
    }
    if (Math.abs(a) > 1e-9) {
      push(-e / a, 0)
      push(-(e + 100 * c) / a, 100)
    }
    if (pts.length < 2) return null
    return { x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1] }
  }, [walk, cur])

  const regenerate = (p = preset, n = perClass, nz = noise) => {
    setPoints(genPts(p, n, nz))
    setStep(0)
    setPlaying(false)
  }

  const xPx = (x: number) => (x / 100) * W
  const yPx = (yy: number) => H - (yy / 100) * H

  const losses = walk?.steps.slice(0, curStep + 1).map((s) => s.loss) ?? []
  const done = curStep >= totalSteps && totalSteps > 0

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">逻辑回归逐步推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          逻辑回归先<b className="text-stone-700">随便画一条线</b>，然后看每个样本"答得对不对"，
          一步步把线往减少错误的方向挪——每一步就是一次梯度下降迭代。
        </p>
        <div className="mt-2">
          <MethodIntroCard id="logreg" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：画布 + 损失曲线 ===== */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">数据画布 · 决策边界与概率渐变</CardTitle>
            <p className="text-xs text-stone-500">
              背景颜色 = 模型认为该位置属于 B 类的把握（蓝色越深越像 B，橙色越深越像 A）；靛蓝直线 = "分数 = 0" 的决策边界。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="logreg-canvas">
              {/* 概率渐变背景 */}
              {bgCells &&
                bgCells.map((p, i) => {
                  const c = i % GX
                  const r = Math.floor(i / GX)
                  const conf = Math.abs(p - 0.5) * 2 // 0~1 信心
                  return (
                    <rect
                      key={i}
                      x={(c / GX) * W}
                      y={H - ((r + 1) / GY) * H}
                      width={W / GX + 0.5}
                      height={H / GY + 0.5}
                      fill={p >= 0.5 ? `rgba(59,130,246,${0.06 + 0.24 * conf})` : `rgba(249,115,22,${0.06 + 0.24 * conf})`}
                    />
                  )
                })}
              {/* 决策边界 */}
              {boundaryLine && (
                <line
                  x1={xPx(boundaryLine.x1)}
                  y1={yPx(boundaryLine.y1)}
                  x2={xPx(boundaryLine.x2)}
                  y2={yPx(boundaryLine.y2)}
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  data-testid="logreg-boundary"
                  className="transition-all duration-300"
                />
              )}
              {/* 数据点 */}
              {points.map((p, i) => (
                <circle key={i} cx={xPx(p.x)} cy={yPx(p.y)} r={4.5} fill={CLASS_COLORS[p.label]} stroke="#fff" strokeWidth={1.2} />
              ))}
              <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#a8a29e">
                特征 x₁
              </text>
              <text x={10} y={H / 2} fontSize={11} fill="#a8a29e" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">
                特征 x₂
              </text>
            </svg>

            {/* 损失曲线 */}
            <div>
              <p className="mb-1 text-sm font-medium text-stone-700">
                交叉熵损失曲线
                <span className="ml-2 text-xs font-normal text-stone-400">损失 = "平均猜得有多离谱"，越低越好</span>
              </p>
              {losses.length > 1 ? (
                <CurveChart
                  xs={losses.map((_, i) => i)}
                  series={[{ ys: losses, color: '#4f46e5', label: '交叉熵损失' }]}
                  markers={[{ x: curStep, color: '#f97316', label: cur?.loss.toFixed(4) }]}
                  width={520}
                  height={180}
                  xLabel="迭代轮数"
                  xFormat={(v) => v.toFixed(0)}
                />
              ) : (
                <p className="rounded bg-stone-50 p-3 text-xs text-stone-400">点"下一步"开始迭代，损失曲线会随步增长。</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ===== 右侧：控制面板 ===== */}
        <div className="space-y-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">数据</CardTitle>
            </CardHeader>
            <CardContent>
              <WalkDataPanel
                preset={preset}
                perClass={perClass}
                noise={noise}
                onPreset={(p) => {
                  setPreset(p)
                  regenerate(p)
                }}
                onPerClass={setPerClass}
                onNoise={setNoise}
                onRegen={() => regenerate()}
                hint="默认「线性可分」是逻辑回归的主场"
              />
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">算法</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SliderRow
                label="学习率（每步迈多大）"
                value={lr}
                min={0.05}
                max={1}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => {
                  setLr(v)
                  setStep(0)
                  setPlaying(false)
                }}
              />
              <p className="text-xs leading-5 text-stone-500">
                学习率太小 = 小碎步慢吞吞；太大 = 步子迈过头来回横跳。试试拉到 1.0 看损失曲线发抖。
              </p>
            </CardContent>
          </Card>

          <StepControls
            step={curStep}
            totalSteps={totalSteps}
            playing={playing}
            onStep={setStep}
            onPlaying={setPlaying}
            intervalMs={120}
            extra={
              done ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700" data-testid="logreg-done">
                  {walk?.converged ? '已收敛' : '已达步数上限'}
                </span>
              ) : undefined
            }
          >
            {/* 当前状态详情 */}
            {cur && (
              <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm">
                <p className="font-medium text-indigo-900" data-testid="logreg-step-label">
                  {curStep === 0 ? '第 0 步：随机初始化' : `第 ${curStep} 步：一次梯度下降迭代`}
                </p>
                {curStep === 0 && (
                  <p className="text-xs leading-5 text-stone-600">
                    先随便画一条线（w、b 取随机值），此时边界乱指、损失很高。接下来每一步都沿着"让损失下降"的方向修正一点点。
                  </p>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-stone-700">
                  <span>
                    w₁ = <b className="text-indigo-700">{cur.w[0]?.toFixed(3)}</b>
                  </span>
                  <span>
                    w₂ = <b className="text-indigo-700">{cur.w[1]?.toFixed(3)}</b>
                  </span>
                  <span>
                    b = <b className="text-indigo-700">{cur.b.toFixed(3)}</b>
                  </span>
                  <span>
                    损失 = <b className="text-orange-600">{cur.loss.toFixed(4)}</b>
                  </span>
                  <span className="col-span-2">
                    训练准确率 = <b className="text-indigo-700">{(cur.acc * 100).toFixed(1)}%</b>
                  </span>
                </div>
                {done && (
                  <p className="text-xs leading-5 text-emerald-700">
                    {walk?.converged
                      ? `已收敛：迭代 ${totalSteps} 次后损失不再明显下降（变化 < 0.000001），提前收工。`
                      : `已达 200 步上限：损失仍在缓慢下降，可以增加迭代次数或调大学习率。`}
                  </p>
                )}
              </div>
            )}
          </StepControls>
        </div>
      </div>

      {/* ===== 讲解卡：sigmoid 与"分数=0" ===== */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · sigmoid：把分数压成概率</CardTitle>
          </CardHeader>
          <CardContent>
            <SigmoidChart />
            <p className="mt-1 text-xs leading-5 text-stone-500">
              横轴 = 线性打分 w·x+b（可正可负），纵轴 = sigmoid 压出来的概率。分数 = 0 时概率正好 0.5（最犹豫）；
              分数越大概率越接近 1，但永远到不了 1——这给"不确定"留了余地。
            </p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 为什么一条直线就能分类？</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              我们画的不是"概率 = 0.5 的曲线"，而是<b>分数 = 0 的那条线</b>：w₁x₁ + w₂x₂ + b = 0。
              线的一侧分数为正（更像 B），另一侧为负（更像 A）。
            </p>
            <p>
              训练的本质就是调整 w₁、w₂、b 三个数，让这条线把两类"切开"。
              所以逻辑回归天生只会画<b>直线</b>——换成"同心圆"数据集试试，它会一筹莫展，这不是 bug，是能力边界。
            </p>
          </CardContent>
        </Card>
      </div>

      <ThinkBox
        questions={[
          '把学习率从 0.5 调到 1.0 再自动播放：损失曲线还是一路下降吗？"步子太大"会发生什么？',
          '换成"月牙"或"同心圆"数据集，逻辑回归的准确率能到多少？直线边界的局限在哪？',
          '对比第 0 步和收敛后的 w₁、w₂：哪个特征的权重更大？对照散点图想想为什么是这个特征更"说了算"。',
          '观察收敛后背景的颜色渐变：边界附近为什么是浅色的？这对"模型不确定的样本"有什么提示？',
        ]}
      />
    </div>
  )
}

// ============================================================
// sigmoid 曲线小图
// ============================================================
function SigmoidChart() {
  const SW = 300
  const SH = 170
  const PAD = { l: 36, r: 10, t: 10, b: 24 }
  const iw = SW - PAD.l - PAD.r
  const ih = SH - PAD.t - PAD.b
  const sx = (z: number) => PAD.l + ((z + 6) / 12) * iw
  const sy = (p: number) => PAD.t + (1 - p) * ih
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const z = -6 + (i / 120) * 12
    pts.push(`${i === 0 ? 'M' : 'L'}${sx(z).toFixed(1)},${sy(sigmoid(z)).toFixed(1)}`)
  }
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="sigmoid-chart">
      {/* 参考线 */}
      <line x1={sx(-6)} y1={sy(0.5)} x2={sx(6)} y2={sy(0.5)} stroke="#d6d3d1" strokeWidth={1} strokeDasharray="4 3" />
      <line x1={sx(0)} y1={sy(0)} x2={sx(0)} y2={sy(1)} stroke="#d6d3d1" strokeWidth={1} strokeDasharray="4 3" />
      {/* 坐标轴 */}
      <line x1={sx(-6)} y1={sy(0)} x2={sx(6)} y2={sy(0)} stroke="#a8a29e" strokeWidth={1} />
      <line x1={sx(-6)} y1={sy(0)} x2={sx(-6)} y2={sy(1)} stroke="#a8a29e" strokeWidth={1} />
      <path d={pts.join(' ')} fill="none" stroke="#4f46e5" strokeWidth={2.2} />
      <circle cx={sx(0)} cy={sy(0.5)} r={4} fill="#f97316" stroke="#fff" strokeWidth={1.5} />
      <text x={sx(0)} y={sy(0.5) - 8} textAnchor="middle" fontSize={10} fill="#ea580c">
        分数 0 → 概率 0.5
      </text>
      {[-6, 0, 6].map((z) => (
        <text key={z} x={sx(z)} y={sy(0) + 14} textAnchor="middle" fontSize={10} fill="#a8a29e">
          {z}
        </text>
      ))}
      {[0, 0.5, 1].map((p) => (
        <text key={p} x={sx(-6) - 5} y={sy(p) + 3.5} textAnchor="end" fontSize={10} fill="#a8a29e">
          {p}
        </text>
      ))}
      <text x={sx(0)} y={SH - 4} textAnchor="middle" fontSize={11} fill="#78716c">
        分数 z = w·x + b
      </text>
      <text x={sx(-6)} y={12} fontSize={11} fill="#78716c">
        概率 p
      </text>
    </svg>
  )
}
