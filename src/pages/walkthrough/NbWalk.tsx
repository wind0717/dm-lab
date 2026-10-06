// 朴素贝叶斯逐步推演：先验 → 拟合高斯曲线 → 来一个待分类点完整演算
import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ThinkBox from '@/components/ThinkBox'
import StepControls from '@/components/StepControls'
import { MethodIntroCard } from '@/components/MethodIntro'
import { WalkDataPanel, genPts } from '@/pages/walkthrough/walkShared'
import { nbFit, nbPosterior, gaussPdf, type NbFit } from '@/lib/walkthroughs'
import { CLASS_COLORS } from '@/lib/cart'
import type { DTPreset, Pt } from '@/lib/datasets'
import { DEFAULT_DATA_SEED } from '@/lib/datasets'
import { Shuffle } from 'lucide-react'

const W = 520
const H = 420

export default function NbWalk() {
  // ---- 数据（两个高斯簇） ----
  const [preset, setPreset] = useState<DTPreset>('linear')
  const [perClass, setPerClass] = useState(60)
  const [noise, setNoise] = useState(4)
  const [points, setPoints] = useState<Pt[]>(() => genPts('linear', 60, 4))
  const [seed, setSeed] = useState(DEFAULT_DATA_SEED)

  // ---- 步进（共 3 步：0=先验 1=拟合曲线 2=待分类点演算） ----
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const totalSteps = 2

  // ---- 待分类点（从样本里随机挑） ----
  const [queryIdx, setQueryIdx] = useState(0)
  const query = points[Math.min(queryIdx, points.length - 1)]

  const X = useMemo(() => points.map((p) => [p.x, p.y]), [points])
  const y = useMemo(() => points.map((p) => p.label), [points])
  const fit: NbFit | null = useMemo(() => (points.length >= 10 ? nbFit(X, y) : null), [X, y, points.length])
  const post = useMemo(
    () => (fit && query ? nbPosterior(fit, [query.x, query.y]) : null),
    [fit, query],
  )

  const regenerate = (p = preset, n = perClass, nz = noise, sd: number = seed) => {
    setPoints(genPts(p, n, nz, sd))
    setStep(0)
    setPlaying(false)
    setQueryIdx(0)
  }

  // 换种子：重算数据并沿用既有重置逻辑
  const changeSeed = (sd: number) => {
    setSeed(sd)
    regenerate(preset, perClass, noise, sd)
  }

  const shuffleQuery = () => setQueryIdx(Math.floor(Math.random() * points.length))

  const xPx = (x: number) => (x / 100) * W
  const yPx = (yy: number) => H - (yy / 100) * H

  const stepTitles = ['第 1 步：统计先验（两类各占多少）', '第 2 步：为每个特征拟合钟形曲线', '第 3 步：来一个待分类点，完整演算']

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">朴素贝叶斯逐步推演</h1>
        <p className="mt-1 text-sm text-stone-500">
          朴素贝叶斯的"学习"就是<b className="text-stone-700">做统计</b>：先数两类各有多少（先验），
          再量出每类在每个特征上的"典型长相"（钟形曲线），最后对新样本逐项查表、相乘、归一化。
        </p>
        <div className="mt-2">
          <MethodIntroCard id="nb" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* ===== 左侧：画布 + 高斯曲线小图 ===== */}
        <div className="space-y-5">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">数据画布</CardTitle>
              <p className="text-xs text-stone-500">
                两个高斯簇（橙 A / 蓝 B）。{step >= 2 && '星标 = 当前待分类点。'}
              </p>
            </CardHeader>
            <CardContent>
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid="nb-canvas">
                {points.map((p, i) => (
                  <circle key={i} cx={xPx(p.x)} cy={yPx(p.y)} r={4.5} fill={CLASS_COLORS[p.label]} stroke="#fff" strokeWidth={1.2} fillOpacity={step >= 2 && i === queryIdx ? 0.25 : 0.9} />
                ))}
                {step >= 2 && query && (
                  <g data-testid="nb-query">
                    <circle cx={xPx(query.x)} cy={yPx(query.y)} r={10} fill="none" stroke="#4f46e5" strokeWidth={2} strokeDasharray="3 2" />
                    <circle cx={xPx(query.x)} cy={yPx(query.y)} r={4} fill="#4f46e5" />
                  </g>
                )}
                <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#a8a29e">
                  特征 x₁
                </text>
                <text x={10} y={H / 2} fontSize={11} fill="#a8a29e" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">
                  特征 x₂
                </text>
              </svg>
            </CardContent>
          </Card>

          {/* 高斯曲线小图：第 2 步起显示 */}
          {step >= 1 && fit && (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((j) => (
                <GaussChart
                  key={j}
                  fit={fit}
                  feature={j}
                  queryValue={step >= 2 && query ? (j === 0 ? query.x : query.y) : null}
                  queryPdf={step >= 2 && post ? [post.pdfA[j], post.pdfB[j]] : null}
                />
              ))}
            </div>
          )}
        </div>

        {/* ===== 右侧：控制 + 演算 ===== */}
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
                hint="高斯簇是 NB 的主场，「月牙」可看它的局限"
              />
            </CardContent>
          </Card>

          <StepControls step={step} totalSteps={totalSteps} playing={playing} onStep={setStep} onPlaying={setPlaying} intervalMs={1200}>
            <p className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm font-medium text-indigo-900" data-testid="nb-step-label">
              {stepTitles[Math.min(step, totalSteps)]}
            </p>

            {/* 第 1 步：先验 */}
            {step >= 0 && fit && (
              <div className="space-y-1.5 rounded-lg bg-stone-50 p-3" data-testid="nb-prior">
                <p className="text-xs font-medium text-stone-600">先验概率 P(c) = 各类占比：</p>
                {(
                  [
                    ['A 类', fit.counts[0], fit.prior[0], CLASS_COLORS[0]],
                    ['B 类', fit.counts[1], fit.prior[1], CLASS_COLORS[1]],
                  ] as const
                ).map(([name, cnt, p, color]) => (
                  <div key={name} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-stone-600">{name}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-stone-200/70">
                      <div className="h-full rounded" style={{ width: `${p * 100}%`, backgroundColor: color }} />
                    </div>
                    <span className="w-28 text-right font-mono text-stone-700">
                      {cnt}/{fit.counts[0] + fit.counts[1]} = {p.toFixed(3)}
                    </span>
                  </div>
                ))}
                {step === 0 && (
                  <p className="pt-1 text-xs leading-5 text-stone-500">先验就是"不看任何特征时的第一印象"：班上一半 A 一半 B，先验各 0.5；若 A 占九成，新样本上来就先偏向 A。</p>
                )}
              </div>
            )}

            {/* 第 2 步：曲线说明 */}
            {step === 1 && fit && (
              <p className="rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-600">
                左下角两张小图：x₁、x₂ 两个特征上，A 类（橙）和 B 类（蓝）各自的钟形曲线。
                曲线中心 = 该类的特征均值 μ，胖瘦 = 标准差 σ。之后来一个点，就在曲线上"读高度"——高度越大，说明这个取值在该类中越典型。
              </p>
            )}

            {/* 第 3 步：完整演算 */}
            {step >= 2 && fit && post && query && (
              <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3 text-xs" data-testid="nb-calc">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-stone-700">对待分类点 ({query.x.toFixed(0)}, {query.y.toFixed(0)}) 演算：</p>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={shuffleQuery} data-testid="nb-shuffle">
                    <Shuffle className="mr-1 h-3 w-3" />
                    换一个点
                  </Button>
                </div>
                {(
                  [
                    ['A 类', fit.prior[0], post.pdfA, post.numA, CLASS_COLORS[0]],
                    ['B 类', fit.prior[1], post.pdfB, post.numB, CLASS_COLORS[1]],
                  ] as const
                ).map(([name, prior, pdf, num, color]) => (
                  <div key={name} className="space-y-0.5 rounded bg-stone-50 px-2 py-1.5 font-mono leading-5 text-stone-600">
                    <p style={{ color }} className="font-sans font-medium">
                      {name}
                    </p>
                    <p>
                      P({name[0]}) = {prior.toFixed(3)}
                    </p>
                    <p>
                      P(x₁|{name[0]}) = {pdf[0].toFixed(4)}　P(x₂|{name[0]}) = {pdf[1].toFixed(4)}
                    </p>
                    <p>
                      分子 = {prior.toFixed(3)} × {pdf[0].toFixed(4)} × {pdf[1].toFixed(4)} = <b>{num.toExponential(3)}</b>
                    </p>
                  </div>
                ))}
                <p className="font-mono leading-5 text-stone-600">
                  归一化：P(A|x) = {post.numA.toExponential(2)} ÷ ({post.numA.toExponential(2)} + {post.numB.toExponential(2)})
                </p>
                {/* 后验对比条形 */}
                <div className="space-y-1.5 pt-1" data-testid="nb-posterior">
                  {(
                    [
                      ['P(A|x)', post.pA, CLASS_COLORS[0]],
                      ['P(B|x)', post.pB, CLASS_COLORS[1]],
                    ] as const
                  ).map(([name, p, color]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-14 font-mono text-stone-600">{name}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-stone-100">
                        <div className="h-full rounded transition-all duration-300" style={{ width: `${p * 100}%`, backgroundColor: color }} />
                      </div>
                      <span className="w-12 text-right font-mono text-stone-700">{p.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
                <p
                  className="rounded-lg px-3 py-1.5 text-center font-sans text-sm font-medium text-white"
                  style={{ backgroundColor: CLASS_COLORS[post.pB >= post.pA ? 1 : 0] }}
                  data-testid="nb-verdict"
                >
                  判定为 {post.pB >= post.pA ? 'B 类' : 'A 类'}（把握 {(Math.max(post.pA, post.pB) * 100).toFixed(1)}%）
                </p>
              </div>
            )}
          </StepControls>
        </div>
      </div>

      {/* ===== 讲解卡 ===== */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · "朴素"到底朴素在哪？</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-stone-600">
            <p>
              完整算 P(x₁, x₂ | c) 需要知道两个特征的<b>联合</b>分布，数据少时根本估不准。
              "朴素"的做法是拍拍脑袋假设<b>特征互相独立</b>：P(x₁, x₂ | c) ≈ P(x₁ | c) × P(x₂ | c)，各算各的再相乘。
            </p>
            <p className="mt-1">
              这个假设常常并不成立（比如收入和学历明明相关），但因为分类只看<b>谁大谁小</b>，不要求概率算得多准，所以效果意外的好——
              错的假设，常常换来对的排序。
            </p>
          </CardContent>
        </Card>
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">讲解卡 · 为什么概率要"相乘"？</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-stone-600">
            <p>
              类比破案的旁证：单独看"口音像 B"可能只有六成把握，单独看"口味像 B"也是六成；
              但如果两条线索<b>独立</b>，同时指向 B 的份量就不是相加而是相乘累积——多个弱证据可以叠出强结论。
            </p>
            <p className="mt-1">
              乘完两个类各得一个"分子"，最后除以两者之和（归一化），就得到和为 1 的后验概率 P(A|x) 与 P(B|x)。
            </p>
          </CardContent>
        </Card>
      </div>

      <ThinkBox
        questions={[
          '多点几次"换一个点"：落在两簇交界处的点，后验概率是不是接近 0.5 : 0.5？',
          '把噪声调到 20 再重新推演：钟形曲线变胖了，同一个待分类点的"把握"下降了吗？',
          '换成"月牙"数据集：高斯曲线还能描出月牙的形状吗？朴素贝叶斯在哪类数据形状下会翻车？',
          '如果训练数据里 A 类占 95%、B 类只占 5%，先验会对判定产生什么影响？一个长得很像 B 的点还有可能被判成 A 吗？',
        ]}
      />
    </div>
  )
}

// ============================================================
// 单特征高斯曲线小图：两类钟形曲线叠加 + 待分类点取值标注
// ============================================================
function GaussChart({
  fit,
  feature,
  queryValue,
  queryPdf,
}: {
  fit: NbFit
  feature: number
  queryValue: number | null
  queryPdf: [number, number] | null
}) {
  const SW = 250
  const SH = 170
  const PAD = { l: 30, r: 8, t: 14, b: 22 }
  const iw = SW - PAD.l - PAD.r
  const ih = SH - PAD.t - PAD.b

  const sx = (x: number) => PAD.l + (x / 100) * iw
  const maxPdf = Math.max(
    1e-6,
    gaussPdf(fit.mean[0][feature], fit.mean[0][feature], fit.varr[0][feature]),
    gaussPdf(fit.mean[1][feature], fit.mean[1][feature], fit.varr[1][feature]),
  )
  const sy = (p: number) => PAD.t + (1 - p / (maxPdf * 1.15)) * ih

  const curve = (c: 0 | 1) => {
    const pts: string[] = []
    for (let i = 0; i <= 100; i++) {
      const p = gaussPdf(i, fit.mean[c][feature], fit.varr[c][feature])
      pts.push(`${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(p).toFixed(1)}`)
    }
    return pts.join(' ')
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-stone-600">特征 x{feature + 1} 上的两类钟形曲线</p>
      <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} className="max-w-full rounded-lg border border-stone-200 bg-white" data-testid={`nb-gauss-${feature}`}>
        <line x1={sx(0)} y1={sy(0)} x2={sx(100)} y2={sy(0)} stroke="#a8a29e" strokeWidth={1} />
        {/* 曲线 */}
        {([0, 1] as const).map((c) => (
          <path key={c} d={curve(c)} fill="none" stroke={CLASS_COLORS[c]} strokeWidth={2} />
        ))}
        {/* 均值标注 */}
        {([0, 1] as const).map((c) => (
          <text key={c} x={sx(fit.mean[c][feature])} y={sy(gaussPdf(fit.mean[c][feature], fit.mean[c][feature], fit.varr[c][feature])) - 5} textAnchor="middle" fontSize={10} fill={CLASS_COLORS[c]}>
            μ_{c === 0 ? 'A' : 'B'}≈{fit.mean[c][feature].toFixed(0)}
          </text>
        ))}
        {/* 待分类点取值 */}
        {queryValue !== null && queryPdf && (
          <g>
            <line x1={sx(queryValue)} y1={sy(0)} x2={sx(queryValue)} y2={sy(maxPdf * 1.1)} stroke="#4f46e5" strokeWidth={1.4} strokeDasharray="4 3" />
            <text x={sx(queryValue)} y={sy(0) + 12} textAnchor="middle" fontSize={10} fill="#4f46e5">
              x={queryValue.toFixed(0)}
            </text>
            {([0, 1] as const).map((c) => (
              <g key={c}>
                <circle cx={sx(queryValue)} cy={sy(queryPdf[c])} r={3.2} fill={CLASS_COLORS[c]} stroke="#fff" strokeWidth={1} />
                <text x={sx(queryValue) + 6} y={sy(queryPdf[c]) + 3} fontSize={9.5} fill={CLASS_COLORS[c]} data-testid={`nb-pdf-${feature}-${c}`}>
                  {queryPdf[c].toFixed(4)}
                </text>
              </g>
            ))}
          </g>
        )}
        {[0, 50, 100].map((v) => (
          <text key={v} x={sx(v)} y={SH - 6} textAnchor="middle" fontSize={9.5} fill="#a8a29e">
            {v}
          </text>
        ))}
      </svg>
      <p className="mt-0.5 text-[11px] leading-4 text-stone-400">
        高度 = 该取值在这类中的"典型程度"（概率密度）。{queryValue !== null && '虚线 = 待分类点的取值，读两条曲线在虚线处的高度。'}
      </p>
    </div>
  )
}
