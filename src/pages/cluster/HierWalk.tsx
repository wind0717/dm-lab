// 层次聚类（凝聚式）逐步推演：每一步 = 合并距离最近的两簇
// 画布合并闪烁 + 树状图同步生长；完成后"切一刀"高度滑块实时决定簇数
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import StepControls from '@/components/StepControls'
import ClusterEvalPanel from '@/components/ClusterEvalPanel'
import Dendrogram from '@/components/Dendrogram'
import { MethodIntroCard } from '@/components/MethodIntro'
import { ClusterWalkDataPanel, genClusterPts } from '@/pages/cluster/clusterShared'
import { agglomerative, cutTree, labelsAfterMerges, LINKAGE_NAMES, type HcResult, type Linkage } from '@/lib/hierarchical'
import { CLUSTER_COLORS } from '@/lib/kmeans'
import type { KMPreset, RawPt } from '@/lib/datasets'
import { Scissors, Zap } from 'lucide-react'

const W = 520
const H = 420
const MAX_N = 300

/** 想恰好切成 k 簇，"切一刀"应放在的高度（第 n-k-1 次与第 n-k 次合并距离的中点） */
function heightForK(hier: HcResult, k: number): number {
  const n = hier.n
  const kk = Math.max(1, Math.min(k, n))
  const s = n - kk // 要执行的合并次数
  if (s <= 0) return 0
  if (s >= hier.merges.length) return hier.maxDist
  return +((hier.merges[s - 1].distance + hier.merges[s].distance) / 2).toFixed(1)
}

