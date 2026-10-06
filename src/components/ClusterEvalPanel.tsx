// 聚类评估面板 —— 「聚类实验」两个子页签共用
// 内部指标：轮廓系数 / Calinski-Harabasz / Davies-Bouldin
// 外部指标（有真实标签时）：ARI / 纯度
// K-Means 附加「K 选择助手」：K=2..8 批量跑，SSE 肘部曲线 + 轮廓系数曲线
import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import CurveChart from '@/components/CurveChart'
import { silhouetteSamples, calinskiHarabasz, daviesBouldin, adjustedRandIndex, purity, clusterCount } from '@/lib/clusterMetrics'
import { assignPoints, updateCentroids, maxShift, CLUSTER_COLORS } from '@/lib/kmeans'
import { mulberry32 } from '@/lib/preprocess'
import type { RawPt } from '@/lib/datasets'
import { Gauge } from 'lucide-react'

interface Props {
  points: RawPt[]
  /** 聚类标签（-1 表示噪声点），null = 尚未产生结果 */
  labels: number[] | null
  /** 真实标签（上传数据带标签列时） */
  trueLabels?: number[] | null
  /** K-Means 时显示「K 选择助手」 */
  showKHelper?: boolean
}

function fmt(v: number | null, digits = 3): string {
  if (v === null) return '—'
  if (v === Infinity) return '∞'
  return v.toFixed(digits)
}

/** 轮廓系数质量分档配色 */
function silColor(v: number): string {
  return v > 0.5 ? 'text-emerald-600' : v > 0.25 ? 'text-amber-600' : 'text-red-500'
}

/** K 选择助手：批量跑 K=2..8 的 K-Means（每个 K 三次重启取最优 SSE） */
interface KSweepItem {
  k: number
  sse: number
  silhouette: number
}

function sweepK(points: RawPt[], maxK = 8): KSweepItem[] {
  const out: KSweepItem[] = []
  for (let k = 2; k <= Math.min(maxK, points.length - 1); k++) {
    let bestAssign: number[] | null = null
    let bestSse = Infinity
    for (let r = 0; r < 3; r++) {
      const rand = mulberry32(1000 + k * 97 + r * 13)
      const idx = points.map((_, i) => i)
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[idx[i], idx[j]] = [idx[j], idx[i]]
      }
      let cent = idx.slice(0, k).map((i) => ({ x: points[i].x, y: points[i].y }))
      let assign = assignPoints(points, cent).assignment
      for (let it = 0; it < 50; it++) {
        const next = updateCentroids(points, assign, cent)
        if (maxShift(cent, next) < 1e-4) {
          cent = next
          break
        }
        cent = next
        assign = assignPoints(points, cent).assignment
      }
      const { sse } = assignPoints(points, cent)
      if (sse < bestSse) {
        bestSse = sse
        bestAssign = assignPoints(points, cent).assignment
      }
    }
    const sil = bestAssign ? silhouetteSamples(points, bestAssign)?.mean ?? 0 : 0
    out.push({ k, sse: bestSse, silhouette: sil })
  }
  return out
}

