// ============================================================
// 多方法聚类工作台 —— K-Means / DBSCAN / 层次聚类 同场对比
// 三栏布局：左=方法卡片单选，中=数据+画布，右=过程与结果
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import SliderRow from '@/components/SliderRow'
import CsvUpload from '@/components/CsvUpload'
import ClusterEvalPanel from '@/components/ClusterEvalPanel'
import Dendrogram from '@/components/Dendrogram'
import ThinkBox from '@/components/ThinkBox'
import { assignPoints, updateCentroids, randomCentroids, maxShift, CLUSTER_COLORS, type Centroid } from '@/lib/kmeans'
import { genKMPreset, KM_PRESET_NAMES, type KMPreset, type RawPt } from '@/lib/datasets'
import { createDbscan, dbscanStep, dbscanRun, type DbscanState } from '@/lib/dbscan'
import { agglomerative, cutTree, labelsAfterMerges, LINKAGE_NAMES, type HcResult, type Linkage } from '@/lib/hierarchical'
import { rowCount, type PrepData } from '@/lib/preprocess'
import { ChevronDown, ChevronRight, MousePointerClick, Pause, Play, RotateCcw, StepForward, Zap } from 'lucide-react'

const W = 520
const H = 420
const HIER_MAX_N = 300

type Method = 'kmeans' | 'dbscan' | 'hier'
type Source = 'preset' | 'csv' | 'draw'

// ------------------------------------------------------------
// 方法卡片定义（一句话直觉 + 使用场景 + 生活化例子）
// ------------------------------------------------------------
const METHODS: Array<{
  id: Method
  name: string
  intuition: string
  scenes: string
  example: string
}> = [
  {
    id: 'kmeans',
    name: 'K-Means',
    intuition: '物以类聚，每类一个中心。',
    scenes: '客户分群、图像压缩、文档粗分类——簇接近球形、大小差不多时最好用。',
    example: '食堂选址：先随便开 K 家临时食堂，每个人去离家最近的那家，食堂再搬到食客的平均位置；反复几轮，食堂就开到了最合适的地方。',
  },
  {
    id: 'dbscan',
    name: 'DBSCAN',
    intuition: '密度够就连成一片，孤独的点是噪声。',
    scenes: '异常检测、任意形状的簇——比如地理上的事件热点、月牙形/环形分布。',
    example: '广场舞现场：人挨人密度够就连成一队；独自站得远远的被当成路人（噪声）。不需要提前告诉它有几队。',
  },
  {
    id: 'hier',
    name: '层次聚类（凝聚式）',
    intuition: '自底向上两两合并，画出一棵家谱树。',
    scenes: '样本少（<300）且想看清层次结构——物种分类、地区经济层级、客户层级画像。',
    example: '修家谱：最亲的两个人先结成小家庭，小家庭再和别家并成大家族……最后连成一棵完整的树，在哪一层"切一刀"就得到几支。',
  },
]