export default function HierWalk() {
  // ---- 数据 ----
  const [preset, setPreset] = useState<KMPreset>('blobs')
  const [perGroup, setPerGroup] = useState(25)
  const [noise, setNoise] = useState(4)
  const [points, setPoints] = useState<RawPt[]>(() => genClusterPts('blobs', 25, 4))

  // ---- 参数 ----
  const [linkage, setLinkage] = useState<Linkage>('average')

  // ---- 步进 ----
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [cutHeight, setCutHeight] = useState(0)
  const [cutTouched, setCutTouched] = useState(false)

  const hierPts = useMemo(() => points.slice(0, MAX_N), [points])
  const truncated = points.length > MAX_N
  const hier = useMemo(() => agglomerative(hierPts, linkage), [hierPts, linkage])

  const totalSteps = hier.merges.length // = n - 1
  const curStep = Math.min(step, totalSteps)
  const done = totalSteps > 0 && curStep >= totalSteps

  // 数据/linkage 变化 → 回到第 0 步
  useEffect(() => {
    setStep(0)
    setPlaying(false)
    setCutHeight(0)
    setCutTouched(false)
  }, [hier])

  // 完成后自动建议一个切割高度（切成 3 簇）
  useEffect(() => {
    if (done && !cutTouched) setCutHeight(heightForK(hier, 3))
  }, [done, cutTouched, hier])

  const cut = useMemo(() => (done ? cutTree(hier, cutHeight) : null), [done, hier, cutHeight])
  const animLabels = useMemo(() => (!done && totalSteps > 0 ? labelsAfterMerges(hier, curStep) : null), [done, totalSteps, hier, curStep])

  const lastMerge = curStep > 0 && curStep <= totalSteps ? hier.merges[curStep - 1] : null

  // ---- 每步大白话解说 ----
  const narration = useMemo(() => {
    if (totalSteps === 0) return '画布上点太少，请先生成数据。'
    if (curStep === 0) {
      return `开始：每个点自成一簇，共 ${hier.n} 个"单人家庭"。接下来每一步，找出当前距离最近的两个群体，把它们并成一家——共需 ${totalSteps} 次合并。`
    }
    if (!done && lastMerge) {
      const sa = hier.membersOf[lastMerge.a].length
      const sb = hier.membersOf[lastMerge.b].length
      return `第 ${curStep} 次合并：现在最近的两个群体是 A（${sa} 人）和 B（${sb} 人），距离 ${lastMerge.distance.toFixed(1)} —— 把它们合并成一家人（新家庭共 ${lastMerge.size} 人）。树状图上同步长出一根新树枝。`
    }
    return `合并完成 ✓ ${hier.n} 个点全部连成一棵大树。拖动下方"切一刀"滑块：在树状图的某一高度横切，切到几根树枝就是几类。`
  }, [curStep, done, totalSteps, hier, lastMerge])

  const regenerate = (p = preset, n = perGroup, nz = noise) => {
    setPoints(genClusterPts(p, n, nz))
  }

  const xPx = (x: number) => (x / 100) * W
  const yPx = (y: number) => H - (y / 100) * H

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">层次聚类逐步推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          层次聚类像修家谱：每个点先自成一家，每一步把最亲近的两家合并，直到连成一棵大树——
          <b className="text-stone-700">最后在树上"切一刀"，切到几根树枝就是几类，不用预先定 K</b>。
        </p>
        <div className="mt-2">
          <MethodIntroCard id="hier" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：画布 + 树状图 ===== */}
        <div className="space-y-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">数据画布 · 两两合并</CardTitle>
              <p className="text-xs text-stone-500">
                橙圈 + 蓝圈 = 上一步刚合并的两个群体；同色的点已是一家，灰色的点还单着。
                {truncated && <span className="text-amber-600">样本超过 {MAX_N}，仅使用前 {MAX_N} 个点参与推演。</span>}
              </p>
            </CardHeader>
            <CardContent>
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="hier-walk-canvas">
                {hierPts.map((p, i) => {
                  let fill = '#d6d3d1'
                  const lab = done ? cut?.labels[i] : animLabels?.labels[i]
                  const sz = done ? cut?.sizes[lab ?? 0] : animLabels?.sizes[lab ?? 0]
                  if (lab !== undefined && lab !== null && (sz ?? 0) > 1) {
                    fill = CLUSTER_COLORS[lab % CLUSTER_COLORS.length]
                  }
                  return (
                    <circle
                      key={i}
                      cx={xPx(p.x)}
                      cy={yPx(p.y)}
                      r={4}
                      fill={fill}
                      stroke="#fff"
                      strokeWidth={1}
                      className="transition-colors duration-300"
                    />
                  )
                })}
                {/* 上一步合并的两簇闪烁 */}
                {lastMerge && !done && (
                  <>
                    {hier.membersOf[lastMerge.a].map((i) => (
                      <circle key={`fa-${i}`} cx={xPx(hierPts[i].x)} cy={yPx(hierPts[i].y)} r={8} fill="none" stroke="#f97316" strokeWidth={1.6} className="animate-pulse" data-testid="hier-flash" />
                    ))}
                    {hier.membersOf[lastMerge.b].map((i) => (
                      <circle key={`fb-${i}`} cx={xPx(hierPts[i].x)} cy={yPx(hierPts[i].y)} r={8} fill="none" stroke="#4f46e5" strokeWidth={1.6} className="animate-pulse" data-testid="hier-flash" />
                    ))}
                  </>
                )}
              </svg>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-orange-500" /> 上一步合并的簇 A
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-indigo-500" /> 上一步合并的簇 B
                </span>
                <span className="ml-auto font-mono text-stone-400">
                  剩余簇数 {done ? cut?.k : (animLabels?.sizes.length ?? hier.n)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">树状图（家谱树，随合并生长）</CardTitle>
              <p className="text-xs text-stone-500">
                横轴是样本（同簇的排在一起），纵轴是合并距离——越早合并的簇越"亲"。合并完成后出现橙色"切一刀"虚线。
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Dendrogram result={hier} step={curStep} cutHeight={cutHeight} cutLabels={done ? cut?.labels ?? null : null} width={520} height={260} />
              {done && (
                <div className="space-y-3" data-testid="hier-cut-panel">
                  <SliderRow
                    label={`切一刀的高度（当前切成 ${cut?.k ?? 0} 个簇）`}
                    value={cutHeight}
                    min={0}
                    max={Math.max(1, Math.ceil(hier.maxDist))}
                    step={0.5}
                    onChange={(v) => {
                      setCutHeight(v)
                      setCutTouched(true)
                    }}
                    format={(v) => v.toFixed(1)}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Scissors className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs text-stone-500">快捷：</span>
                    {[2, 3, 4].map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={cut?.k === k ? 'default' : 'outline'}
                        className={cut?.k === k ? 'bg-orange-500 hover:bg-orange-600' : ''}
                        onClick={() => {
                          setCutHeight(heightForK(hier, k))
                          setCutTouched(true)
                        }}
                        data-testid={`cut-k-${k}`}
                      >
                        切成 {k} 簇
                      </Button>
                    ))}
                    <span className="text-xs text-stone-400">切到几根树枝就是几类</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== 右侧：数据 + linkage + 步进 ===== */}
        <div className="space-y-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">数据</CardTitle>
            </CardHeader>
            <CardContent>
              <ClusterWalkDataPanel
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
                hint={`样本上限 ${MAX_N}，超出自动截取`}
              />
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">两家距离怎么算（linkage）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-1.5">
                {(Object.keys(LINKAGE_NAMES) as Linkage[]).map((l) => (
                  <Button
                    key={l}
                    size="sm"
                    variant={linkage === l ? 'default' : 'outline'}
                    className={linkage === l ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                    onClick={() => setLinkage(l)}
                    data-testid={`linkage-${l}`}
                  >
                    {LINKAGE_NAMES[l]}
                  </Button>
                ))}
              </div>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                最短 = 两家<b>最近</b>的人；最长 = 两家<b>最远</b>的人；平均 = 两家所有人两两平均。
                <b>切换后推演自动重置</b>——同一份数据，三种"亲家算法"会长出形状很不一样的树。
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
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700" data-testid="hier-done">
                  树已建成
                </span>
              ) : undefined
            }
          >
            {/* 每步大白话解说条 */}
            <p
              className={`rounded-lg px-3 py-2.5 text-sm leading-6 ${done ? 'bg-emerald-50 text-emerald-900' : 'bg-indigo-50 text-indigo-900'}`}
              data-testid="hier-narration"
            >
              {narration}
            </p>
            {!done && totalSteps > 0 && (
              <Button size="sm" variant="ghost" className="text-stone-500" onClick={() => setStep(totalSteps)} data-testid="walk-finish">
                <Zap className="mr-1 h-3.5 w-3.5" />
                跳到最终大树
              </Button>
            )}
          </StepControls>
        </div>
      </div>

      {/* ===== 聚类评估 ===== */}
      <ClusterEvalPanel points={hierPts} labels={done ? cut?.labels ?? null : null} />

      {/* ===== 讲解卡 ===== */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 三种 linkage 的直觉</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              合并两簇前要先回答"这两家隔多远"。<b>最短距离</b> = 两家最近的那对人——最容易"拉链条"：
              两家只要有一点沾边就算亲，长条形簇能连起来，但也容易被一排噪声点把两簇骗合并。
            </p>
            <p>
              <b>最长距离</b> = 两家最远的那对人——要求全员都亲近才结亲，合出来的簇紧凑圆润，但一个离群点就能搅黄一门亲事。
              <b>平均距离</b> = 两家所有人两两距离的平均——谁也不特殊照顾，实践中最常用的折中。
            </p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 一棵树的多种读法</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              K-Means 给你一份"最终答案"，层次聚类给你一整棵<b>过程树</b>：切在根部附近得到 2 大支（粗粒度），
              切在末梢附近得到十几小支（细粒度）——粗分细分一图看清，这是它独有的本事。
            </p>
            <p>
              但记住它的两条软肋：① O(n²) 的计算量，样本一多就跑不动（本实验限 {MAX_N} 点）；
              ② <b>合并不可撤销</b>——早期并错的一家会一直挂到树顶，噪声大时尤其明显。
            </p>
          </CardContent>
        </Card>
      </div>

      <ThinkBox
        questions={[
          '固定数据不动，换三种 linkage 各跑一遍：树状图的形状差别大吗？哪种 linkage 的树最"高瘦"、哪种最"矮胖"？',
          '换「同心圆环」数据跑层次聚类：它能像 DBSCAN 一样把圆环和中心分开吗？为什么"按距离合并"也救不了这种形状？（提示：想想密度和距离是两种不同的"亲"）',
          '「月牙双弧」上对比最短距离和最长距离：哪种能把两条月牙分开？为什么最短距离在细长簇上反而占便宜？',
        ]}
      />
    </div>
  )
}