export default function ClusterEvalPanel({ points, labels, trueLabels, showKHelper = false }: Props) {
  const [sweep, setSweep] = useState<KSweepItem[] | null>(null)
  const [sweeping, setSweeping] = useState(false)

  const noiseN = labels ? labels.filter((l) => l < 0).length : 0
  const k = labels ? clusterCount(labels) : 0

  // 所有指标随数据实时重算
  const sil = useMemo(
    () => (labels && k >= 2 ? silhouetteSamples(points, labels) : null),
    [points, labels, k],
  )
  const ch = useMemo(() => (labels && k >= 2 ? calinskiHarabasz(points, labels) : null), [points, labels, k])
  const db = useMemo(() => (labels && k >= 2 ? daviesBouldin(points, labels) : null), [points, labels, k])
  const ari = useMemo(
    () => (labels && trueLabels ? adjustedRandIndex(trueLabels, labels.map((l) => (l < 0 ? -1 : l))) : null),
    [labels, trueLabels],
  )
  const pur = useMemo(() => (labels && trueLabels ? purity(trueLabels, labels) : null), [labels, trueLabels])

  // 轮廓条形图数据：按簇分组、簇内按 s(i) 降序
  const silBars = useMemo(() => {
    if (!sil) return []
    return sil.idx
      .map((_, i) => ({ s: sil.values[i], c: sil.labels[i] }))
      .sort((a, b) => (a.c !== b.c ? a.c - b.c : b.s - a.s))
  }, [sil])

  const suggestedK = sweep && sweep.length > 0 ? sweep.reduce((a, b) => (b.silhouette > a.silhouette ? b : a)).k : null

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-stone-800">
          <Gauge className="h-4 w-4 text-indigo-500" />
          聚类评估（随结果实时重算）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(!labels || k < 2) && (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-500">
            {!labels ? '还没有聚类结果——先在上方运行一种聚类方法。' : '当前结果不足 2 个簇，无法评估——调调参数再试。'}
          </p>
        )}

        {labels && k >= 2 && (
          <>
            {/* 指标卡片区 */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
                <p className="text-xs text-stone-500">轮廓系数 Silhouette</p>
                <p className={`mt-1 font-mono text-2xl font-bold ${silColor(sil?.mean ?? 0)}`}>{fmt(sil?.mean ?? null)}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  越接近 1 越好；<b>负值说明这个点可能站错队了</b>。
                  {noiseN > 0 && `（已排除 ${noiseN} 个噪声点）`}
                  {sil?.sampled && '（样本量 >300，已抽样 300 估算）'}
                </p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
                <p className="text-xs text-stone-500">Calinski-Harabasz 指数</p>
                <p className="mt-1 font-mono text-2xl font-bold text-indigo-700">{fmt(ch, 1)}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">簇间距离 ÷ 簇内距离的方差比。<b>越大越好，没有上限</b>，只能和别的划分比大小。</p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
                <p className="text-xs text-stone-500">Davies-Bouldin 指数</p>
                <p className="mt-1 font-mono text-2xl font-bold text-indigo-700">{fmt(db, 3)}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">每个簇找自己最难分清的邻居，算出"胖瘦之和 ÷ 中心距离"，再对所有簇求平均。<b>越小越好，0 是完美</b>。</p>
              </div>
              {trueLabels && (
                <>
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                    <p className="text-xs text-orange-700">调整兰德指数 ARI（对照真实标签）</p>
                    <p className={`mt-1 font-mono text-2xl font-bold ${(ari ?? 0) > 0.7 ? 'text-emerald-600' : 'text-orange-600'}`}>
                      {fmt(ari)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-orange-800/80">1 = 和真实标签完全一致，0 ≈ 随机乱分，负数 = 比随机还差。</p>
                  </div>
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                    <p className="text-xs text-orange-700">纯度 Purity（对照真实标签）</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-orange-600">{fmt(pur)}</p>
                    <p className="mt-1 text-xs leading-5 text-orange-800/80">每个簇里"最主流"的真实类别占比之和，1 = 每簇都干干净净。</p>
                  </div>
                </>
              )}
            </div>

            {/* 轮廓系数条形图 */}
            {sil && (
              <div>
                <p className="mb-1 text-xs text-stone-500">
                  每个样本一根条（按簇分组、簇内从高到低排）：条越高站队越稳，<b className="text-red-500">掉到 0 轴以下的点值得怀疑</b>。
                </p>
                <SilhouetteChart bars={silBars} mean={sil.mean} />
              </div>
            )}
          </>
        )}

        {/* K 选择助手 */}
        {showKHelper && points.length >= 9 && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-indigo-800">K 选择助手：K 取几最合适？</p>
              <Button
                size="sm"
                variant="outline"
                disabled={sweeping}
                onClick={() => {
                  setSweeping(true)
                  // 延迟到下一帧，让按钮先渲染出"计算中"
                  setTimeout(() => {
                    setSweep(sweepK(points))
                    setSweeping(false)
                  }, 30)
                }}
              >
                {sweeping ? '计算中…' : sweep ? '重新批量评估 K=2..8' : '批量评估 K=2..8'}
              </Button>
            </div>
            {sweep && suggestedK !== null && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-indigo-800">
                  建议 <b className="font-mono text-base">K = {suggestedK}</b>（轮廓系数最高）。
                  肘部法则：SSE 曲线下降突然变缓的"拐点"也是好 K——SSE 随着 K 增大必然下降，但越过拐点后收益越来越小。
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs text-stone-500">SSE 肘部曲线（找拐点）</p>
                    <CurveChart
                      xs={sweep.map((s) => s.k)}
                      series={[{ ys: sweep.map((s) => s.sse), color: '#4f46e5', label: 'SSE' }]}
                      xLabel="K"
                      yLabel="SSE"
                      xFormat={(v) => v.toFixed(0)}
                      height={170}
                      width={430}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-stone-500">轮廓系数曲线（越高越好）</p>
                    <CurveChart
                      xs={sweep.map((s) => s.k)}
                      series={[{ ys: sweep.map((s) => s.silhouette), color: '#f97316', label: '轮廓系数' }]}
                      xLabel="K"
                      yLabel="轮廓系数"
                      xFormat={(v) => v.toFixed(0)}
                      height={170}
                      width={430}
                      markers={[{ x: suggestedK, color: '#059669', label: `建议 K=${suggestedK}` }]}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** 轮廓系数条形图：每样本一根竖条，按簇分组排序，负值掉到 0 轴下方 */
function SilhouetteChart({ bars, mean }: { bars: Array<{ s: number; c: number }>; mean: number }) {
  const W = 900
  const H = 180
  const PAD = { l: 40, r: 10, t: 10, b: 18 }
  const n = bars.length
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const bw = Math.max(1, iw / n - 0.4)
  const yOf = (v: number) => PAD.t + ih * (1 - (v + 1) / 2) // v ∈ [-1, 1]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-lg border border-stone-200 bg-white" data-testid="silhouette-chart">
      {/* 网格 */}
      {[-1, -0.5, 0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={yOf(g)} y2={yOf(g)} stroke={g === 0 ? '#a8a29e' : '#e7e5e4'} strokeWidth={g === 0 ? 1.2 : 1} />
          <text x={PAD.l - 5} y={yOf(g) + 3.5} textAnchor="end" fontSize={10} fill="#78716c">
            {g.toFixed(1)}
          </text>
        </g>
      ))}
      {/* 条形 */}
      {bars.map((b, i) => {
        const x = PAD.l + (i / n) * iw
        const y0 = yOf(Math.max(0, b.s))
        const h = Math.abs(yOf(b.s) - yOf(0))
        return (
          <rect
            key={i}
            x={x}
            y={y0}
            width={bw}
            height={Math.max(0.5, h)}
            fill={CLUSTER_COLORS[b.c % CLUSTER_COLORS.length]}
            opacity={b.s < 0 ? 0.45 : 0.85}
          />
        )
      })}
      {/* 均值虚线 */}
      <line x1={PAD.l} x2={W - PAD.r} y1={yOf(mean)} y2={yOf(mean)} stroke="#1c1917" strokeWidth={1.2} strokeDasharray="5 3" />
      <text x={W - PAD.r} y={yOf(mean) - 4} textAnchor="end" fontSize={10.5} fontWeight={600} fill="#1c1917">
        平均 {mean.toFixed(3)}
      </text>
    </svg>
  )
}
