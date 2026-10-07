// SVM 逐步推演：每一步 = 一次 Pegasos 次梯度迭代
// 画布：散点 + 间隔带底色 + 决策边界实线 + 两侧间隔虚线 + "正在起作用的点"高亮
// 收敛后：支持向量用大圆圈标出，配讲解卡
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import StepControls from '@/components/StepControls'
import { MethodIntroCard } from '@/components/MethodIntro'
import { WalkDataPanel, genPts } from '@/pages/walkthrough/walkShared'
import { svmWalkthrough, svmLineRaw, type SvmWalk } from '@/lib/walkthroughs2'
import { CLASS_COLORS } from '@/lib/cart'
import type { DTPreset, Pt } from '@/lib/datasets'
import { DEFAULT_DATA_SEED } from '@/lib/datasets'

const W = 520
const H = 420
const GX = 52
const GY = 42

/** 直线 a·x + c·y + e = 0 与 [0,100]² 画布边框求交，返回框内线段两端点 */
function clipLine(a: number, c: number, e: number): { x1: number; y1: number; x2: number; y2: number } | null {
  const pts: Array<[number, number]> = []
  const push = (x: number, yy: number) => {
    if (x >= -0.01 && x <= 100.01 && yy >= -0.01 && yy <= 100.01) {
      if (!pts.some(([px, py]) => Math.abs(px - x) < 1e-6 && Math.abs(py - yy) < 1e-6)) pts.push([x, yy])
    }
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
}

/** 当前 w、b 下，决策边界(v=0)与两条间隔边(v=±1)在原始坐标中的线段 */
function svmLines(walk: SvmWalk, w: number[], b: number) {
  const out: Array<{ v: number; seg: { x1: number; y1: number; x2: number; y2: number } | null }> = []
  for (const v of [0, 1, -1]) {
    const { a, c, e } = svmLineRaw(walk, w, b, v)
    out.push({ v, seg: clipLine(a, c, e) })
  }
  return out
}

export default function SvmWalk() {
  // ---- 数据 ----
  const [preset, setPreset] = useState<DTPreset>('linear')
  const [perClass, setPerClass] = useState(60)
  const [noise, setNoise] = useState(6)
  const [points, setPoints] = useState<Pt[]>(() => genPts('linear', 60, 6))
  const [seed, setSeed] = useState(DEFAULT_DATA_SEED)
  const [C, setC] = useState(10)

  // ---- 步进 ----
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const X = useMemo(() => points.map((p) => [p.x, p.y]), [points])
  const y = useMemo(() => points.map((p) => p.label), [points])

  // 数据或 C 变化 → 重新推演出整条迭代序列
  const walk = useMemo(() => (points.length >= 10 ? svmWalkthrough(X, y, C, 0.05, 240) : null), [X, y, C, points.length])
  const totalSteps = walk ? walk.steps.length - 1 : 0
  const curStep = Math.min(step, totalSteps)

  useEffect(() => {
    if (step > totalSteps) setStep(totalSteps)
  }, [totalSteps, step])

  const cur = walk?.steps[curStep]
  const done = curStep >= totalSteps && totalSteps > 0

  // ---- 间隔带底色（|w·z+b| < 1 的格子涂淡靛蓝） ----
  const bandCells = useMemo(() => {
    if (!walk || !cur) return null
    const [m1, m2] = walk.mean
    const [s1, s2] = walk.std
    const [w1, w2] = cur.w
    const cells: number[] = [] // 0=带外A侧 1=带内 2=带外B侧（用于双色淡底）
    for (let r = 0; r < GY; r++) {
      for (let c = 0; c < GX; c++) {
        const x = ((c + 0.5) / GX) * 100
        const yy = ((r + 0.5) / GY) * 100
        const s = w1 * ((x - m1) / s1) + w2 * ((yy - m2) / s2) + cur.b
        cells.push(Math.abs(s) <= 1 ? 1 : s > 1 ? 2 : 0)
      }
    }
    return cells
  }, [walk, cur])

  const lines = useMemo(() => (walk && cur ? svmLines(walk, cur.w, cur.b) : null), [walk, cur])

  const regenerate = (p = preset, n = perClass, nz = noise, sd: number = seed) => {
    setPoints(genPts(p, n, nz, sd))
    setStep(0)
    setPlaying(false)
  }

  // 换种子：重算数据并沿用既有重置逻辑
  const changeSeed = (sd: number) => {
    setSeed(sd)
    regenerate(preset, perClass, noise, sd)
  }

  const xPx = (x: number) => (x / 100) * W
  const yPx = (yy: number) => H - (yy / 100) * H

  const margins = walk?.steps.slice(0, curStep + 1).map((s) => s.margin) ?? []
  const activeSet = new Set(cur?.svIdx ?? [])

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">SVM 逐步推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          SVM 不满足于"分得开"，还要<b className="text-stone-700">分得宽</b>：每一步都在把决策边界往
          "隔离带更宽、闯入者更少"的方向修——像在两排车中间画线，离两边的车越远越安全。
        </p>
        <div className="mt-2">
          <MethodIntroCard id="svm" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：画布 + 间隔宽度曲线 ===== */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">数据画布 · 决策边界与间隔带</CardTitle>
            <p className="text-xs text-stone-500">
              靛蓝实线 = 决策边界（分数 = 0）；两条虚线 = 间隔带边缘（分数 = ±1）；淡色带 = 间隔带，<b>越宽越好</b>；
              带圈点 = 当前"正在起作用"的样本（落在带内或误侧，梯度全靠它们贡献）。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="svm-canvas">
              {/* 间隔带底色 */}
              {bandCells &&
                bandCells.map((v, i) => {
                  if (v !== 1) return null
                  const c = i % GX
                  const r = Math.floor(i / GX)
                  return (
                    <rect
                      key={i}
                      x={(c / GX) * W}
                      y={H - ((r + 1) / GY) * H}
                      width={W / GX + 0.5}
                      height={H / GY + 0.5}
                      fill="rgba(99,102,241,0.10)"
                      data-testid="svm-band"
                    />
                  )
                })}
              {/* 决策边界实线 + 间隔虚线 */}
              {lines?.map(({ v, seg }) =>
                seg ? (
                  <line
                    key={v}
                    x1={xPx(seg.x1)}
                    y1={yPx(seg.y1)}
                    x2={xPx(seg.x2)}
                    y2={yPx(seg.y2)}
                    stroke={v === 0 ? '#4f46e5' : '#818cf8'}
                    strokeWidth={v === 0 ? 2.5 : 1.6}
                    strokeDasharray={v === 0 ? undefined : '6 4'}
                    data-testid={v === 0 ? 'svm-boundary' : 'svm-margin'}
                    className="transition-all duration-200"
                  />
                ) : null,
              )}
              {/* 数据点 */}
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={xPx(p.x)} cy={yPx(p.y)} r={4.5} fill={CLASS_COLORS[p.label]} stroke="#fff" strokeWidth={1.2} />
                  {/* 正在起作用的点（带内/误侧） */}
                  {activeSet.has(i) && !done && (
                    <circle cx={xPx(p.x)} cy={yPx(p.y)} r={8} fill="none" stroke="#f59e0b" strokeWidth={1.8} />
                  )}
                  {/* 收敛后的支持向量：大圆圈 */}
                  {activeSet.has(i) && done && (
                    <circle cx={xPx(p.x)} cy={yPx(p.y)} r={9.5} fill="none" stroke="#4f46e5" strokeWidth={2.2} data-testid="svm-sv" />
                  )}
                </g>
              ))}
              <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#a8a29e">
                特征 x₁
              </text>
              <text x={10} y={H / 2} fontSize={11} fill="#a8a29e" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">
                特征 x₂
              </text>
            </svg>

            {/* 间隔宽度曲线 */}
            <div>
              <p className="mb-1 text-sm font-medium text-stone-700">
                间隔宽度曲线（2 / ‖w‖）
                <span className="ml-2 text-xs font-normal text-stone-400">带越宽 = 离两边样本越远 = 越安全</span>
              </p>
              {margins.length > 1 ? (
                <CurveChart
                  xs={margins.map((_, i) => i)}
                  series={[{ ys: margins, color: '#4f46e5', label: '间隔宽度' }]}
                  markers={[{ x: curStep, color: '#f97316', label: cur?.margin.toFixed(2) }]}
                  width={520}
                  height={170}
                  xLabel="迭代轮数"
                  xFormat={(v) => v.toFixed(0)}
                />
              ) : (
                <p className="rounded bg-stone-50 p-3 text-xs text-stone-400">点"下一步"开始迭代，间隔宽度会随步增长。</p>
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
                seed={seed}
                onSeed={changeSeed}
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
                hint="默认「线性可分」是 SVM 的主场"
              />
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">算法</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SliderRow
                label="惩罚系数 C"
                value={C}
                min={0.1}
                max={30}
                step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => {
                  setC(v)
                  setStep(0)
                  setPlaying(false)
                }}
              />
              <p className="text-xs leading-5 text-stone-500">
                C = 对"闯入间隔带"的容忍度。C 调小（如 0.5）：容忍更多点进带，边界更"佛系"、带更宽；
                C 调大（如 30）：一点点 violation 都不肯忍，带修窄、边界被个别点牵着走。改 C 后从头推演对比看看。
              </p>
            </CardContent>
          </Card>

          <StepControls
            step={curStep}
            totalSteps={totalSteps}
            playing={playing}
            onStep={setStep}
            onPlaying={setPlaying}
            intervalMs={60}
            extra={
              done ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700" data-testid="svm-done">
                  {walk?.converged ? '已收敛' : '已达步数上限'}
                </span>
              ) : undefined
            }
          >
            {cur && (
              <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm">
                <p className="font-medium text-indigo-900" data-testid="svm-step-label">
                  {curStep === 0 ? '第 0 步：随机画一条线' : `第 ${curStep} 步：一次次梯度迭代`}
                </p>
                {curStep === 0 && (
                  <p className="text-xs leading-5 text-stone-600">
                    先随便画一条线（w、b 取随机值），此时间隔带窄、一堆点闯进带里。接下来每一步：正则项把 w 往短了压（带变宽），
                    被闯入的样本把边界往外推（减少误伤）。
                  </p>
                )}
                <div className="grid grid-cols-1 gap-x-3 gap-y-1 font-mono sm:grid-cols-2 text-xs text-stone-700">
                  <span>
                    迭代轮数 = <b className="text-indigo-700">{curStep}</b>
                  </span>
                  <span>
                    训练准确率 = <b className="text-indigo-700">{(cur.acc * 100).toFixed(1)}%</b>
                  </span>
                  <span>
                    间隔宽度 = <b className="text-emerald-700">{cur.margin.toFixed(3)}</b>
                  </span>
                  <span>
                    违反间隔样本 = <b className="text-amber-600">{cur.viol}</b> 个
                  </span>
                  <span className="col-span-2">
                    hinge 损失 ≈ <b className="text-orange-600">{cur.hinge.toFixed(4)}</b>
                    <span className="ml-1 font-sans text-stone-400">（带内/误侧点"闯进来多深"的平均）</span>
                  </span>
                </div>
                {done && (
                  <p className="rounded-md bg-white px-2 py-1.5 text-xs leading-5 text-emerald-800 ring-1 ring-emerald-200">
                    🎯 <b>支持向量揭晓：</b>画布上被大圆圈标出的 {cur.svIdx.length} 个点就是支持向量——只有它们决定边界的位置，
                    其余 {points.length - cur.svIdx.length} 个点即使删掉，结果也几乎不变。这就是"支持向量机"名字的由来。
                  </p>
                )}
              </div>
            )}
          </StepControls>
        </div>
      </div>

      {/* ===== 讲解卡 ===== */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 最大间隔：马路中间画线</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              两类样本就像马路两侧停的车。分界线画在哪都行，但画在<b>正中间</b>最保险——新来一辆车（新样本）稍微停歪一点也不至于越界。
              这个"到两边最近车辆的距离"就是<b>间隔</b>，SVM 要找的是让间隔最宽的那条线。
            </p>
            <p>
              数学上间隔宽度 = 2 / ‖w‖：w 是边界的法向量（垂直于边界的那条），它越<b>短</b>带越宽。
              所以训练目标里有一项"把 w 往短了压"（正则项），另一项"谁闯进带里就推谁"（hinge 损失），两股力拔河的结果就是你在推演里看到的每一步。
            </p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 为什么 SVM 适合小样本？</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              别的模型要"记住"全部训练数据的规律，SVM 只依赖<b>少数几个支持向量</b>——样本再少，只要边界附近那几个关键点在，边界就能定下来。
              需要估计的参数少，自然不容易被小样本里的噪声带偏。
            </p>
            <p>
              高维场景（特征比样本还多，比如文本、基因数据）里，"最大间隔"相当于自带一道保险：
              无数条线都能分开训练集，SVM 挑的是<b>离所有点都最远</b>的那条，对新数据更稳。
              代价是它不直接输出概率，数据量一大训练也慢——那是逻辑回归和树模型的主场。
            </p>
          </CardContent>
        </Card>
      </div>

      <ThinkBox
        questions={[
          '把 C 从 10 调到 0.3 再自动播放：间隔带变宽了还是变窄了？违反间隔的样本数怎么变？"佛系"的代价是什么？',
          '收敛后盯着大圆圈标出的支持向量：把噪声滑块调大重新生成，支持向量的数量会变多还是变少？为什么？',
          '换成"月牙"数据集，线性 SVM 的准确率还剩多少？如果想让 SVM 也能画弯边界，你猜"核技巧"大致是干什么的？',
        ]}
      />
    </div>
  )
}
