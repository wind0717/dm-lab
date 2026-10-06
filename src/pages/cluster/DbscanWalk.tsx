// DBSCAN 逐步推演：每一步 = 处理一个点（新检查 / 扩散队列）
// 画布：ε 虚线圈 + 核心/边界/噪声三样式 + 扩散队列与邻居高亮（沿用工作台视觉）
// 重点：每步大白话解说条 + 结束态统计卡 + 评估面板
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import StepControls from '@/components/StepControls'
import ClusterEvalPanel from '@/components/ClusterEvalPanel'
import { MethodIntroCard } from '@/components/MethodIntro'
import { ClusterWalkDataPanel, genClusterPts } from '@/pages/cluster/clusterShared'
import { createDbscan, dbscanStep, type DbscanState } from '@/lib/dbscan'
import { CLUSTER_COLORS } from '@/lib/kmeans'
import type { KMPreset, RawPt } from '@/lib/datasets'
import { DEFAULT_DATA_SEED } from '@/lib/datasets'
import { Zap } from 'lucide-react'

const W = 520
const H = 420

/** 由前后两个状态生成这一步的大白话解说 */
function narrate(prev: DbscanState, cur: DbscanState): string {
  const eps = cur.eps
  const minPts = cur.minPts
  if (cur.done) {
    return `全部点处理完毕 ✓ 一共分出 ${cur.clusterCount} 个簇。看看下方统计：多少核心点、边界点、噪声点？灰色 × 的噪声点就是"离群点"——异常检测就靠它们。`
  }
  const p = cur.current
  if (p === null) return ''
  const nb = cur.currentNeighbors.length
  const label = cur.labels[p]

  if (prev.queue.length === 0) {
    // ---- 新检查一个点 ----
    if (cur.isCore[p]) {
      return `现在检查点 #${p}：以 ε=${eps} 为半径画个圈（虚线圆）。圈里有 ${nb} 个点 ≥ minPts(${minPts}) → 它是核心点，新簇 ${cur.clusterCount} 诞生！圈里的邻居都并入簇 ${cur.clusterCount}，排队等待继续向外扩散。`
    }
    return `现在检查点 #${p}：以 ε=${eps} 为半径画个圈，圈里只有 ${nb} 个点 < minPts(${minPts}) → 它暂时被标为噪声（灰色 ×）。别急着下结论——之后它可能被附近长起来的簇"吸收"回去。`
  }
  // ---- 扩散步：处理队列里的点 ----
  const wasNoise = prev.visited[p] && prev.labels[p] === -1
  if (prev.visited[p] && prev.labels[p] >= 0) {
    return `轮到队列里的点 #${p}：它已经在簇 ${prev.labels[p] + 1} 里了，跳过。`
  }
  if (cur.isCore[p]) {
    return wasNoise
      ? `轮到队列里的点 #${p}：它之前被暂标为噪声，现在被簇 ${label + 1} 吸收回去了；而且它圈里有 ${nb} 个点 ≥ minPts(${minPts})，自己也是核心点 → 继续向外扩散！`
      : `轮到队列里的点 #${p}：它圈里有 ${nb} 个点 ≥ minPts(${minPts}) → 也是核心点，并入簇 ${label + 1}，圈里的新邻居入队，簇继续向外长大。`
  }
  return wasNoise
    ? `轮到队列里的点 #${p}：它之前被暂标为噪声，现在被簇 ${label + 1} 吸收为边界点（圈里只有 ${nb} 个点，不够热闹，不再扩散）——噪声也有被"拯救"的机会。`
    : `轮到队列里的点 #${p}：圈里只有 ${nb} 个点 < minPts(${minPts}) → 边界点，算簇 ${label + 1} 的人，但它不再向外扩散（簇的"边境线"到这里为止）。`
}