// ------------------------------------------------------------
// 主组件
// ------------------------------------------------------------
export default function ClusterWorkbench() {
  // ---- 数据 ----
  const [source, setSource] = useState<Source>('preset')
  const [preset, setPreset] = useState<KMPreset>('blobs')
  const [perGroup, setPerGroup] = useState(40)
  const [noise, setNoise] = useState(4)
  const [points, setPoints] = useState<RawPt[]>(() => genKMPreset('blobs', 40, 4))
  const [trueLabels, setTrueLabels] = useState<number[] | null>(null)
  const [csvNote, setCsvNote] = useState<string | null>(null)
  const [csvHasLabelOption, setCsvHasLabelOption] = useState(false)
  const [csvUseLabel, setCsvUseLabel] = useState(false)
  const [csvData, setCsvData] = useState<PrepData | null>(null)
  const [addPointMode, setAddPointMode] = useState(false)

  // ---- 方法 ----
  const [method, setMethod] = useState<Method>('kmeans')
  const [expandedCard, setExpandedCard] = useState<Method | null>(null)

  // ---- K-Means（简版：一键收敛 + 质心轨迹） ----
  const [k, setK] = useState(3)
  const [kmResult, setKmResult] = useState<{ centroids: Centroid[]; assignment: number[]; sse: number; iters: number; trails: Centroid[][] } | null>(null)

  // ---- DBSCAN ----
  const [eps, setEps] = useState(7)
  const [minPts, setMinPts] = useState(4)
  const [db, setDb] = useState<DbscanState | null>(null)
  const [dbAuto, setDbAuto] = useState(false)

  // ---- 层次聚类 ----
  const [linkage, setLinkage] = useState<Linkage>('average')
  const [hier, setHier] = useState<HcResult | null>(null)
  const [hierStep, setHierStep] = useState(0)
  const [hierAuto, setHierAuto] = useState(false)
  const [cutHeight, setCutHeight] = useState(0)
  const [cutTouched, setCutTouched] = useState(false)

  const resetAll = () => {
    setKmResult(null)
    setDb(null)
    setDbAuto(false)
    setHier(null)
    setHierStep(0)
    setHierAuto(false)
    setCutHeight(0)
    setCutTouched(false)
  }

  const regenerate = (p: KMPreset = preset, n: number = perGroup, nz: number = noise) => {
    setPoints(genKMPreset(p, n, nz))
    setTrueLabels(null)
    resetAll()
  }

  // CSV → 2D 投影点
  const applyCsv = (d: PrepData, useLabel: boolean) => {
    const numCols: number[] = []
    d.kinds.forEach((kk, j) => {
      if (kk === 'numeric') numCols.push(j)
    })
    if (numCols.length < 2) {
      setCsvNote('数值列不足 2 列，无法做 2D 投影聚类')
      return
    }
    const c0 = numCols[0]
    const c1 = numCols[1]
    const nRow = rowCount(d)
    const lastCol = d.cols.length - 1
    const labelVals = useLabel ? d.cols[lastCol] : null
    const labelMap = new Map<string, number>()
    if (labelVals) {
      for (const v of labelVals) {
        if (v !== null && !labelMap.has(String(v))) labelMap.set(String(v), labelMap.size)
      }
    }
    const pts: RawPt[] = []
    const lab: number[] = []
    let dropped = 0
    // 先求两列的最值用于缩放
    const v0 = d.cols[c0].filter((v): v is number => typeof v === 'number')
    const v1 = d.cols[c1].filter((v): v is number => typeof v === 'number')
    const min0 = Math.min(...v0)
    const max0 = Math.max(...v0)
    const min1 = Math.min(...v1)
    const max1 = Math.max(...v1)
    const scale = (v: number, lo: number, hi: number) => (hi - lo < 1e-9 ? 50 : 8 + ((v - lo) / (hi - lo)) * 84)
    for (let i = 0; i < nRow; i++) {
      const a = d.cols[c0][i]
      const b = d.cols[c1][i]
      const lb = labelVals?.[i]
      if (typeof a !== 'number' || typeof b !== 'number' || (labelVals && lb == null)) {
        dropped++
        continue
      }
      pts.push({ x: scale(a, min0, max0), y: scale(b, min1, max1) })
      if (labelVals) lab.push(labelMap.get(String(lb))!)
    }
    setPoints(pts)
    setTrueLabels(labelVals ? lab : null)
    setCsvNote(
      `已载入 ${pts.length} 个点${dropped > 0 ? `（${dropped} 行因缺失被跳过）` : ''}：使用前两列数值「${d.headers[c0]}」「${d.headers[c1]}」做 2D 投影（已各自缩放到画布）` +
        (labelVals ? `，最后一列「${d.headers[lastCol]}」作为真实标签（${labelMap.size} 类）用于外部评估` : ''),
    )
    resetAll()
  }

  // ---- DBSCAN 自动播放 ----
  useEffect(() => {
    if (!dbAuto || !db || db.done) {
      if (dbAuto && db?.done) setDbAuto(false)
      return
    }
    const t = setTimeout(() => setDb((s) => (s ? dbscanStep(s) : s)), points.length > 80 ? 60 : 140)
    return () => clearTimeout(t)
  }, [dbAuto, db])

  // ---- 层次聚类自动播放 ----
  useEffect(() => {
    if (!hierAuto || !hier) return
    if (hierStep >= hier.merges.length) {
      setHierAuto(false)
      return
    }
    const t = setTimeout(() => setHierStep((s) => s + 1), hier.n > 80 ? 60 : 150)
    return () => clearTimeout(t)
  }, [hierAuto, hier, hierStep])

  // ---- 画布点击加点 ----
  const svgRef = useRef<SVGSVGElement>(null)
  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!addPointMode) return
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = 100 - ((e.clientY - rect.top) / rect.height) * 100
    setPoints((pts) => [...pts, { x, y }])
    resetAll()
  }

  // ---- K-Means 一键运行 ----
  const runKMeans = () => {
    if (points.length < k) return
    let cent = randomCentroids(points, k)
    const trails: Centroid[][] = [cent]
    let assignment = assignPoints(points, cent).assignment
    let iters = 0
    for (let it = 0; it < 50; it++) {
      const next = updateCentroids(points, assignment, cent)
      trails.push(next)
      iters++
      if (maxShift(cent, next) < 0.1) {
        cent = next
        break
      }
      cent = next
      assignment = assignPoints(points, cent).assignment
    }
    const { assignment: a, sse } = assignPoints(points, cent)
    setKmResult({ centroids: cent, assignment: a, sse, iters, trails })
  }

  // ---- 层次聚类启动 ----
  const startHier = () => {
    const pts = points.slice(0, HIER_MAX_N)
    const res = agglomerative(pts, linkage)
    setHier(res)
    setHierStep(0)
    setCutTouched(false)
    setCutHeight(0)
  }
  const hierDone = hier !== null && hierStep >= hier.merges.length
  // 完成后自动给出一个建议切割高度（切成 min(3, n-1) 簇）
  useEffect(() => {
    if (hierDone && hier && !cutTouched) {
      const wantK = Math.min(3, Math.max(2, hier.n - 1))
      const idx = hier.merges.length - (wantK - 1)
      const h = idx >= 0 && idx < hier.merges.length ? (hier.merges[idx].distance + (idx > 0 ? hier.merges[idx - 1].distance : 0)) / 2 : hier.maxDist / 2
      setCutHeight(+h.toFixed(1))
    }
  }, [hierDone, hier, cutTouched])

  const hierCut = useMemo(() => (hier && hierDone ? cutTree(hier, cutHeight) : null), [hier, hierDone, cutHeight])
  const hierAnimLabels = useMemo(() => (hier && !hierDone ? labelsAfterMerges(hier, hierStep) : null), [hier, hierDone, hierStep])

  // ---- 评估面板用的标签 ----
  const evalLabels =
    method === 'kmeans'
      ? kmResult?.assignment ?? null
      : method === 'dbscan'
        ? db?.done
          ? db.labels
          : null
        : hierCut?.labels ?? null
  const evalPoints = method === 'hier' ? points.slice(0, HIER_MAX_N) : points

  const xPx = (x: number) => (x / 100) * W
  const yPx = (y: number) => H - (y / 100) * H

  const lastMerge = hier && hierStep > 0 && hierStep <= hier.merges.length ? hier.merges[hierStep - 1] : null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-stone-800">多方法对比工作台</h2>
        <p className="mt-1 text-sm text-stone-500">
          同一份数据，三种聚类方法轮番上阵。换一换数据集形状（特别是「同心圆环」和「月牙双弧」），体会"没有万能算法"。
          <b className="text-stone-700">每种方法的单独逐步推演见前面三个页签</b>，这里专注对比。
        </p>
        {/* 概念卡：聚类没有标准答案 */}
        <p className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs leading-6 text-stone-600">
          <b>概念卡 · 聚类没有标准答案：</b>同一堆人，可以按身高分、也可以按爱好分——哪种分法"对"，取决于你要解决什么问题。
          下方评估面板的指标（轮廓系数等）只是参考，<b>业务上解释得通的分群才重要</b>。
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_330px]">
        {/* ===== 左栏：方法卡片 ===== */}
        <div className="space-y-3">
          {METHODS.map((m) => (
            <div
              key={m.id}
              className={`cursor-pointer rounded-xl border-2 bg-white p-3.5 transition-all ${
                method === m.id ? 'border-indigo-500 shadow-md' : 'border-stone-200 hover:border-indigo-300'
              }`}
              onClick={() => setMethod(m.id)}
            >
              <div className="flex items-center justify-between">
                <p className={`text-sm font-bold ${method === m.id ? 'text-indigo-700' : 'text-stone-700'}`}>{m.name}</p>
                {method === m.id && <span className="h-2 w-2 rounded-full bg-indigo-500" />}
              </div>
              <p className="mt-1.5 text-sm leading-6 text-stone-600">「{m.intuition}」</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                <b className="text-stone-600">使用场景：</b>
                {m.scenes}
              </p>
              <button
                className="mt-1.5 flex items-center gap-0.5 text-xs font-medium text-orange-600 hover:text-orange-700"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedCard(expandedCard === m.id ? null : m.id)
                }}
              >
                {expandedCard === m.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                生活化例子
              </button>
              {expandedCard === m.id && (
                <p className="mt-1 rounded-lg bg-orange-50 px-2.5 py-2 text-xs leading-5 text-orange-900">{m.example}</p>
              )}
            </div>
          ))}
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-500">
            方法没有好坏，只有合不合适。聚类结果到底如何？看下方「聚类评估」面板。
          </div>
        </div>

        {/* ===== 中栏：数据 + 画布 ===== */}
        <div className="space-y-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">数据</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['preset', '预设数据集'],
                    ['csv', 'CSV 上传'],
                    ['draw', '手绘点击'],
                  ] as Array<[Source, string]>
                ).map(([s, name]) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={source === s ? 'default' : 'outline'}
                    className={source === s ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                    onClick={() => {
                      setSource(s)
                      if (s === 'preset') regenerate()
                      if (s === 'draw') {
                        setPoints([])
                        setTrueLabels(null)
                        setAddPointMode(true)
                        resetAll()
                      } else {
                        setAddPointMode(false)
                      }
                    }}
                  >
                    {name}
                  </Button>
                ))}
              </div>

              {source === 'preset' && (
                <>
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SliderRow label="每组点数" value={perGroup} min={20} max={80} step={5} onChange={setPerGroup} />
                    <SliderRow label="噪声强度" value={noise} min={0} max={20} step={1} onChange={setNoise} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => regenerate()}>
                      按当前设置生成
                    </Button>
                    <Button
                      size="sm"
                      variant={addPointMode ? 'default' : 'outline'}
                      className={addPointMode ? 'bg-orange-500 hover:bg-orange-600' : ''}
                      onClick={() => setAddPointMode(!addPointMode)}
                    >
                      <MousePointerClick className="mr-1 h-3.5 w-3.5" />
                      {addPointMode ? '加点中…' : '画布加点'}
                    </Button>
                  </div>
                </>
              )}

              {source === 'csv' && (
                <div className="space-y-2">
                  <CsvUpload
                    loose
                    onDataLoose={(d) => {
                      setCsvData(d)
                      setCsvHasLabelOption(d.headers.length >= 3)
                      setCsvUseLabel(false)
                      applyCsv(d, false)
                    }}
                  />
                  {csvData && csvHasLabelOption && (
                    <label className="flex items-center gap-2 text-sm text-stone-600">
                      <Checkbox
                        checked={csvUseLabel}
                        onCheckedChange={(v) => {
                          setCsvUseLabel(v === true)
                          if (csvData) applyCsv(csvData, v === true)
                        }}
                      />
                      最后一列是真实标签（用于 ARI / 纯度等外部评估）
                    </label>
                  )}
                  {csvNote && <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-800">{csvNote}</p>}
                </div>
              )}

              {source === 'draw' && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs leading-5 text-stone-500">
                    在下方画布上<b className="text-stone-700">逐点点击</b>画出你想要的形状（比如一个圆环、一条弧线），再选方法聚类。
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPoints([])
                      resetAll()
                    }}
                  >
                    清空画布
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 画布 */}
          <Card className="border-stone-200 shadow-sm">
            <CardContent className="pt-4">
              <svg
                ref={svgRef}
                width={W}
                height={H}
                viewBox={`0 0 ${W} ${H}`}
                className={`max-w-full rounded-lg border border-stone-200 bg-white ${addPointMode ? 'cursor-crosshair' : ''}`}
                onClick={onCanvasClick}
                data-testid="cluster-canvas"
              >
                {/* DBSCAN：当前点的 ε 半径圆 */}
                {method === 'dbscan' && db && db.current !== null && (
                  <circle
                    cx={xPx(points[db.current].x)}
                    cy={yPx(points[db.current].y)}
                    r={(db.eps / 100) * W}
                    fill="#4f46e5"
                    fillOpacity={0.06}
                    stroke="#4f46e5"
                    strokeDasharray="4 3"
                    strokeWidth={1.2}
                  />
                )}
                {/* K-Means：质心轨迹线 */}
                {method === 'kmeans' &&
                  kmResult &&
                  kmResult.trails[0]?.map((_, ci) => (
                    <polyline
                      key={`trail-${ci}`}
                      points={kmResult.trails.map((t) => `${xPx(t[ci].x)},${yPx(t[ci].y)}`).join(' ')}
                      fill="none"
                      stroke={CLUSTER_COLORS[ci % CLUSTER_COLORS.length]}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      opacity={0.6}
                    />
                  ))}

                {/* 数据点 */}
                {points.map((p, i) => {
                  // 层次聚类只使用前 HIER_MAX_N 个点
                  if (method === 'hier' && i >= HIER_MAX_N) return null
                  // 决定颜色与样式
                  let fill = '#d6d3d1'
                  let r = 4
                  let extra: React.ReactNode = null
                  if (method === 'kmeans' && kmResult) {
                    fill = CLUSTER_COLORS[kmResult.assignment[i] % CLUSTER_COLORS.length]
                  } else if (method === 'dbscan' && db) {
                    if (!db.visited[i]) {
                      fill = '#d6d3d1'
                    } else if (db.labels[i] === -1) {
                      // 噪声：灰色 ×
                      extra = (
                        <g stroke="#a8a29e" strokeWidth={1.8}>
                          <line x1={xPx(p.x) - 4} y1={yPx(p.y) - 4} x2={xPx(p.x) + 4} y2={yPx(p.y) + 4} />
                          <line x1={xPx(p.x) - 4} y1={yPx(p.y) + 4} x2={xPx(p.x) + 4} y2={yPx(p.y) - 4} />
                        </g>
                      )
                      fill = 'none'
                    } else {
                      fill = CLUSTER_COLORS[db.labels[i] % CLUSTER_COLORS.length]
                      r = db.isCore[i] ? 5.5 : 4
                    }
                  } else if (method === 'hier' && hier) {
                    const lab = hierDone ? hierCut?.labels[i] : hierAnimLabels?.labels[i]
                    const sz = hierDone ? hierCut?.sizes[lab ?? 0] : hierAnimLabels?.sizes[lab ?? 0]
                    if (lab !== undefined && lab !== null && (sz ?? 0) > 1) {
                      fill = CLUSTER_COLORS[lab % CLUSTER_COLORS.length]
                    }
                  }
                  return (
                    <g key={i}>
                      {fill !== 'none' && (
                        <circle
                          cx={xPx(p.x)}
                          cy={yPx(p.y)}
                          r={r}
                          fill={fill}
                          fillOpacity={method === 'dbscan' && db?.visited[i] && db.labels[i] >= 0 && !db.isCore[i] ? 0.55 : 1}
                          stroke={method === 'dbscan' && db?.isCore[i] ? '#1c1917' : '#fff'}
                          strokeWidth={method === 'dbscan' && db?.isCore[i] ? 1.4 : 1}
                          className="transition-colors duration-200"
                        />
                      )}
                      {extra}
                      {/* DBSCAN：队列中的点加靛蓝细环 */}
                      {method === 'dbscan' && db?.queue.includes(i) && (
                        <circle cx={xPx(p.x)} cy={yPx(p.y)} r={8} fill="none" stroke="#818cf8" strokeWidth={1} strokeDasharray="2 2" />
                      )}
                      {/* DBSCAN：邻居高亮 */}
                      {method === 'dbscan' && db && db.currentNeighbors.includes(i) && db.current !== i && (
                        <circle cx={xPx(p.x)} cy={yPx(p.y)} r={7.5} fill="none" stroke="#4f46e5" strokeWidth={1.2} opacity={0.7} />
                      )}
                    </g>
                  )
                })}

                {/* DBSCAN：当前点大高亮环 */}
                {method === 'dbscan' && db && db.current !== null && (
                  <circle
                    cx={xPx(points[db.current].x)}
                    cy={yPx(points[db.current].y)}
                    r={10}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    className="animate-pulse"
                  />
                )}

                {/* 层次聚类：上一步合并的两簇闪烁 */}
                {method === 'hier' && lastMerge && hier && !hierDone && (
                  <>
                    {hier.membersOf[lastMerge.a].map((i) => (
                      <circle key={`fa-${i}`} cx={xPx(points[i].x)} cy={yPx(points[i].y)} r={8} fill="none" stroke="#f97316" strokeWidth={1.6} className="animate-pulse" />
                    ))}
                    {hier.membersOf[lastMerge.b].map((i) => (
                      <circle key={`fb-${i}`} cx={xPx(points[i].x)} cy={yPx(points[i].y)} r={8} fill="none" stroke="#4f46e5" strokeWidth={1.6} className="animate-pulse" />
                    ))}
                  </>
                )}

                {/* K-Means 质心 */}
                {method === 'kmeans' &&
                  kmResult?.centroids.map((c, i) => (
                    <g key={`c-${i}`} transform={`translate(${xPx(c.x)}, ${yPx(c.y)})`}>
                      <circle r={10} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} stroke="#1c1917" strokeWidth={2} />
                      <line x1={-4.5} y1={-4.5} x2={4.5} y2={4.5} stroke="#fff" strokeWidth={2} />
                      <line x1={-4.5} y1={4.5} x2={4.5} y2={-4.5} stroke="#fff" strokeWidth={2} />
                    </g>
                  ))}

                {points.length === 0 && (
                  <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="#a8a29e">
                    画布是空的——点击加点，或切换数据来源
                  </text>
                )}
              </svg>
              {/* 图例 */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                {method === 'dbscan' && (
                  <>
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
                  </>
                )}
                {method === 'hier' && hier && !hierDone && (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-orange-500" /> 上一步合并的簇 A
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-indigo-500" /> 上一步合并的簇 B
                    </span>
                  </>
                )}
                {method === 'hier' && points.length > HIER_MAX_N && (
                  <span className="text-amber-600">样本超过 {HIER_MAX_N}，层次聚类仅使用前 {HIER_MAX_N} 个点</span>
                )}
                {method === 'kmeans' && kmResult && <span>虚线为质心移动轨迹</span>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ===== 右栏：过程与结果 ===== */}
        <div className="space-y-4">
          {method === 'kmeans' && (
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-stone-800">K-Means（简版一键收敛）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SliderRow label="簇数 K" value={k} min={2} max={8} onChange={setK} />
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled={points.length < k} onClick={runKMeans}>
                    <Zap className="mr-1 h-3.5 w-3.5" />
                    一键运行收敛
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setKmResult(null)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    清除结果
                  </Button>
                </div>
                {kmResult && (
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg bg-stone-50 py-2">
                      <p className="text-xs text-stone-500">迭代轮数</p>
                      <p className="font-mono text-lg font-bold text-indigo-700">{kmResult.iters}</p>
                    </div>
                    <div className="rounded-lg bg-stone-50 py-2">
                      <p className="text-xs text-stone-500">SSE</p>
                      <p className="font-mono text-lg font-bold text-indigo-700">{kmResult.sse.toFixed(0)}</p>
                    </div>
                  </div>
                )}
                <p className="text-xs leading-5 text-stone-500">
                  想亲手放质心、分步看"分配—更新"？去「K-Means 推演」页签。这里专注对比不同方法。
                </p>
              </CardContent>
            </Card>
          )}

          {method === 'dbscan' && (
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-stone-800">DBSCAN 逐步推演</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SliderRow label="邻域半径 ε" value={eps} min={2} max={16} step={0.5} onChange={setEps} format={(v) => v.toFixed(1)} />
                <SliderRow label="密度阈值 minPts" value={minPts} min={2} max={10} onChange={setMinPts} />
                <p className="text-xs leading-5 text-stone-400">
                  ε = "离得多近算邻居"；minPts = "至少几个邻居才算自己人（核心点）"。ε 越大簇越少，minPts 越大噪声越多。
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={points.length === 0 || (db?.done ?? false)}
                    onClick={() => setDb((s) => dbscanStep(s ?? createDbscan(points, eps, minPts)))}
                  >
                    <StepForward className="mr-1 h-3.5 w-3.5" />
                    下一步
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={points.length === 0 || (db?.done ?? false)}
                    onClick={() => {
                      if (!db) setDb(createDbscan(points, eps, minPts))
                      setDbAuto(!dbAuto)
                    }}
                  >
                    {dbAuto ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                    自动播放
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={points.length === 0}
                    onClick={() => {
                      const r = dbscanRun(points, eps, minPts)
                      setDb({ ...createDbscan(points, eps, minPts), visited: points.map(() => true), labels: r.labels, isCore: r.isCore, clusterCount: r.clusterCount, done: true, log: '已直接算出最终结果', stepCount: -1 })
                    }}
                  >
                    <Zap className="mr-1 h-3.5 w-3.5" />
                    直接出结果
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDb(null)
                      setDbAuto(false)
                    }}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    重置
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-stone-50 py-1.5">
                    <p className="text-[10px] text-stone-500">已处理</p>
                    <p className="font-mono text-sm font-bold text-indigo-700">
                      {db ? `${db.visited.filter(Boolean).length}/${points.length}` : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-stone-50 py-1.5">
                    <p className="text-[10px] text-stone-500">簇数</p>
                    <p className="font-mono text-sm font-bold text-indigo-700">{db?.clusterCount ?? '—'}</p>
                  </div>
                  <div className="rounded-lg bg-stone-50 py-1.5">
                    <p className="text-[10px] text-stone-500">噪声</p>
                    <p className="font-mono text-sm font-bold text-stone-600">{db ? db.labels.filter((l, i) => l === -1 && db.visited[i]).length : '—'}</p>
                  </div>
                </div>
                {db && (
                  <p className={`rounded-lg px-3 py-2 text-xs leading-5 ${db.done ? 'bg-emerald-50 text-emerald-800' : 'bg-indigo-50 text-indigo-800'}`}>
                    {db.done ? `运行完成 ✓ 共分出 ${db.clusterCount} 个簇，${db.labels.filter((l) => l === -1).length} 个噪声点。` : db.log}
                  </p>
                )}
                {!db && <p className="text-xs leading-5 text-stone-500">点「下一步」逐个检查：以当前点画 ε 圆，圈内点数 ≥ minPts 就是核心点，向外扩散；否则暂标噪声（灰色 ×）。</p>}
              </CardContent>
            </Card>
          )}

          {method === 'hier' && (
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-stone-800">层次聚类逐步合并</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-sm text-stone-700">簇间距离怎么算（linkage）</p>
                  <div className="flex gap-1.5">
                    {(Object.keys(LINKAGE_NAMES) as Linkage[]).map((l) => (
                      <Button
                        key={l}
                        size="sm"
                        variant={linkage === l ? 'default' : 'outline'}
                        className={linkage === l ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                        onClick={() => setLinkage(l)}
                      >
                        {LINKAGE_NAMES[l]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={points.length < 2 || hierDone}
                    onClick={() => {
                      if (!hier) startHier()
                      else setHierStep((s) => s + 1)
                    }}
                  >
                    <StepForward className="mr-1 h-3.5 w-3.5" />
                    {hier ? '合并下一步' : '开始'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={points.length < 2 || hierDone}
                    onClick={() => {
                      if (!hier) startHier()
                      setHierAuto(!hierAuto)
                    }}
                  >
                    {hierAuto ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                    自动播放
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={points.length < 2}
                    onClick={() => {
                      if (!hier) startHier()
                      else setHierStep(hier.merges.length)
                    }}
                  >
                    <Zap className="mr-1 h-3.5 w-3.5" />
                    直接出结果
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setHier(null)
                      setHierStep(0)
                      setHierAuto(false)
                    }}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    重置
                  </Button>
                </div>
                {hier && (
                  <p className={`rounded-lg px-3 py-2 text-xs leading-5 ${hierDone ? 'bg-emerald-50 text-emerald-800' : 'bg-indigo-50 text-indigo-800'}`}>
                    {hierDone
                      ? `合并完成 ✓ 全部 ${hier.n} 个点已连成一棵树。拖动下方"切一刀"滑块决定最终簇数。`
                      : `第 ${hierStep} / ${hier.merges.length} 次合并${
                          hierStep > 0
                            ? `：刚把距离 ${hier.merges[hierStep - 1].distance.toFixed(1)} 的两簇并在一起（橙圈 + 蓝圈闪烁）`
                            : '：每次把距离最近的两簇合并'
                        }`}
                  </p>
                )}
                {hier && (
                  <SliderRow
                    label={`切一刀的高度（当前 ${hierDone ? hierCut?.k ?? 0 : '—'} 个簇）`}
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
                )}
              </CardContent>
            </Card>
          )}

          {/* 树状图（层次聚类时显示在右栏下方） */}
          {method === 'hier' && hier && (
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-stone-800">树状图（家谱树，随合并生长）</CardTitle>
              </CardHeader>
              <CardContent>
                <Dendrogram result={hier} step={hierStep} cutHeight={cutHeight} cutLabels={hierDone ? hierCut?.labels ?? null : null} />
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  横轴是样本（同簇的排在一起），纵轴是合并距离——越早合并的簇越"亲"。橙色虚线是"切一刀"的位置，斩断几根树枝就得到几簇。
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ===== 评估面板 ===== */}
      <ClusterEvalPanel points={evalPoints} labels={evalLabels} trueLabels={trueLabels} showKHelper={method === 'kmeans'} />

      <ThinkBox
        questions={[
          '换「同心圆环」数据：K-Means 无论 K 取几都切不对，DBSCAN 一次就对——为什么？（提示：K-Means 只认"离中心近"，DBSCAN 认"密度连着"）',
          'DBSCAN 在「三个团簇」上把 ε 从 3 慢慢调到 12，簇数怎么变？ε 太大会发生什么？',
          '层次聚类换三种"合并方式"（最短 / 最长 / 平均距离）跑「月牙双弧」，哪种能把两条月牙分开？最短距离为什么容易"拉链条"？',
          '上传一份带真实标签的 CSV，对比三种方法的 ARI：哪个最接近真实结构？',
        ]}
      />
    </div>
  )
}
