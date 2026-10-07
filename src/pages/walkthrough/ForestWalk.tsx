// 随机森林逐步推演：第 k 步 = 训练第 k 棵树（bootstrap 抽样 + 节点级特征子集）
// 左侧：3×3 小图网格（每棵树自己的决策边界，各不相同 = 多样性）
//      + 大图（已训练树的多数投票决策区域）+ 准确率随树数曲线
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import StepControls from '@/components/StepControls'
import { MethodIntroCard } from '@/components/MethodIntro'
import { WalkDataPanel, genPts } from '@/pages/walkthrough/walkShared'
import { forestWalkthrough, forestVote } from '@/lib/walkthroughs2'
import { treePredictG, type TreeNodeG } from '@/lib/classifiers'
import { CLASS_COLORS, CLASS_BG } from '@/lib/cart'
import type { DTPreset, Pt } from '@/lib/datasets'
import { DEFAULT_DATA_SEED } from '@/lib/datasets'

const N_TREES = 9

const W = 520
const H = 340
const GX = 52
const GY = 34

// 小图尺寸
const MW = 162
const MH = 118
const MGX = 27
const MGY = 20

export default function ForestWalk() {
  // ---- 数据 ----
  const [preset, setPreset] = useState<DTPreset>('moons')
  const [perClass, setPerClass] = useState(60)
  const [noise, setNoise] = useState(6)
  const [points, setPoints] = useState<Pt[]>(() => genPts('moons', 60, 6))
  const [seed, setSeed] = useState(DEFAULT_DATA_SEED)
  const [maxDepth, setMaxDepth] = useState(4)

  // ---- 步进 ----
  const [step, setStep] = useState(0) // 第 k 步 = 已训练 k 棵树（0 = 还没开始）
  const [playing, setPlaying] = useState(false)

  const X = useMemo(() => points.map((p) => [p.x, p.y]), [points])
  const y = useMemo(() => points.map((p) => p.label), [points])

  // 数据或深度变化 → 重新推演出 9 棵树
  const walk = useMemo(() => (points.length >= 10 ? forestWalkthrough(X, y, N_TREES, maxDepth, 13) : null), [X, y, maxDepth, points.length])
  const totalSteps = walk ? walk.trees.length : 0
  const curStep = Math.min(step, totalSteps) // 已训练的树数

  useEffect(() => {
    if (step > totalSteps) setStep(totalSteps)
  }, [totalSteps, step])

  const done = curStep >= totalSteps && totalSteps > 0
  const trainedTrees = useMemo(() => walk?.trees.slice(0, curStep).map((t) => t.tree) ?? [], [walk, curStep])
  const curStat = curStep >= 1 ? walk?.steps[curStep - 1] : undefined

  // 测试集下标（在原 points 中的位置无法直接对应，这里直接用坐标判断训练/测试由 walk 内部完成；
  // 大图画布统一画全部点即可）
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

  // ---- 大图：多数投票决策区域 ----
  const voteCells = useMemo(() => {
    if (!walk || trainedTrees.length === 0) return null
    const cells: number[] = []
    for (let r = 0; r < GY; r++) {
      for (let c = 0; c < GX; c++) {
        const x = ((c + 0.5) / GX) * 100
        const yy = ((r + 0.5) / GY) * 100
        cells.push(forestVote(trainedTrees, [x, yy]))
      }
    }
    return cells
  }, [walk, trainedTrees])

  const accXs = walk?.steps.map((_, i) => i + 1).slice(0, curStep) ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">随机森林逐步推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          每一步种下一棵<b className="text-stone-700">与众不同</b>的树：它只见过一部分样本（有放回抽样）、每个节点只从一小撮特征里挑。
          九棵树各画各的边界，最后<b className="text-stone-700">少数服从多数</b>——三个臭皮匠，顶个诸葛亮。
        </p>
        <div className="mt-2">
          <MethodIntroCard id="rf" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：小图网格 + 投票大图 + 准确率曲线 ===== */}
        <div className="space-y-5">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">九棵树的"各自为政"（3×3 小图）</CardTitle>
              <p className="text-xs text-stone-500">
                每张小图是一棵树<b>独自</b>的决策区域。注意它们的边界各不相同——这正是随机森林想要的"多样性"：错误互不相关，投票才能互相抵消。
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid max-w-fit grid-cols-3 gap-2" data-testid="forest-grid">
                {Array.from({ length: N_TREES }, (_, k) => (
                  <MiniTree
                    key={k}
                    k={k}
                    tree={walk && k < curStep ? walk.trees[k].tree : null}
                    points={points}
                    current={k === curStep - 1}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">多数投票 · 森林的集体决策区域</CardTitle>
              <p className="text-xs text-stone-500">
                背景色 = 当前已训练的 {curStep} 棵树投票结果。对比上面任何一棵单树：投票后的边界更平滑、更接近数据的真实形状。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="forest-region">
                {voteCells
                  ? voteCells.map((cls, i) => {
                      const c = i % GX
                      const r = Math.floor(i / GX)
                      return <rect key={i} x={(c / GX) * W} y={H - ((r + 1) / GY) * H} width={W / GX + 0.5} height={H / GY + 0.5} fill={CLASS_BG[cls]} />
                    })
                  : null}
                {!voteCells && (
                  <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="#a8a29e">
                    点"下一步"种下第 1 棵树
                  </text>
                )}
                {points.map((p, i) => (
                  <circle key={i} cx={xPx(p.x)} cy={yPx(p.y)} r={4} fill={CLASS_COLORS[p.label]} stroke="#fff" strokeWidth={1.1} />
                ))}
                <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#a8a29e">
                  特征 x₁
                </text>
                <text x={10} y={H / 2} fontSize={11} fill="#a8a29e" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">
                  特征 x₂
                </text>
              </svg>

              {/* 准确率随树数曲线 */}
              <div>
                <p className="mb-1 text-sm font-medium text-stone-700">
                  准确率随树数变化
                  <span className="ml-2 text-xs font-normal text-stone-400">关键观察：测试准确率随树数稳中有升，且训练/测试差距不大</span>
                </p>
                {accXs.length > 1 ? (
                  <CurveChart
                    xs={accXs}
                    series={[
                      { ys: walk!.steps.map((s) => s.trainAcc).slice(0, curStep), color: '#4f46e5', label: '训练准确率' },
                      { ys: walk!.steps.map((s) => s.testAcc).slice(0, curStep), color: '#f97316', label: '测试准确率' },
                    ]}
                    markers={[{ x: curStep, color: '#dc2626', label: curStat ? `${(curStat.testAcc * 100).toFixed(0)}%` : '' }]}
                    width={520}
                    height={180}
                    xLabel="树的数量"
                    xFormat={(v) => v.toFixed(0)}
                  />
                ) : (
                  <p className="rounded bg-stone-50 p-3 text-xs text-stone-400">种下至少 2 棵树后，这里画出准确率曲线。</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

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
                hint="默认「月牙」：单棵树切不齐，森林投票才圆滑"
              />
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">算法</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SliderRow
                label="每棵树最大深度"
                value={maxDepth}
                min={1}
                max={4}
                step={1}
                onChange={(v) => {
                  setMaxDepth(v)
                  setStep(0)
                  setPlaying(false)
                }}
              />
              <p className="text-xs leading-5 text-stone-500">
                树的数量固定为教学规模的 9 棵（3×3）。深度调大：单棵树的边界更"碎"（更容易过拟合），但森林投票依然稳——这正是要体会的反差。
              </p>
            </CardContent>
          </Card>

          <StepControls
            step={curStep}
            totalSteps={totalSteps}
            playing={playing}
            onStep={setStep}
            onPlaying={setPlaying}
            intervalMs={900}
            extra={
              done ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700" data-testid="forest-done">
                  森林已长成
                </span>
              ) : undefined
            }
          >
            <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm">
              <p className="font-medium text-indigo-900" data-testid="forest-step-label">
                {curStep === 0 ? '第 0 步：空地一片，准备种树' : `第 ${curStep} 步：种下第 ${curStep} 棵树`}
              </p>
              {curStep === 0 && (
                <p className="text-xs leading-5 text-stone-600">
                  每棵树开工前先"抽盲盒"：从训练集有放回地抽同样多的样本（约 63% 会被抽到，有的重复抽中），
                  每个节点分裂时还只从随机一撮特征里挑——所以九棵树九个样。
                </p>
              )}
              {curStep >= 1 && walk && curStat && (
                <div className="grid grid-cols-1 gap-x-3 gap-y-1 font-mono sm:grid-cols-2 text-xs text-stone-700">
                  <span className="col-span-2">
                    本树抽到的不同样本 ≈{' '}
                    <b className="text-indigo-700">{new Set(walk.trees[curStep - 1].sampleIdx).size}</b> / {walk.Xtr.length} 个
                  </span>
                  <span>
                    累计训练准确率 = <b className="text-indigo-700">{(curStat.trainAcc * 100).toFixed(1)}%</b>
                  </span>
                  <span>
                    累计测试准确率 = <b className="text-orange-600">{(curStat.testAcc * 100).toFixed(1)}%</b>
                  </span>
                  {curStep >= 2 && (
                    <span className="col-span-2 font-sans text-stone-500">
                      对比第 1 棵树单干：测试 {(walk.steps[0].testAcc * 100).toFixed(1)}% → {curStep} 棵树投票 {(curStat.testAcc * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
              {done && walk && (
                <p className="rounded-md bg-white px-2 py-1.5 text-xs leading-5 text-emerald-800 ring-1 ring-emerald-200">
                  🌲 <b>收工对比：</b>翻回上面小图网格看「第 1 棵树」锯齿状的边界，再看大图中 9 棵树投票的平滑边界——
                  单树测试 {(walk.steps[0].testAcc * 100).toFixed(1)}%，森林 {(walk.steps[8].testAcc * 100).toFixed(1)}%。
                  树与树错得不一样，投票把错误互相抵消了。
                </p>
              )}
            </div>
          </StepControls>
        </div>
      </div>

      {/* ===== 讲解卡 ===== */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 三个随机性 = 三个臭皮匠</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              ① <b>抽样本</b>：每棵树训练前做有放回抽样（bootstrap），约 63% 的样本被抽到，每棵树"见的世面"不同；
              ② <b>抽特征</b>：每个节点分裂时只从随机一小撮特征里挑，防止所有树都盯着同一个"最强特征"；
              ③ <b>多棵树</b>：最后投票，少数服从多数。
            </p>
            <p>
              三重随机让树与树"想法不同"。就像会诊：九位医生各自独立诊断再举手表决，
              比一位名医拍脑袋更稳——前提是医生们的错误<b>互不相关</b>，随机性正是干这个的。
            </p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 为什么单树飘、森林稳？</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              决策树是"高方差"模型：数据稍微抖一抖，树就换个模样——因为它每一步都贪心地选当下最好的一刀，小噪声会被一路放大。
              换成大白话：单棵树容易<b>钻牛角尖</b>。
            </p>
            <p>
              平均 / 投票是降方差的通用药方：N 个差不多准、但错误互不相关的判断合在一起，整体的波动大约缩成原来的 1/N。
              森林牺牲的是"可解释性"——单条规则念不出来了，换来的是几乎不用调参的稳。
            </p>
          </CardContent>
        </Card>
      </div>

      <ThinkBox
        questions={[
          '树越多越不容易过拟合——那是不是越多越好？观察准确率曲线：从 5 棵到 9 棵还涨多少？想想"收益递减 + 计算成本"这笔账。',
          '把每棵树深度从 4 调到 1 再推演：单棵小图的边界变得多"粗"？森林投票的测试准确率掉了多少？',
          '对比小图网格里任意两棵树的边界：它们哪里不一样？如果九棵树长得一模一样（去掉抽样和特征子集），投票还有意义吗？',
        ]}
      />
    </div>
  )
}

// ============================================================
// 单棵树小图：自己的决策区域 + 数据点
// ============================================================
function MiniTree({ k, tree, points, current }: { k: number; tree: TreeNodeG | null; points: Pt[]; current: boolean }) {
  const cells = useMemo(() => {
    if (!tree) return null
    const out: number[] = []
    for (let r = 0; r < MGY; r++) {
      for (let c = 0; c < MGX; c++) {
        const x = ((c + 0.5) / MGX) * 100
        const yy = ((r + 0.5) / MGY) * 100
        out.push(treePredictG(tree, [x, yy]) >= 0.5 ? 1 : 0)
      }
    }
    return out
  }, [tree])

  return (
    <div className={`relative rounded-lg border ${current ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-stone-200'}`}>
      <svg width={MW} height={MH} viewBox={`0 0 ${MW} ${MH}`} className="block rounded-lg bg-white" data-testid={`forest-mini-${k}`}>
        {cells ? (
          cells.map((cls, i) => {
            const c = i % MGX
            const r = Math.floor(i / MGX)
            return <rect key={i} x={(c / MGX) * MW} y={MH - ((r + 1) / MGY) * MH} width={MW / MGX + 0.5} height={MH / MGY + 0.5} fill={CLASS_BG[cls]} />
          })
        ) : (
          <>
            <rect x={1} y={1} width={MW - 2} height={MH - 2} rx={6} fill="none" stroke="#d6d3d1" strokeWidth={1.2} strokeDasharray="5 4" />
            <text x={MW / 2} y={MH / 2 + 4} textAnchor="middle" fontSize={11} fill="#a8a29e">
              等待训练
            </text>
          </>
        )}
        {cells &&
          points.map((p, i) => (
            <circle key={i} cx={(p.x / 100) * MW} cy={MH - (p.y / 100) * MH} r={1.6} fill={CLASS_COLORS[p.label]} fillOpacity={0.85} />
          ))}
      </svg>
      <span className={`absolute left-1.5 top-1 rounded px-1 text-[10px] ${current ? 'bg-indigo-600 text-white' : 'bg-white/85 text-stone-500'}`}>
        第 {k + 1} 棵
      </span>
    </div>
  )
}