export default function DbscanWalk() {
  // ---- 数据 ----
  const [preset, setPreset] = useState<KMPreset>('rings')
  const [perGroup, setPerGroup] = useState(60)
  const [noise, setNoise] = useState(2)
  const [points, setPoints] = useState<RawPt[]>(() => genClusterPts('rings', 60, 2))
  const [seed, setSeed] = useState(DEFAULT_DATA_SEED)

  // ---- 参数 ----
  const [eps, setEps] = useState(7)
  const [minPts, setMinPts] = useState(4)

  // ---- 步进（整条序列预计算，支持上一步/自动播放） ----
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const steps = useMemo(() => {
    const seq: DbscanState[] = [createDbscan(points, eps, minPts)]
    let guard = points.length * 5 + 200
    while (!seq[seq.length - 1].done && guard-- > 0) seq.push(dbscanStep(seq[seq.length - 1]))
    return seq
  }, [points, eps, minPts])

  const narrations = useMemo(() => {
    const out: string[] = [
      points.length === 0
        ? '画布上还没有点，先在上方选数据集生成。'
        : `准备好了：共 ${points.length} 个点，ε=${eps}、minPts=${minPts}。点「下一步」或「自动播放」——算法会逐个检查每个点：以它为圆心画 ε 圈，看圈里热不热闹。`,
    ]
    for (let i = 1; i < steps.length; i++) out.push(narrate(steps[i - 1], steps[i]))
    return out
  }, [steps, points.length, eps, minPts])

  const totalSteps = steps.length - 1
  const curStep = Math.min(step, totalSteps)
  const cur = steps[curStep]

  // 数据/参数变化 → 回到第 0 步
  useEffect(() => {
    setStep(0)
    setPlaying(false)
  }, [steps])

  const regenerate = (p = preset, n = perGroup, nz = noise, sd: number = seed) => {
    setPoints(genClusterPts(p, n, nz, sd))
  }

  // 换种子：重算数据并沿用既有重置逻辑
  const changeSeed = (sd: number) => {
    setSeed(sd)
    regenerate(preset, perGroup, noise, sd)
  }

  const done = cur.done
  const xPx = (x: number) => (x / 100) * W
  const yPx = (y: number) => H - (y / 100) * H

  const stats = useMemo(() => {
    if (!done) return null
    const core = cur.isCore.filter(Boolean).length
    const noiseN = cur.labels.filter((l) => l === -1).length
    return { clusters: cur.clusterCount, core, border: points.length - core - noiseN, noise: noiseN }
  }, [done, cur, points.length])

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">DBSCAN 逐步推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          DBSCAN 用"密度"说话：每个点画一个 ε 圈，圈里够热闹（≥ minPts）的就是核心点，核心点的圈叠圈就连成一整个簇——
          <b className="text-stone-700">不需要预先告诉它分几类</b>。默认数据是「同心圆环」，这正是 K-Means 搞不定、DBSCAN 一招制胜的形状。
        </p>
        <div className="mt-2">
          <MethodIntroCard id="dbscan" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：画布 ===== */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">数据画布 · ε 圈与密度扩散</CardTitle>
            <p className="text-xs text-stone-500">
              虚线圆 = 当前点的 ε 邻域；<b>深色描边大点 = 核心点</b>，半透点 = 边界点，灰色 × = 噪声；
              蓝圈 = 圈里的邻居，虚线圈 = 排队等待扩散的点。
            </p>
          </CardHeader>
          <CardContent>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="dbscan-walk-canvas">
              {/* 当前点的 ε 半径圆 */}
              {cur.current !== null && !done && (
                <circle
                  cx={xPx(points[cur.current].x)}
                  cy={yPx(points[cur.current].y)}
                  r={(cur.eps / 100) * W}
                  fill="#4f46e5"
                  fillOpacity={0.06}
                  stroke="#4f46e5"
                  strokeDasharray="4 3"
                  strokeWidth={1.2}
                />
              )}
              {/* 数据点 */}
              {points.map((p, i) => {
                let fill: string = '#d6d3d1'
                let r = 4
                let isNoiseX = false
                if (cur.visited[i]) {
                  if (cur.labels[i] === -1) {
                    isNoiseX = true
                  } else {
                    fill = CLUSTER_COLORS[cur.labels[i] % CLUSTER_COLORS.length]
                    r = cur.isCore[i] ? 5.5 : 4
                  }
                }
                return (
                  <g key={i}>
                    {isNoiseX ? (
                      <g stroke="#a8a29e" strokeWidth={1.8} data-testid="dbscan-noise">
                        <line x1={xPx(p.x) - 4} y1={yPx(p.y) - 4} x2={xPx(p.x) + 4} y2={yPx(p.y) + 4} />
                        <line x1={xPx(p.x) - 4} y1={yPx(p.y) + 4} x2={xPx(p.x) + 4} y2={yPx(p.y) - 4} />
                      </g>
                    ) : (
                      <circle
                        cx={xPx(p.x)}
                        cy={yPx(p.y)}
                        r={r}
                        fill={fill}
                        fillOpacity={cur.visited[i] && cur.labels[i] >= 0 && !cur.isCore[i] ? 0.55 : 1}
                        stroke={cur.isCore[i] ? '#1c1917' : '#fff'}
                        strokeWidth={cur.isCore[i] ? 1.4 : 1}
                        className="transition-colors duration-200"
                      />
                    )}
                    {/* 队列中的点：靛蓝虚线细环 */}
                    {cur.queue.includes(i) && (
                      <circle cx={xPx(p.x)} cy={yPx(p.y)} r={8} fill="none" stroke="#818cf8" strokeWidth={1} strokeDasharray="2 2" />
                    )}
                    {/* 当前点的邻居：蓝圈 */}
                    {cur.currentNeighbors.includes(i) && cur.current !== i && !done && (
                      <circle cx={xPx(p.x)} cy={yPx(p.y)} r={7.5} fill="none" stroke="#4f46e5" strokeWidth={1.2} opacity={0.7} />
                    )}
                  </g>
                )
              })}
              {/* 当前点大高亮环 */}
              {cur.current !== null && !done && (
                <circle
                  cx={xPx(points[cur.current].x)}
                  cy={yPx(points[cur.current].y)}
                  r={10}
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  className="animate-pulse"
                />
              )}
            </svg>
            {/* 图例 */}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-stone-700 bg-indigo-400" /> 核心点
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-400/50" /> 边界点
              </span>
              <span className="flex items-center gap-1">
                <span className="font-mono text-stone-400">×</span> 噪声
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-indigo-400" /> 扩散队列
              </span>
              <span className="ml-auto font-mono text-stone-400">
                已处理 {cur.visited.filter(Boolean).length}/{points.length}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ===== 右侧：数据 + 参数 + 步进 ===== */}
        <div className="space-y-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">数据</CardTitle>
            </CardHeader>
            <CardContent>
              <ClusterWalkDataPanel
                seed={seed}
                onSeed={changeSeed}
                preset={preset}
                perGroup={perGroup}
                noise={noise}
                onPreset={(p) => {
                  setPreset(p)
                  regenerate(p)
                }}
                onPerGroup={setPerGroup}
                onNoise={setNoise}
                onRegen={() => regenerate()}
                hint="同心圆环是 DBSCAN 的主场"
              />
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">参数</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SliderRow label="邻域半径 ε" value={eps} min={2} max={16} step={0.5} onChange={setEps} format={(v) => v.toFixed(1)} />
              <SliderRow label="密度阈值 minPts" value={minPts} min={2} max={10} onChange={setMinPts} />
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                ε = "离得多近算邻居"；minPts = "至少几个邻居才算自己人"。ε 越大簇越少，minPts 越大噪声越多。
                <b>改参数后推演自动重置</b>，从头再看一遍。
              </p>
            </CardContent>
          </Card>

          <StepControls
            step={curStep}
            totalSteps={totalSteps}
            playing={playing}
            onStep={setStep}
            onPlaying={setPlaying}
            intervalMs={90}
            extra={
              done ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700" data-testid="dbscan-done">
                  已完成
                </span>
              ) : undefined
            }
          >
            {/* 每步大白话解说条 */}
            <p
              className={`rounded-lg px-3 py-2.5 text-sm leading-6 ${done ? 'bg-emerald-50 text-emerald-900' : 'bg-indigo-50 text-indigo-900'}`}
              data-testid="dbscan-narration"
            >
              {narrations[curStep]}
            </p>
            {!done && totalSteps > 0 && (
              <Button size="sm" variant="ghost" className="text-stone-500" onClick={() => setStep(totalSteps)} data-testid="walk-finish">
                <Zap className="mr-1 h-3.5 w-3.5" />
                跳到最终结果
              </Button>
            )}
          </StepControls>
        </div>
      </div>

      {/* ===== 结束态统计卡 ===== */}
      {stats && (
        <Card className="border-stone-200 shadow-sm" data-testid="dbscan-stats">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">结果统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              <div className="rounded-lg bg-stone-50 py-3">
                <p className="text-xs text-stone-500">簇数（自动长出）</p>
                <p className="font-mono text-2xl font-bold text-indigo-700">{stats.clusters}</p>
              </div>
              <div className="rounded-lg bg-stone-50 py-3">
                <p className="text-xs text-stone-500">核心点</p>
                <p className="font-mono text-2xl font-bold text-indigo-700">{stats.core}</p>
              </div>
              <div className="rounded-lg bg-stone-50 py-3">
                <p className="text-xs text-stone-500">边界点</p>
                <p className="font-mono text-2xl font-bold text-stone-600">{stats.border}</p>
              </div>
              <div className="rounded-lg bg-stone-50 py-3">
                <p className="text-xs text-stone-500">噪声点（离群）</p>
                <p className="font-mono text-2xl font-bold text-orange-600">{stats.noise}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== 聚类评估 ===== */}
      <ClusterEvalPanel points={points} labels={done ? cur.labels : null} />

      {/* ===== 讲解卡 ===== */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 不用告诉它分几类</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              K-Means 开口第一句就是"K 取几？"——分几类得你说了算。<b>DBSCAN 根本不需要这个问题</b>：
              簇是密度"长"出来的，数据里有几片高密度区域，就自动分出几簇。这是它和 K-Means 最大的不同。
            </p>
            <p>
              代价是换来了两个新旋钮：ε 和 minPts。ε 太小 → 谁都够不着，满屏噪声；ε 太大 → 所有簇被强行并成一家。
              调参数时盯着画布上 ε 圈的大小变化，比背规则管用。
            </p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 噪声点 = 白送的异常检测</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              别的算法把噪声当麻烦，DBSCAN 把噪声当成果：那些不属于任何簇的灰色 ×，正是<b>离群点</b>——
              和大多数人"不一样"的少数派。
            </p>
            <p>
              这在业务里直接就是异常检测：<b>交易欺诈</b>（正常交易聚成簇，孤零零那笔就是可疑的）、
              <b>异常日志</b>（常规请求连成一片，突兀的访问模式值得报警）、设备传感器的异常读数。
              聚类顺手做的事，单独立项都能当一个项目。
            </p>
          </CardContent>
        </Card>
      </div>

      <ThinkBox
        questions={[
          '在「同心圆环」上把 ε 从 4 慢慢调到 12：簇数和噪声数怎么变？ε 调到多大时两个簇被并成一个？',
          'minPts 从 4 调到 8 再跑一遍「三个团簇」：边界点和噪声变多了还是变少了？为什么"自己人"的门槛越高，被错杀的越多？',
          '对比 K-Means 推演页：同一份「月牙双弧」数据，为什么 K-Means 怎么切都不对，DBSCAN 调一调 ε 就能对？"距离最近"和"密度连着"差别在哪？（提示：月牙太稀时会断成几截——把每组点数调大再看）',
        ]}
      />
    </div>
  )
}
