// XGBoost 逐步推演：第 k 步 = 加一轮提升（拟合当前负梯度残差 y−p 的小树）
// 画布：概率背景着色 + 本轮被"重点关照"的样本高亮（残差越大圈越大）
// 对比开关：只看第 1 棵树 vs 全部 k 轮叠加（第一轮粗糙、逐轮精细）
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CurveChart from '@/components/CurveChart'
import StepControls from '@/components/StepControls'
import { MethodIntroCard } from '@/components/MethodIntro'
import { WalkDataPanel, genPts } from '@/pages/walkthrough/walkShared'
import { xgbWalkthrough, xgbProba } from '@/lib/walkthroughs2'
import { CLASS_COLORS } from '@/lib/cart'
import type { DTPreset, Pt } from '@/lib/datasets'
import { DEFAULT_DATA_SEED } from '@/lib/datasets'

const W = 520
const H = 420
const GX = 46
const GY = 38

export default function XgbWalk() {
  // ---- 数据 ----
  const [preset, setPreset] = useState<DTPreset>('linear')
  const [perClass, setPerClass] = useState(60)
  const [noise, setNoise] = useState(6)
  const [points, setPoints] = useState<Pt[]>(() => genPts('linear', 60, 6))
  const [seed, setSeed] = useState(DEFAULT_DATA_SEED)
  const [eta, setEta] = useState(0.3)
  const [rounds, setRounds] = useState(30)

  // ---- 步进 ----
  const [step, setStep] = useState(0) // 第 k 步 = 已加入 k 棵树
  const [playing, setPlaying] = useState(false)
  const [firstOnly, setFirstOnly] = useState(false) // 对比开关：只看第 1 棵树

  const X = useMemo(() => points.map((p) => [p.x, p.y]), [points])
  const y = useMemo(() => points.map((p) => p.label), [points])

  // 数据或超参变化 → 重新推演出整条提升序列
  const walk = useMemo(() => (points.length >= 10 ? xgbWalkthrough(X, y, rounds, eta, 3) : null), [X, y, rounds, eta, points.length])
  const totalSteps = walk ? walk.trees.length : 0
  const curStep = Math.min(step, totalSteps)
  const showFirst = firstOnly && curStep >= 1

  useEffect(() => {
    if (step > totalSteps) setStep(totalSteps)
  }, [totalSteps, step])

  const cur = walk?.steps[curStep]
  const done = curStep >= totalSteps && totalSteps > 0

  // ---- 概率渐变背景（网格采样 σ(F)） ----
  const bgCells = useMemo(() => {
    if (!walk) return null
    const cells: number[] = []
    for (let r = 0; r < GY; r++) {
      for (let c = 0; c < GX; c++) {
        const x = ((c + 0.5) / GX) * 100
        const yy = ((r + 0.5) / GY) * 100
        cells.push(xgbProba(walk, [x, yy], curStep, showFirst))
      }
    }
    return cells
  }, [walk, curStep, showFirst])

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

  const losses = walk?.steps.slice(0, curStep + 1).map((s) => s.loss) ?? []
  // 本轮（第 curStep 轮）新树"重点关照"的样本数：看它拟合的那份残差
  const focus = curStep >= 1 ? walk?.steps[curStep - 1] : undefined

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">XGBoost 逐步推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          XGBoost 像<b className="text-stone-700">错题本学习法</b>：每一轮新树不管别的，专攻前面所有树还"猜错 / 没把握"的样本。
          画布上圈越大的点，就是下一轮要被重点关照的样本。
        </p>
        <div className="mt-2">
          <MethodIntroCard id="xgb" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：画布 + 损失曲线 ===== */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base text-stone-800">
              <span>数据画布 · 概率背景与残差高亮</span>
              {/* 对比开关 */}
              <span className="flex overflow-hidden rounded-md border border-stone-300 text-xs">
                <button
                  className={`px-2.5 py-1 transition-colors ${!showFirst ? 'bg-indigo-600 font-medium text-white' : 'bg-white text-stone-600 hover:bg-stone-100'}`}
                  onClick={() => setFirstOnly(false)}
                  data-testid="xgb-mode-all"
                >
                  全部 {curStep} 轮叠加
                </button>
                <button
                  className={`px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${showFirst ? 'bg-indigo-600 font-medium text-white' : 'bg-white text-stone-600 hover:bg-stone-100'}`}
                  onClick={() => setFirstOnly(true)}
                  disabled={curStep < 1}
                  data-testid="xgb-mode-first"
                >
                  只看第 1 棵树
                </button>
              </span>
            </CardTitle>
            <p className="text-xs text-stone-500">
              背景色 = 当前模型认为该位置属于 B 类的把握；<b>圈 = 残差 |y − p|</b>，红圈 = 猜错（≥0.5）、黄圈 = 没把握（0.25~0.5），圈越大越"心虚"。
              拨到"只看第 1 棵树"，对比第 1 轮的粗糙边界和逐轮精修后的差别。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="xgb-canvas">
              {/* 概率渐变背景 */}
              {bgCells &&
                bgCells.map((p, i) => {
                  const c = i % GX
                  const r = Math.floor(i / GX)
                  const conf = Math.abs(p - 0.5) * 2
                  return (
                    <rect
                      key={i}
                      x={(c / GX) * W}
                      y={H - ((r + 1) / GY) * H}
                      width={W / GX + 0.5}
                      height={H / GY + 0.5}
                      fill={p >= 0.5 ? `rgba(59,130,246,${0.06 + 0.26 * conf})` : `rgba(249,115,22,${0.06 + 0.26 * conf})`}
                    />
                  )
                })}
              {/* 数据点 + 残差高亮 */}
              {points.map((p, i) => {
                const ar = cur ? Math.abs(cur.resid[i]) : 0
                return (
                  <g key={i}>
                    <circle cx={xPx(p.x)} cy={yPx(p.y)} r={4.5} fill={CLASS_COLORS[p.label]} stroke="#fff" strokeWidth={1.2} />
                    {ar >= 0.25 && (
                      <circle
                        cx={xPx(p.x)}
                        cy={yPx(p.y)}
                        r={6 + ar * 16}
                        fill="none"
                        stroke={ar >= 0.5 ? '#dc2626' : '#f59e0b'}
                        strokeWidth={1.8}
                        strokeOpacity={0.9}
                        data-testid="xgb-resid"
                      />
                    )}
                  </g>
                )
              })}
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
                对数损失随轮下降
                <span className="ml-2 text-xs font-normal text-stone-400">每加一棵树，损失就被磨掉一截——这就是"提升"（boosting）</span>
              </p>
              {losses.length > 1 ? (
                <CurveChart
                  xs={losses.map((_, i) => i)}
                  series={[{ ys: losses, color: '#4f46e5', label: '对数损失' }]}
                  markers={[{ x: curStep, color: '#f97316', label: cur?.loss.toFixed(3) }]}
                  width={520}
                  height={180}
                  xLabel="提升轮数（树的数量）"
                  xFormat={(v) => v.toFixed(0)}
                />
              ) : (
                <p className="rounded bg-stone-50 p-3 text-xs text-stone-400">点"下一步"加第 1 棵树，损失曲线会随轮下降。</p>
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
                hint="默认可线性分离带噪声，看残差圈怎么被逐轮消灭"
              />
            </CardContent>
          </Card>

          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">算法</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SliderRow
                label="学习率 η（每步迈多大）"
                value={eta}
                min={0.05}
                max={0.5}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => {
                  setEta(v)
                  setStep(0)
                  setPlaying(false)
                }}
              />
              <SliderRow
                label="提升轮数"
                value={rounds}
                min={10}
                max={40}
                step={5}
                onChange={(v) => {
                  setRounds(v)
                  setStep(0)
                  setPlaying(false)
                }}
              />
              <p className="text-xs leading-5 text-stone-500">
                η 小 = 每棵树的贡献打折、小步慢走，更稳但要更多轮；η 大 = 见效快但容易"矫枉过正"。试试 η=0.05 看损失曲线变成慢坡。
              </p>
            </CardContent>
          </Card>

          <StepControls
            step={curStep}
            totalSteps={totalSteps}
            playing={playing}
            onStep={setStep}
            onPlaying={setPlaying}
            intervalMs={400}
            extra={
              done ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700" data-testid="xgb-done">
                  {rounds} 轮完成
                </span>
              ) : undefined
            }
          >
            {cur && (
              <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm">
                <p className="font-medium text-indigo-900" data-testid="xgb-step-label">
                  {curStep === 0 ? '第 0 步：只有先验，全场一个分' : `第 ${curStep} 步：加入第 ${curStep} 棵"补错题"的小树`}
                </p>
                {curStep === 0 && (
                  <p className="text-xs leading-5 text-stone-600">
                    还没有任何树，模型只会按类别占比给一个统一概率（全图一个颜色），所有样本都是"没把握"。接下来每轮加一棵深度 ≤3 的小树，
                    专门拟合当前的残差 y − p。
                  </p>
                )}
                {focus && (
                  <p className="rounded-md bg-white px-2 py-1.5 text-xs leading-5 text-stone-700 ring-1 ring-indigo-100" data-testid="xgb-focus">
                    📌 本轮新树重点修正了 <b className="text-orange-600">{focus.wrong + focus.unsure}</b> 个此前猜错 / 没把握的样本
                    （猜错 {focus.wrong} 个 + 没把握 {focus.unsure} 个）。
                  </p>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-stone-700">
                  <span>
                    对数损失 = <b className="text-orange-600">{cur.loss.toFixed(4)}</b>
                  </span>
                  <span>
                    训练准确率 = <b className="text-indigo-700">{(cur.acc * 100).toFixed(1)}%</b>
                  </span>
                  <span>
                    仍猜错 = <b className="text-red-600">{cur.wrong}</b> 个
                  </span>
                  <span>
                    没把握 = <b className="text-amber-600">{cur.unsure}</b> 个
                  </span>
                </div>
                {done && (
                  <p className="rounded-md bg-white px-2 py-1.5 text-xs leading-5 text-emerald-800 ring-1 ring-emerald-200">
                    🏁 {rounds} 轮接力完成：损失从 {walk?.steps[0].loss.toFixed(3)} 磨到 {cur.loss.toFixed(3)}。
                    拨到"只看第 1 棵树"对比——第 1 轮的粗糙边界，就是这样被一轮轮精修成现在的样子的。
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
            <CardTitle className="text-base text-stone-800">讲解卡 · 森林 vs 提升：两种"人多力量大"</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              <b>随机森林 = 平行投票、互不相识</b>：所有树同时独立生长，最后举手表决。靠的是"错误互不相关"，治的是单树的"不稳"（方差）。
            </p>
            <p>
              <b>提升（Boosting）= 排队接力、专治前任的错</b>：树一棵接一棵上场，每一棵都先翻看前面所有树的"错题本"，
              只攻那些还答错的样本。靠的是"持续纠错"，治的是单棵浅树的"不准"（偏差）。
              所以森林的树可以很深，提升的树必须很浅——深树一轮就把噪声也学去了。
            </p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · "竞赛神器"与免责声明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-stone-600">
            <p>
              XGBoost 是数据挖掘竞赛和工业界表格数据的标配：风控评分、搜索排序、销量预测……
              在深度学习统治图像文本之前，表格类比赛的前排几乎被它包揽。
            </p>
            <p>
              <b>⚠️ 本演示是教学简化版：</b>真实 XGBoost 还有二阶导数（hessian）加权、正则项、列采样、缺失值自动处理等一整套工程优化，
              这里全部省略，只保留"逐步拟合残差、接力纠错"的核心直觉——这和你在推演里看到的完全一致。
            </p>
          </CardContent>
        </Card>
      </div>

      <ThinkBox
        questions={[
          '把学习率 η 从 0.3 调到 0.05 再自动播放：损失曲线形状怎么变？达到同样精度需要更多还是更少轮？这就是"小步慢走更稳"。',
          '拨到"只看第 1 棵树"，再拨回"全部叠加"：第 1 棵树的边界错在哪？后面的树是怎么一点点把它修好的？',
          '换成"月牙"数据集并把轮数拉满：训练准确率能刷到多高？残差圈全灭一定是好事吗——噪声点被"硬背下来"意味着什么？',
        ]}
      />
    </div>
  )
}
