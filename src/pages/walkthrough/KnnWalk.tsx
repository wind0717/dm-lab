// kNN 逐步推演：拖动待分类点，实时看最近 k 个邻居、距离列表与投票
// 「全图推演」模式：背景网格着色显示 kNN 决策区域
import { useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import { MethodIntroCard } from '@/components/MethodIntro'
import { WalkDataPanel, genPts } from '@/pages/walkthrough/walkShared'
import { knnNeighbors, knnVotes, knnPredict } from '@/lib/walkthroughs'
import { CLASS_COLORS, CLASS_BG } from '@/lib/cart'
import type { DTPreset, Pt } from '@/lib/datasets'
import { DEFAULT_DATA_SEED } from '@/lib/datasets'

const W = 520
const H = 420
const GX = 40
const GY = 32

export default function KnnWalk() {
  // ---- 数据 ----
  const [preset, setPreset] = useState<DTPreset>('moons')
  const [perClass, setPerClass] = useState(50)
  const [noise, setNoise] = useState(6)
  const [points, setPoints] = useState<Pt[]>(() => genPts('moons', 50, 6))
  const [seed, setSeed] = useState(DEFAULT_DATA_SEED)

  // ---- 交互 ----
  const [k, setK] = useState(5)
  const [query, setQuery] = useState({ x: 50, y: 50 })
  const [showRegion, setShowRegion] = useState(true)
  const dragging = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const X = useMemo(() => points.map((p) => [p.x, p.y]), [points])
  const y = useMemo(() => points.map((p) => p.label), [points])

  // 最近 k 个邻居（拖动时实时重算，规模小无需节流）
  const neighbors = useMemo(() => knnNeighbors(X, y, [query.x, query.y], k), [X, y, query, k])
  const [votesA, votesB] = knnVotes(neighbors)
  const verdict = knnPredict(neighbors)

  // 全图决策区域
  const regionCells = useMemo(() => {
    if (!showRegion || points.length < 4) return null
    const cells: number[] = []
    for (let r = 0; r < GY; r++) {
      for (let c = 0; c < GX; c++) {
        const cx = ((c + 0.5) / GX) * 100
        const cy = ((r + 0.5) / GY) * 100
        cells.push(knnPredict(knnNeighbors(X, y, [cx, cy], k)))
      }
    }
    return cells
  }, [showRegion, X, y, k, points.length])

  const regenerate = (p = preset, n = perClass, nz = noise, sd: number = seed) => setPoints(genPts(p, n, nz, sd))

  const changeSeed = (sd: number) => {
    setSeed(sd)
    setPoints(genPts(preset, perClass, noise, sd))
  }

  const xPx = (x: number) => (x / 100) * W
  const yPx = (yy: number) => H - (yy / 100) * H

  // ---- 拖动待分类点 ----
  const toData = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, 100 - ((e.clientY - rect.top) / rect.height) * 100)),
    }
  }
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = true
    svgRef.current?.setPointerCapture(e.pointerId)
    setQuery(toData(e))
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging.current) setQuery(toData(e))
  }
  const onPointerUp = () => {
    dragging.current = false
  }

  const neighborIdx = new Set(neighbors.map((n) => n.idx))
  const maxDist = neighbors.length ? neighbors[neighbors.length - 1].dist : 1

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">kNN 逐步推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          kNN 不"学习"，只"查户口"：来一个待分类点，翻出离它最近的 k 个老样本投票。
          <b className="text-stone-700">拖动画布上的星标</b>，实时看邻居、距离和投票怎么变。
        </p>
        <div className="mt-2">
          <MethodIntroCard id="knn" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：画布 ===== */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">数据画布 · 拖动星标试试看</CardTitle>
            <p className="text-xs text-stone-500">
              星标 = 待分类点（可拖动）；连线 = 到最近 {k} 个邻居；带圈的点 = 参与投票的邻居；星标颜色 = 当前判定结果。
            </p>
          </CardHeader>
          <CardContent>
            <svg
              ref={svgRef}
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              className="max-w-full cursor-crosshair rounded-lg border border-stone-200 bg-white"
              data-testid="knn-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* 全图决策区域 */}
              {regionCells &&
                regionCells.map((cls, i) => {
                  const c = i % GX
                  const r = Math.floor(i / GX)
                  return (
                    <rect
                      key={i}
                      x={(c / GX) * W}
                      y={H - ((r + 1) / GY) * H}
                      width={W / GX + 0.5}
                      height={H / GY + 0.5}
                      fill={CLASS_BG[cls]}
                    />
                  )
                })}
              {/* 邻居连线 */}
              {neighbors.map((nb, i) => {
                const p = points[nb.idx]
                return (
                  <line
                    key={i}
                    x1={xPx(query.x)}
                    y1={yPx(query.y)}
                    x2={xPx(p.x)}
                    y2={yPx(p.y)}
                    stroke={CLASS_COLORS[nb.label]}
                    strokeWidth={1.4}
                    strokeOpacity={0.75 - (nb.dist / maxDist) * 0.4}
                    data-testid="knn-link"
                  />
                )
              })}
              {/* 训练点 */}
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={xPx(p.x)} cy={yPx(p.y)} r={4.5} fill={CLASS_COLORS[p.label]} stroke="#fff" strokeWidth={1.2} />
                  {neighborIdx.has(i) && (
                    <circle cx={xPx(p.x)} cy={yPx(p.y)} r={8} fill="none" stroke={CLASS_COLORS[p.label]} strokeWidth={2} data-testid="knn-neighbor-ring" />
                  )}
                </g>
              ))}
              {/* 待分类星标 */}
              <g data-testid="knn-query" style={{ cursor: 'grab' }}>
                <circle cx={xPx(query.x)} cy={yPx(query.y)} r={13} fill="rgba(0,0,0,0)" />
                <path
                  d={starPath(xPx(query.x), yPx(query.y), 11, 4.6)}
                  fill={CLASS_COLORS[verdict]}
                  stroke="#fff"
                  strokeWidth={1.6}
                />
              </g>
              <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#a8a29e">
                特征 x₁
              </text>
              <text x={10} y={H / 2} fontSize={11} fill="#a8a29e" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">
                特征 x₂
              </text>
            </svg>
          </CardContent>
        </Card>

        {/* ===== 右侧：控制 + 邻居投票 ===== */}
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
                  setPoints(genPts(p, perClass, noise))
                }}
                onPerClass={setPerClass}
                onNoise={setNoise}
                onRegen={() => regenerate()}
                hint="「月牙」最能看出 k 的影响"
              />
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">算法</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SliderRow label="邻居数 k" value={k} min={1} max={15} step={1} onChange={setK} />
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <Checkbox checked={showRegion} onCheckedChange={(v) => setShowRegion(v === true)} data-testid="knn-region-toggle" />
                全图推演：背景着色显示决策区域
              </label>
              <p className="text-xs leading-5 text-stone-500">
                k = 1 时边界坑坑洼洼（每个点自说自话）；k = 15 时边界平滑但少数派被"淹死"。来回切切看！
              </p>
            </CardContent>
          </Card>

          {/* 邻居与投票 */}
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">邻居投票</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 投票条形 */}
              <div className="space-y-1.5" data-testid="knn-votes">
                {(
                  [
                    ['A 类', votesA, CLASS_COLORS[0]],
                    ['B 类', votesB, CLASS_COLORS[1]],
                  ] as const
                ).map(([name, v, color]) => (
                  <div key={name} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-stone-600">{name}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-stone-100">
                      <div
                        className="h-full rounded transition-all duration-200"
                        style={{ width: `${(v / Math.max(k, 1)) * 100}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-stone-700">{v} 票</span>
                  </div>
                ))}
              </div>
              <p className="rounded-lg px-3 py-2 text-center text-sm font-medium text-white" style={{ backgroundColor: CLASS_COLORS[verdict] }} data-testid="knn-verdict">
                判定为 {verdict === 0 ? 'A 类' : 'B 类'}（{Math.max(votesA, votesB)} : {Math.min(votesA, votesB)}）
              </p>
              {/* 距离列表 */}
              <div>
                <p className="mb-1 text-xs font-medium text-stone-600">最近 {neighbors.length} 个邻居（按距离排序）：</p>
                <div className="max-h-44 space-y-1 overflow-y-auto" data-testid="knn-dist-list">
                  {neighbors.map((nb, i) => (
                    <div key={i} className="flex items-center justify-between rounded bg-stone-50 px-2 py-1 font-mono text-xs text-stone-600">
                      <span>
                        #{i + 1} 号邻居 ·{' '}
                        <b style={{ color: CLASS_COLORS[nb.label] }}>{nb.label === 0 ? 'A' : 'B'} 类</b>
                      </span>
                      <span>距离 {nb.dist.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== 讲解卡 ===== */}
      <div className="grid gap-5 md:grid-cols-3">
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 距离公式回顾</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-stone-600">
            <p className="font-mono text-[13px] text-indigo-800">d = √( (x₁ − x₁′)² + (x₂ − x₂′)² )</p>
            <p className="mt-1 text-xs leading-5">
              就是初中的勾股定理：两个特征方向各算一条直角边，斜边就是"直线距离"。
              特征更多时也一样——每个特征贡献一个平方项，全部加起来再开根号。
            </p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · k 的影响</CardTitle>
          </CardHeader>
          <CardContent className="text-xs leading-5 text-stone-600">
            k 小 → 只信身边几个邻居，边界贴着数据长，<b>坑坑洼洼</b>（过拟合）；
            k 大 → 问的人多了意见被稀释，边界平滑，但<b>少数派会被多数派"淹死"</b>（欠拟合）。
            实务上常用奇数 k 避免平票，并用测试集挑 k。
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 必须先标准化</CardTitle>
          </CardHeader>
          <CardContent className="text-xs leading-5 text-stone-600">
            如果特征是"年收入（万元，0~100）"和"年龄（岁，18~70）"，收入差 1 万和年龄差 1 岁在距离公式里"一样重"——但这合理吗？
            量纲不同直接算距离会让数值大的特征"嗓门"更大。
            <b>先标准化（减均值除标准差）再算距离</b>，就像「数据预处理」模块里练过的那样。本页两个特征同为 0~100 坐标，天然公平。
          </CardContent>
        </Card>
      </div>

      <ThinkBox
        questions={[
          '打开"全图推演"，把 k 从 1 慢慢加到 15：决策区域的边界从"碎斑块"变成"大色块"，哪个 k 看起来最贴合"月牙"的形状？',
          'k = 1 时边界为什么坑坑洼洼？如果数据里混进几个标错类别的噪声点，k = 1 和 k = 15 谁更吃亏？',
          '把待分类点拖到 A 类深处的孤立 B 点附近：k 多大时这个"少数派孤岛"会被周围的多数派"淹死"？',
          'k 取最大值 = 全部训练样本时，无论星标拖到哪里判定结果都一样——这时的模型相当于在做什么？',
        ]}
      />
    </div>
  )
}

/** 五角星路径 */
function starPath(cx: number, cy: number, rOut: number, rIn: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOut : rIn
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push(`${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ') + ' Z'
}
