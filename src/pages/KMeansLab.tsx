// 模块五：K-Means 聚类推演（分步执行：分配点 / 更新质心）—— 聚类实验的子页签一
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import { MethodIntroCard } from '@/components/MethodIntro'
import { assignPoints, updateCentroids, randomCentroids, maxShift, CLUSTER_COLORS, type Centroid } from '@/lib/kmeans'
import { genKMPreset, KM_PRESET_NAMES, type KMPreset, type RawPt } from '@/lib/datasets'
import ClusterEvalPanel from '@/components/ClusterEvalPanel'
import { Crosshair, Dices, Play, Pause, RotateCcw, MousePointerClick } from 'lucide-react'

const W = 520
const H = 420
const MAX_ITERS = 30

export default function KMeansLab() {
  // ---- 数据 ----
  const [preset, setPreset] = useState<KMPreset>('blobs')
  const [perGroup, setPerGroup] = useState(50)
  const [noise, setNoise] = useState(4)
  const [points, setPoints] = useState<RawPt[]>(() => genKMPreset('blobs', 50, 4))
  const [addPointMode, setAddPointMode] = useState(false)

  // ---- K-Means 状态 ----
  const [k, setK] = useState(3)
  const [placeMode, setPlaceMode] = useState(false) // 放置质心模式
  const [centroids, setCentroids] = useState<Centroid[]>([])
  const [assignment, setAssignment] = useState<number[] | null>(null)
  const [sseHistory, setSseHistory] = useState<number[]>([])
  const [iteration, setIteration] = useState(0)
  const [converged, setConverged] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'assigned' | 'updated'>('idle')
  const [lastShift, setLastShift] = useState<number | null>(null) // 上一轮更新质心的最大移动距离（解说条用）
  const [showLines, setShowLines] = useState(true)
  const [running, setRunning] = useState(false)

  const resetRun = () => {
    setAssignment(null)
    setSseHistory([])
    setIteration(0)
    setConverged(false)
    setPhase('idle')
    setLastShift(null)
    setRunning(false)
  }

  const regenerate = (p: KMPreset = preset, n: number = perGroup, nz: number = noise) => {
    setPoints(genKMPreset(p, n, nz))
    setCentroids([])
    resetRun()
  }

  // K 变化时裁剪质心
  useEffect(() => {
    setCentroids((cs) => cs.slice(0, k))
    resetRun()
  }, [k])

  // 自动运行：交替 分配 → 更新，直到收敛
  useEffect(() => {
    if (!running) return
    if (converged || iteration >= MAX_ITERS || centroids.length < k) {
      setRunning(false)
      return
    }
    const timer = setTimeout(() => {
      if (phase === 'idle' || phase === 'updated') doAssign()
      else doUpdate()
    }, 700)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase, centroids, converged, iteration, k])

  const doAssign = () => {
    if (centroids.length < k || points.length === 0) return
    const { assignment: a, sse } = assignPoints(points, centroids)
    setAssignment(a)
    setSseHistory((h) => [...h, sse])
    setPhase('assigned')
  }

  const doUpdate = () => {
    if (!assignment) return
    const next = updateCentroids(points, assignment, centroids)
    const shift = maxShift(centroids, next)
    setLastShift(shift)
    setCentroids(next)
    setIteration((i) => i + 1)
    if (shift < 0.3) {
      // 收敛：用新质心做最后一次分配并记录 SSE
      const { assignment: a, sse } = assignPoints(points, next)
      setAssignment(a)
      setSseHistory((h) => [...h, sse])
      setConverged(true)
      setPhase('assigned')
      setRunning(false)
    } else {
      setPhase('updated')
    }
  }

  const doInit = () => {
    resetRun()
    const { assignment: a, sse } = assignPoints(points, centroids)
    setAssignment(a)
    setSseHistory([sse])
    setPhase('assigned')
  }

  // 画布点击：放置质心 或 加点
  const svgRef = useRef<SVGSVGElement>(null)
  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = 100 - ((e.clientY - rect.top) / rect.height) * 100
    if (placeMode) {
      setCentroids((cs) => {
        const next = cs.length >= k ? [...cs.slice(1), { x, y }] : [...cs, { x, y }]
        return next
      })
      resetRun()
    } else if (addPointMode) {
      setPoints((pts) => [...pts, { x, y }])
      resetRun()
    }
  }

  const xPx = (x: number) => (x / 100) * W
  const yPx = (y: number) => H - (y / 100) * H

  const sseChart = useMemo(() => {
    const xs = sseHistory.map((_, i) => i)
    return { xs: xs.length > 1 ? xs : [0, 1], ys: sseHistory.length > 1 ? sseHistory : [...sseHistory, sseHistory[0] ?? 0] }
  }, [sseHistory])

  const ready = centroids.length === k && points.length > 0

  // ---- 每步大白话解说条 ----
  const curSse = sseHistory.length > 0 ? sseHistory[sseHistory.length - 1] : null
  const narration = converged
    ? `收敛 ✓ 质心几乎不再挪动（移动 < 0.3），"食堂选址"定了！共 ${iteration} 轮，最终 SSE = ${curSse?.toFixed(0)}。换个初始质心位置再跑一次——结果可能完全不同，这就是局部最优。`
    : phase === 'assigned'
      ? `分配步 ✓ 每个点投奔离自己最近的质心——就像选离家最近的食堂。当前 SSE = ${curSse?.toFixed(0)}。接着点「更新质心」。`
      : phase === 'updated'
        ? `更新步 ✓ 质心搬到新成员的平均位置——新食堂开在食客中心。本轮质心最大移动 ${lastShift?.toFixed(2)}，还没停稳，继续「分配点」。`
        : ready
          ? `质心就位（${centroids.length}/${k}）。点「初始化」让每个点先投奔最近的质心，然后"分配 → 更新"反复交替。`
          : `先放置 ${k} 个质心（画布上手动点，或点右侧「随机放置」），再开始推演。`

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">K-Means 推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          K-Means 就像"开食堂"：先随便选 K 个位置开临时食堂（质心），每个人去离自己最近的食堂吃饭（分配），
          食堂再搬到食客们的平均位置（更新），反复几轮就稳定了。<b className="text-stone-700">食堂最初开在哪，结果可能完全不同。</b>
        </p>
        <div className="mt-2">
          <MethodIntroCard id="kmeans" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：画布 ===== */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base text-stone-800">
              <span>数据画布</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={placeMode ? 'default' : 'outline'}
                  className={placeMode ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                  onClick={() => {
                    setPlaceMode(!placeMode)
                    setAddPointMode(false)
                  }}
                >
                  <Crosshair className="mr-1 h-3.5 w-3.5" />
                  {placeMode ? '放置质心中…' : '放置质心'}
                </Button>
                <Button
                  size="sm"
                  variant={addPointMode ? 'default' : 'outline'}
                  className={addPointMode ? 'bg-orange-500 hover:bg-orange-600' : ''}
                  onClick={() => {
                    setAddPointMode(!addPointMode)
                    setPlaceMode(false)
                  }}
                >
                  <MousePointerClick className="mr-1 h-3.5 w-3.5" />
                  {addPointMode ? '加点中…' : '点击加点'}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <svg
              ref={svgRef}
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              className={`max-w-full rounded-lg border border-stone-200 bg-white ${placeMode || addPointMode ? 'cursor-crosshair' : ''}`}
              onClick={onCanvasClick}
            >
              {/* 点与质心的连线 */}
              {showLines &&
                assignment &&
                points.map((p, i) => {
                  const c = centroids[assignment[i]]
                  if (!c) return null
                  return (
                    <line
                      key={`l-${i}`}
                      x1={xPx(p.x)}
                      y1={yPx(p.y)}
                      x2={xPx(c.x)}
                      y2={yPx(c.y)}
                      stroke={CLUSTER_COLORS[assignment[i] % CLUSTER_COLORS.length]}
                      strokeOpacity={0.15}
                    />
                  )
                })}
              {/* 数据点 */}
              {points.map((p, i) => {
                const color = assignment ? CLUSTER_COLORS[assignment[i] % CLUSTER_COLORS.length] : '#a8a29e'
                return (
                  <circle
                    key={i}
                    cx={xPx(p.x)}
                    cy={yPx(p.y)}
                    r={4}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={1}
                    className="transition-colors duration-300"
                  />
                )
              })}
              {/* 质心（用 transform 平移以便 CSS 过渡动画） */}
              {centroids.map((c, i) => (
                <g
                  key={i}
                  transform={`translate(${xPx(c.x)}, ${yPx(c.y)})`}
                  className="transition-transform duration-500 ease-out"
                >
                  <circle r={11} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} stroke="#1c1917" strokeWidth={2} />
                  <line x1={-5} y1={-5} x2={5} y2={5} stroke="#fff" strokeWidth={2.2} />
                  <line x1={-5} y1={5} x2={5} y2={-5} stroke="#fff" strokeWidth={2.2} />
                </g>
              ))}
              {placeMode && (
                <text x={W / 2} y={20} textAnchor="middle" fontSize={12} fill="#4f46e5" className="select-none">
                  点击画布放置质心（还需 {Math.max(0, k - centroids.length)} 个，超出后新点会替换最早的）
                </text>
              )}
            </svg>

            {/* 当前步解说条 */}
            <p
              className={`mt-3 rounded-lg px-3 py-2.5 text-sm leading-6 ${converged ? 'bg-emerald-50 text-emerald-900' : 'bg-indigo-50 text-indigo-900'}`}
              data-testid="kmeans-narration"
            >
              {narration}
            </p>

            {/* 状态行 */}
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-stone-50 py-2">
                <p className="text-xs text-stone-500">迭代轮数</p>
                <p className="font-mono text-lg font-bold text-indigo-700">{iteration}</p>
              </div>
              <div className="rounded-lg bg-stone-50 py-2">
                <p className="text-xs text-stone-500">当前 SSE</p>
                <p className="font-mono text-lg font-bold text-indigo-700">
                  {sseHistory.length > 0 ? sseHistory[sseHistory.length - 1].toFixed(0) : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-stone-50 py-2">
                <p className="text-xs text-stone-500">状态</p>
                <p className={`text-lg font-bold ${converged ? 'text-emerald-600' : 'text-stone-600'}`}>
                  {converged ? '已收敛 ✓' : phase === 'idle' ? '未开始' : phase === 'assigned' ? '已分配' : '已更新质心'}
                </p>
              </div>
            </div>

            {/* SSE 曲线 */}
            <div className="mt-3">
              <p className="mb-1 text-xs text-stone-500">
                SSE（簇内平方和）随迭代下降：每个点到自己质心的距离平方之和，K-Means 每一步都在让它变小。
              </p>
              <CurveChart
                xs={sseChart.xs}
                series={[{ ys: sseChart.ys, color: '#4f46e5' }]}
                xLabel="分配步序号"
                yLabel="SSE"
                xFormat={(v) => v.toFixed(0)}
                height={160}
                markers={converged && sseHistory.length > 1 ? [{ x: sseHistory.length - 1, color: '#059669', label: '收敛' }] : []}
              />
            </div>
          </CardContent>
        </Card>

        {/* ===== 右侧：控制面板 ===== */}
        <div className="space-y-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">数据</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(KM_PRESET_NAMES) as KMPreset[]).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={preset === p ? 'default' : 'outline'}
                    className={preset === p ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                    onClick={() => {
                      setPreset(p)
                      regenerate(p)
                    }}
                  >
                    {KM_PRESET_NAMES[p]}
                  </Button>
                ))}
              </div>
              <SliderRow label="每组点数" value={perGroup} min={20} max={100} step={5} onChange={setPerGroup} />
              <SliderRow label="噪声强度" value={noise} min={0} max={30} step={1} onChange={setNoise} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => regenerate()}>
                  按当前设置生成
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPoints([])
                    setCentroids([])
                    resetRun()
                  }}
                >
                  清空画布
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">K-Means 控制</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SliderRow label="簇数 K" value={k} min={2} max={6} onChange={setK} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-600">已放置质心</span>
                <span className={`font-mono font-semibold ${ready ? 'text-emerald-600' : 'text-orange-600'}`}>
                  {centroids.length} / {k}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={points.length === 0}
                onClick={() => {
                  setCentroids(randomCentroids(points, k))
                  resetRun()
                }}
              >
                <Dices className="mr-1 h-3.5 w-3.5" />
                随机放置 K 个质心
              </Button>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled={!ready} onClick={doInit}>
                  初始化
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!ready || converged || phase === 'assigned'}
                  onClick={doAssign}
                >
                  分配点
                </Button>
                <Button size="sm" variant="outline" disabled={phase !== 'assigned' || converged} onClick={doUpdate}>
                  更新质心
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!ready || converged}
                  onClick={() => {
                    if (phase === 'idle') doInit()
                    setRunning(!running)
                  }}
                >
                  {running ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                  自动运行
                </Button>
              </div>
              <Button size="sm" variant="ghost" className="w-full" onClick={resetRun}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                重置运行（保留质心位置）
              </Button>
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <Checkbox checked={showLines} onCheckedChange={(v) => setShowLines(v === true)} />
                显示点与质心的连线
              </label>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-900">
            <b>试一试：</b>用"三个团簇"数据，把 3 个质心<b>全部放在同一个团簇里</b>再自动运行——
            看看最后收敛到什么"糟糕"结果，SSE 是不是比正常情况高很多？这就是 K-Means 的<b>局部最优</b>陷阱。
          </div>
        </div>
      </div>

      {/* 聚类评估小面板（随分配结果实时重算） */}
      <ClusterEvalPanel points={points} labels={assignment} showKHelper />

      <ThinkBox
        questions={[
          '观察 SSE 曲线：它会不会出现上升？为什么 K-Means 每轮迭代一定不会让 SSE 变大？',
          '换成"同心圆环"数据，无论质心怎么放，K-Means 能把圆环和中心分成两簇吗？为什么？（提示：它只认"距离最近"）',
          '在"月牙双弧"数据上把 K 调成 2，结果符合你的预期吗？什么形状的簇是 K-Means 搞不定的？',
          '同样的数据，用不同初始质心各跑 3 次，SSE 一样吗？这说明初始位置有多重要？',
        ]}
      />
    </div>
  )
}
