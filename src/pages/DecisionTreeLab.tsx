// 模块四：决策树分类实验（CART，逐步推演）
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import TreeDiagram from '@/components/TreeDiagram'
import {
  trainTree,
  predictPartial,
  computeAccuracy,
  visibleStats,
  CLASS_COLORS,
  CLASS_BG,
  type Criterion,
  type TrainedTree,
} from '@/lib/cart'
import { genDTPreset, DT_PRESET_NAMES, DEFAULT_DATA_SEED, type DTPreset, type Pt } from '@/lib/datasets'
import SeedControl from '@/components/SeedControl'
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, MousePointerClick, ArrowRight } from 'lucide-react'
import type { PageId } from '@/App'

const W = 520
const H = 420
const GX = 60 // 决策边界网格列数
const GY = 48 // 决策边界网格行数

export default function DecisionTreeLab({ onNavigate }: { onNavigate?: (p: PageId, subTab?: string) => void }) {
  // ---- 数据 ----
  const [preset, setPreset] = useState<DTPreset>('linear')
  const [perClass, setPerClass] = useState(60)
  const [noise, setNoise] = useState(6)
  const [points, setPoints] = useState<Pt[]>(() => genDTPreset('linear', 60, 6))
  const [seed, setSeed] = useState(DEFAULT_DATA_SEED)
  const [addClass, setAddClass] = useState<-1 | 0 | 1>(-1) // -1 关闭点击添加

  // ---- 算法配置 ----
  const [criterion, setCriterion] = useState<Criterion>('gini')
  const [maxDepth, setMaxDepth] = useState(4)
  const [minLeaf, setMinLeaf] = useState(3)
  const [showBoundary, setShowBoundary] = useState(true)

  // ---- 步进状态 ----
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  // 训练（数据或配置变化时整树重算，展开顺序随之固定）
  const trained: TrainedTree | null = useMemo(() => {
    if (points.length < 4) return null
    const t = trainTree(points, { criterion, maxDepth, minSamplesLeaf: minLeaf })
    return t
  }, [points, criterion, maxDepth, minLeaf])

  const totalSteps = trained?.internalNodes.length ?? 0
  const curStep = Math.min(step, totalSteps)

  // 数据/配置变化后步数可能超界，收敛一下
  useEffect(() => {
    if (step > totalSteps) setStep(totalSteps)
  }, [totalSteps, step])

  // 自动播放
  useEffect(() => {
    if (!playing) return
    if (curStep >= totalSteps) {
      setPlaying(false)
      return
    }
    const timer = setTimeout(() => setStep((s) => s + 1), 900)
    return () => clearTimeout(timer)
  }, [playing, curStep, totalSteps])

  // 决策边界网格（对当前可见树采样）
  const boundary = useMemo(() => {
    if (!trained || (!showBoundary && curStep < totalSteps)) return null
    const cells: number[] = []
    for (let r = 0; r < GY; r++) {
      for (let c = 0; c < GX; c++) {
        const x = ((c + 0.5) / GX) * 100
        const y = ((r + 0.5) / GY) * 100
        cells.push(predictPartial(trained.root, x, y, curStep))
      }
    }
    return cells
  }, [trained, showBoundary, curStep, totalSteps])

  const accuracy = trained ? computeAccuracy(points, trained.root, curStep) : 0
  const vStats = trained ? visibleStats(trained.root, curStep) : { depth: 0, leaves: 0 }

  // 当前正在展开的节点（第 curStep 步展开的是 expandOrder === curStep-1）
  const currentNode = curStep > 0 ? trained?.internalNodes[curStep - 1] : undefined

  const regenerate = (p: DTPreset = preset, n: number = perClass, nz: number = noise, sd: number = seed) => {
    setPoints(genDTPreset(p, n, nz, sd))
    setStep(0)
    setPlaying(false)
  }

  // 改种子时按新种子重算数据，保证「改什么就立刻看到什么」
  const changeSeed = (sd: number) => {
    setSeed(sd)
    setPoints(genDTPreset(preset, perClass, noise, sd))
    setStep(0)
    setPlaying(false)
  }

  // 画布点击添加点
  const svgRef = useRef<SVGSVGElement>(null)
  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (addClass === -1) return
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = 100 - ((e.clientY - rect.top) / rect.height) * 100
    setPoints((pts) => [...pts, { x, y, label: addClass }])
    setStep(0)
  }

  const xPx = (x: number) => (x / 100) * W
  const yPx = (y: number) => H - (y / 100) * H

  // 已展开节点的分裂线
  const splitLines = trained
    ? trained.internalNodes.filter((n) => n.expandOrder < curStep).map((n) => {
        const [xmin, ymin, xmax, ymax] = n.region
        const t = n.split!.threshold
        return n.split!.feature === 0
          ? { x1: t, y1: ymin, x2: t, y2: ymax, id: n.id }
          : { x1: xmin, y1: t, x2: xmax, y2: t, id: n.id }
      })
    : []

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">模块四 · 决策树逐步推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          决策树就像"二十个问题"游戏：每问一个是非问题（x₁ ≤ 52？），就把数据集切成两半，直到每半都足够纯。
          在这里你可以<b className="text-stone-700">一步步看这棵树是怎么长出来的</b>。
        </p>
        {/* 概念卡：不纯度与信息增益 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-2.5">
          <p className="text-xs leading-6 text-indigo-900">
            <b>概念卡 · 不纯度与信息增益：</b>"不纯度"就是一袋球有多混——全是一类 = 纯，一半一半 = 最混。
            每一步算法穷举所有切法，专挑<b>让不纯度下降最多（增益最大）</b>的一刀，就像猜谜时先问最能缩小范围的问题。
          </p>
          {onNavigate && (
            <button
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              onClick={() => onNavigate('theory', 'info')}
            >
              去「理论基础 → 信息论全家桶」第 2 节亲手拖分裂点
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：画布 ===== */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base text-stone-800">
              <span>数据画布</span>
              <div className="flex items-center gap-2 text-sm font-normal">
                <Button
                  size="sm"
                  variant={addClass !== -1 ? 'default' : 'outline'}
                  className={addClass !== -1 ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                  onClick={() => setAddClass(addClass === -1 ? 0 : -1)}
                >
                  <MousePointerClick className="mr-1 h-3.5 w-3.5" />
                  {addClass === -1 ? '点击画布加点' : '加点中…'}
                </Button>
                {addClass !== -1 && (
                  <div className="flex overflow-hidden rounded-md border border-stone-300">
                    {[0, 1].map((c) => (
                      <button
                        key={c}
                        onClick={() => setAddClass(c as 0 | 1)}
                        className={`px-2.5 py-1 text-xs text-white transition-opacity ${addClass === c ? 'opacity-100' : 'opacity-40'}`}
                        style={{ backgroundColor: CLASS_COLORS[c] }}
                      >
                        {c === 0 ? 'A 类' : 'B 类'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <svg
              ref={svgRef}
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              className={`max-w-full rounded-lg border border-stone-200 bg-white ${addClass !== -1 ? 'cursor-crosshair' : ''}`}
              onClick={onCanvasClick}
            >
              {/* 决策边界背景 */}
              {boundary &&
                boundary.map((cls, i) => {
                  const c = i % GX
                  const r = Math.floor(i / GX)
                  return (
                    <rect
                      key={i}
                      x={(c / GX) * W}
                      y={(r / GY) * H}
                      width={W / GX + 0.5}
                      height={H / GY + 0.5}
                      fill={CLASS_BG[cls]}
                    />
                  )
                })}
              {/* 分裂线 */}
              {splitLines.map((l) => (
                <line
                  key={l.id}
                  x1={xPx(l.x1)}
                  y1={yPx(l.y1)}
                  x2={xPx(l.x2)}
                  y2={yPx(l.y2)}
                  stroke="#4f46e5"
                  strokeWidth={2}
                  className="transition-all duration-300"
                />
              ))}
              {/* 数据点 */}
              {points.map((p, i) => (
                <circle key={i} cx={xPx(p.x)} cy={yPx(p.y)} r={4.5} fill={CLASS_COLORS[p.label]} stroke="#fff" strokeWidth={1.2} />
              ))}
              {/* 坐标轴标注 */}
              <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#a8a29e">
                特征 x₁
              </text>
              <text x={10} y={H / 2} fontSize={11} fill="#a8a29e" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">
                特征 x₂
              </text>
            </svg>

            {/* 指标 */}
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-stone-50 py-2">
                <p className="text-xs text-stone-500">训练准确率</p>
                <p className="font-mono text-lg font-bold text-indigo-700">{(accuracy * 100).toFixed(1)}%</p>
                <p className="text-[10px] text-stone-400">在自己做过的"作业"上的得分</p>
              </div>
              <div className="rounded-lg bg-stone-50 py-2">
                <p className="text-xs text-stone-500">当前树深度</p>
                <p className="font-mono text-lg font-bold text-indigo-700">{vStats.depth}</p>
                <p className="text-[10px] text-stone-400">越深越容易过拟合</p>
              </div>
              <div className="rounded-lg bg-stone-50 py-2">
                <p className="text-xs text-stone-500">叶节点数</p>
                <p className="font-mono text-lg font-bold text-indigo-700">{vStats.leaves}</p>
                <p className="text-[10px] text-stone-400">越多 = 规则越碎、越难解释</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ===== 右侧：控制面板 ===== */}
        <div className="space-y-4">
          {/* 数据控制 */}
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">数据</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(DT_PRESET_NAMES) as DTPreset[]).map((p) => (
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
                    {DT_PRESET_NAMES[p]}
                  </Button>
                ))}
              </div>
              <SliderRow label="每类样本数" value={perClass} min={20} max={200} step={10} onChange={setPerClass} />
              <SliderRow label="噪声强度" value={noise} min={0} max={30} step={1} onChange={setNoise} />
              <SeedControl seed={seed} onChange={changeSeed} onReroll={() => changeSeed(seed + 1)} className="mt-1" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => regenerate()}>
                  按当前设置生成
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPoints([])
                    setStep(0)
                  }}
                >
                  清空画布
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 算法配置 */}
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">算法</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RadioGroup
                value={criterion}
                onValueChange={(v) => {
                  setCriterion(v as Criterion)
                  setStep(0)
                }}
                className="flex gap-4"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="gini" id="gini" />
                  <Label htmlFor="gini" className="text-sm">Gini 系数</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="entropy" id="entropy" />
                  <Label htmlFor="entropy" className="text-sm">信息熵</Label>
                </div>
              </RadioGroup>
              <SliderRow label="最大深度" value={maxDepth} min={1} max={6} onChange={(v) => { setMaxDepth(v); setStep(0) }} />
              <SliderRow label="叶节点最小样本数" value={minLeaf} min={1} max={10} onChange={(v) => { setMinLeaf(v); setStep(0) }} />
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <Checkbox checked={showBoundary} onCheckedChange={(v) => setShowBoundary(v === true)} />
                实时显示决策边界
              </label>
            </CardContent>
          </Card>

          {/* 步进控制 */}
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base text-stone-800">
                <span>逐步推演</span>
                <span className="font-mono text-sm font-normal text-stone-500">
                  {curStep} / {totalSteps} 步
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" disabled={curStep === 0} onClick={() => { setPlaying(false); setStep(curStep - 1) }}>
                  <ChevronLeft className="h-4 w-4" />
                  上一步
                </Button>
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700"
                  disabled={curStep >= totalSteps}
                  onClick={() => setStep(curStep + 1)}
                >
                  下一步
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (curStep >= totalSteps) setStep(0)
                    setPlaying(!playing)
                  }}
                >
                  {playing ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                  {playing ? '暂停' : '自动播放'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setStep(0) }}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              {/* 当前节点详情 */}
              {currentNode ? (
                <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm">
                  <p className="font-medium text-indigo-900">
                    第 {curStep} 步：展开节点 #{currentNode.id}（深度 {currentNode.depth}）
                  </p>
                  <p className="text-xs text-stone-600">
                    样本 {currentNode.indices.length} 个（A:{currentNode.counts[0]} B:{currentNode.counts[1]}），
                    当前{criterion === 'gini' ? '基尼' : '熵'} = <b className="font-mono">{currentNode.impurity.toFixed(4)}</b>
                  </p>
                  <p className="text-xs font-medium text-stone-700">候选分裂 Top {currentNode.split?.candidates.length ?? 0}：</p>
                  <div className="space-y-1">
                    {currentNode.split?.candidates.map((c, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded px-2 py-1 font-mono text-xs ${
                          i === 0 ? 'bg-orange-100 font-semibold text-orange-800 ring-1 ring-orange-300' : 'bg-white text-stone-600'
                        }`}
                      >
                        <span>
                          x{c.feature + 1} ≤ {c.threshold.toFixed(1)} {i === 0 && '✓ 被选中'}
                        </span>
                        <span>增益 {c.gain.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-500">
                  {totalSteps === 0
                    ? '当前数据下无需分裂（或样本太少）。试试点击画布加点，或换一个预设数据集。'
                    : '点"下一步"展开根节点：算法会穷举所有候选分裂，挑增益最大的一刀。'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== 树结构图 ===== */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-stone-800">树结构图</CardTitle>
          <p className="text-xs text-stone-500">
            节点内小条形 = 类别分布（橙 A / 蓝 B）；高亮节点 = 当前步骤刚展开；叶子标注预测类别。
          </p>
        </CardHeader>
        <CardContent>
          <TreeDiagram root={trained?.root ?? null} step={curStep} />
        </CardContent>
      </Card>

      <ThinkBox
        questions={[
          '把噪声调到 30 再生成，准确率掉到多少？树变深了吗？为什么噪声会让树"长胡子"？',
          '换成"同心圆"数据集，一棵只能画横竖直线的树要怎么逼近圆形边界？把最大深度从 1 调到 6 看看边界的变化。',
          '用 Gini 和熵各训一遍"月牙"数据，树的分裂顺序一样吗？最终准确率差别大吗？',
          '把"叶节点最小样本数"调到 10，树会变浅还是变深？这对过拟合有什么影响？',
        ]}
      />
    </div>
  )
}
