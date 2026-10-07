// 模块三：分类实验 —— 「多方法对比工作台」+ 七个「逐步推演」
// 子页签由 URL 驱动（#/tree/svm），保证链接可直达、刷新不丢
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CsvUpload from '@/components/CsvUpload'
import DecisionTreeLab from '@/pages/DecisionTreeLab'
import LogisticWalk from '@/pages/walkthrough/LogisticWalk'
import KnnWalk from '@/pages/walkthrough/KnnWalk'
import NbWalk from '@/pages/walkthrough/NbWalk'
import SvmWalk from '@/pages/walkthrough/SvmWalk'
import ForestWalk from '@/pages/walkthrough/ForestWalk'
import XgbWalk from '@/pages/walkthrough/XgbWalk'
import { MethodIntroDetails } from '@/components/MethodIntro'
import {
  DecisionTreeClassifier,
  KNNClassifier,
  LogisticRegressionClassifier,
  GaussianNBClassifier,
  LinearSVMClassifier,
  RandomForestClassifier,
  XGBoostClassifier,
  subsampleKnnTrain,
  KNN_TRAIN_CAP,
  mulberry32,
  type Classifier,
} from '@/lib/classifiers'
import {
  trainTestSplit,
  accuracyScore,
  macroPRF,
  confusionMatrix,
  binaryCounts,
  rocPoints,
  aucOf,
  type RocPoint,
} from '@/lib/metrics'
import { CLASS_COLORS, CLASS_BG } from '@/lib/cart'
import { CASE_IDS, CASE_META, genCaseDataset, type CaseId, type Pt } from '@/lib/datasets'
import type { CsvData } from '@/lib/csv'
import { Play, GitCompareArrows, MousePointerClick, Database, UploadCloud, PenLine } from 'lucide-react'
import type { PageId } from '@/App'

// ------------------------------------------------------------
// 方法定义
// ------------------------------------------------------------
type MethodId = 'tree' | 'knn' | 'logreg' | 'nb' | 'svm' | 'rf' | 'xgb'

interface ParamDef {
  key: string
  label: string
  min: number
  max: number
  step: number
  def: number
  format?: (v: number) => string
}

interface MethodDef {
  id: MethodId
  name: string
  intuition: string // 一句话直觉
  scenario: string // 最常用场景 + 生活化例子
  params: ParamDef[]
}

const METHODS: MethodDef[] = [
  {
    id: 'tree',
    name: '决策树',
    intuition: '像"二十个问题"：一串是非判断，把数据越切越纯。',
    scenario: '需要向业务解释规则的场景，如审批规则梳理——每一条路径都能念给人听。',
    params: [{ key: 'maxDepth', label: '最大深度', min: 1, max: 10, step: 1, def: 6 }],
  },
  {
    id: 'knn',
    name: 'kNN 近邻',
    intuition: '看离你最近的 k 个邻居里哪类多，你就归为哪类。',
    scenario: '推荐与相似检索的直觉基础（"买过这个的人也买过…"），适合小数据集快速验证。',
    params: [{ key: 'k', label: '邻居数 k', min: 1, max: 25, step: 2, def: 5 }],
  },
  {
    id: 'logreg',
    name: '逻辑回归',
    intuition: '给每个特征打个分，加权求和后压成概率。',
    scenario: '信贷违约预测、广告点击率：需要"概率 + 可解释权重"的场景。',
    params: [{ key: 'lr', label: '学习率', min: 0.02, max: 0.5, step: 0.02, def: 0.1 }],
  },
  {
    id: 'nb',
    name: '朴素贝叶斯',
    intuition: '假设特征互相独立，用贝叶斯公式算各类别概率。',
    scenario: '文本分类鼻祖——垃圾邮件识别：看"中奖""免费"这些词出现的概率。',
    params: [],
  },
  {
    id: 'svm',
    name: 'SVM 支持向量机',
    intuition: '找一条离两类样本都最远的分界线（最大间隔）。',
    scenario: '小样本、高维度、边界清晰的场景，如手写数字识别的经典方案。',
    params: [{ key: 'C', label: '惩罚系数 C', min: 0.1, max: 100, step: 0.1, def: 1, format: (v) => v.toFixed(1) }],
  },
  {
    id: 'rf',
    name: '随机森林',
    intuition: '很多棵互不相同的树投票，少数服从多数。',
    scenario: '表格数据的万金油，特征多且关系复杂时首选，如欺诈检测。',
    params: [
      { key: 'nTrees', label: '树的数量', min: 10, max: 50, step: 5, def: 20 },
      { key: 'maxDepth', label: '每棵树深度', min: 2, max: 10, step: 1, def: 6 },
    ],
  },
  {
    id: 'xgb',
    name: 'XGBoost 教学版',
    intuition: '一轮轮加小树苗，每棵专门纠正前面留下的错误。',
    scenario: '竞赛和工业界表格数据标配，如风控评分、搜索排序。',
    params: [
      { key: 'rounds', label: '提升轮数', min: 10, max: 50, step: 5, def: 20 },
      { key: 'eta', label: '学习率 η', min: 0.05, max: 0.5, step: 0.05, def: 0.3, format: (v) => v.toFixed(2) },
    ],
  },
]

function buildClassifier(id: MethodId, p: Record<string, number>): Classifier {
  switch (id) {
    case 'tree':
      return new DecisionTreeClassifier(p.maxDepth ?? 6)
    case 'knn':
      return new KNNClassifier(p.k ?? 5)
    case 'logreg':
      return new LogisticRegressionClassifier(p.lr ?? 0.1, 2000)
    case 'nb':
      return new GaussianNBClassifier()
    case 'svm':
      return new LinearSVMClassifier(p.C ?? 1)
    case 'rf':
      return new RandomForestClassifier(p.nTrees ?? 20, p.maxDepth ?? 6)
    case 'xgb':
      return new XGBoostClassifier(p.rounds ?? 20, p.eta ?? 0.3)
  }
}

// ------------------------------------------------------------
// 数据与结果类型
// ------------------------------------------------------------
interface WorkData {
  X: number[][]
  y: number[]
  featureNames: string[]
  classNames: [string, string]
  sourceLabel: string
}

interface EvalResult {
  methodId: MethodId
  trainAcc: number
  testAcc: number
  macroF1: number
  confusion: { labels: number[]; m: number[][] }
  counts: { tp: number; fp: number; tn: number; fn: number }
  roc: RocPoint[]
  auc: number
  timeMs: number
  clf: Classifier
  Xte: number[][]
  yte: number[]
  /** kNN 大数据降级：训练集超过 KNN_TRAIN_CAP 时抽样为代表点（固定种子，可复现） */
  knnSampled?: { from: number; to: number }
}

const DEFAULT_PARAMS: Record<MethodId, Record<string, number>> = Object.fromEntries(
  METHODS.map((m) => [m.id, Object.fromEntries(m.params.map((p) => [p.key, p.def]))]),
) as Record<MethodId, Record<string, number>>

// ------------------------------------------------------------
// 页面组件
// ------------------------------------------------------------
interface ClassificationLabProps {
  /** 来自「数据预处理」的接力数据：到达后自动载入 CSV 数据源 */
  injectedCsv?: CsvData | null
  onInjectedConsumed?: () => void
  /** 由 URL 驱动的当前子页签（#/tree/svm） */
  routeTab?: ClassSubTab
  onNavigate?: (p: PageId, subTab?: string) => void
}

export type ClassSubTab = 'workbench' | 'dtree' | 'logreg' | 'knn' | 'nb' | 'svm' | 'rf' | 'xgb'

const SUB_TABS: Array<[ClassSubTab, string]> = [
  ['workbench', '多方法对比工作台'],
  ['dtree', '决策树逐步推演'],
  ['logreg', '逻辑回归推演'],
  ['knn', 'kNN 推演'],
  ['nb', '朴素贝叶斯推演'],
  ['svm', 'SVM 推演'],
  ['rf', '随机森林推演'],
  ['xgb', 'XGBoost 推演'],
]

const VALID: ClassSubTab[] = SUB_TABS.map(([id]) => id)

export default function ClassificationLab({ injectedCsv, onInjectedConsumed, routeTab = 'workbench', onNavigate }: ClassificationLabProps) {
  const routerNavigate = useNavigate()
  // 兜底非法子页签
  const subTab: ClassSubTab = VALID.includes(routeTab) ? routeTab : 'workbench'

  // 切换子页签时回到顶部
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [subTab])

  return (
    <div>
      {/* 子页签 */}
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <div className="inline-flex flex-wrap rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
          {SUB_TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => routerNavigate(`/tree/${id}`)}
              data-testid={`subtab-${id}`}
              className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                subTab === id ? 'bg-indigo-600 font-medium text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {subTab === 'workbench' && <Workbench injectedCsv={injectedCsv} onInjectedConsumed={onInjectedConsumed} />}
      {subTab === 'dtree' && <DecisionTreeLab onNavigate={onNavigate} />}
      {subTab === 'logreg' && <LogisticWalk />}
      {subTab === 'knn' && <KnnWalk />}
      {subTab === 'nb' && <NbWalk />}
      {subTab === 'svm' && <SvmWalk />}
      {subTab === 'rf' && <ForestWalk />}
      {subTab === 'xgb' && <XgbWalk />}
    </div>
  )
}

// ============================================================
// 多方法对比工作台
// ============================================================
function Workbench({ injectedCsv, onInjectedConsumed }: { injectedCsv?: CsvData | null; onInjectedConsumed?: () => void }) {
  const [method, setMethod] = useState<MethodId>('tree')
  const [params, setParams] = useState(DEFAULT_PARAMS)

  // ---- 数据来源 ----
  const [dataTab, setDataTab] = useState<'builtin' | 'csv' | 'draw'>('builtin')
  const [caseId, setCaseId] = useState<CaseId>('churn')
  const [caseData, setCaseData] = useState(() => genCaseDataset('churn'))
  const [csvData, setCsvData] = useState<CsvData | null>(null)
  const [drawPoints, setDrawPoints] = useState<Pt[]>([])
  const [drawClass, setDrawClass] = useState<-1 | 0 | 1>(0)

  // ---- 来自「数据预处理」的接力数据 ----
  const [fromPre, setFromPre] = useState(false)
  useEffect(() => {
    if (injectedCsv) {
      setCsvData(injectedCsv)
      setDataTab('csv')
      setFromPre(true)
      onInjectedConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedCsv])

  // ---- 评估 ----
  const [testRatio, setTestRatio] = useState(0.3)
  const [results, setResults] = useState<Partial<Record<MethodId, EvalResult>>>({})
  const [training, setTraining] = useState(false)
  const [trainError, setTrainError] = useState<string | null>(null)
  const [compared, setCompared] = useState(false)

  const data: WorkData = useMemo(() => {
    if (dataTab === 'csv' && csvData) {
      return { X: csvData.X, y: csvData.y, featureNames: csvData.featureNames, classNames: csvData.classNames, sourceLabel: '上传 CSV' }
    }
    if (dataTab === 'draw') {
      return {
        X: drawPoints.map((p) => [p.x, p.y]),
        y: drawPoints.map((p) => p.label),
        featureNames: ['特征 x₁', '特征 x₂'],
        classNames: ['A 类', 'B 类'],
        sourceLabel: '画布手绘',
      }
    }
    return {
      X: caseData.X,
      y: caseData.y,
      featureNames: caseData.featureNames,
      classNames: caseData.classNames,
      sourceLabel: caseData.name,
    }
  }, [dataTab, csvData, drawPoints, caseData])

  // 数据变了，旧结果作废
  useEffect(() => {
    setResults({})
    setCompared(false)
    setTrainError(null)
  }, [data])

  // ---- 训练 ----
  const trainOne = (id: MethodId, d: WorkData): EvalResult => {
    const t0 = performance.now()
    const { Xtr, ytr, Xte, yte } = trainTestSplit(d.X, d.y, testRatio, 42)
    // kNN 的 predict 是 O(n_te·n_tr·d) 暴力扫描，训练集超过 KNN_TRAIN_CAP 时
    // 先抽 2000 个代表点（固定种子），保证「全部方法横向对比」串行 7 个方法不卡死
    const knnSub = id === 'knn' ? subsampleKnnTrain(Xtr, ytr) : null
    const clf = buildClassifier(id, params[id])
    clf.fit(knnSub ? knnSub.X : Xtr, knnSub ? knnSub.y : ytr)
    const predTr = clf.predict(Xtr)
    const predTe = clf.predict(Xte)
    const proba = clf.predictProba(Xte)
    const timeMs = performance.now() - t0
    const roc = rocPoints(yte, proba)
    return {
      methodId: id,
      trainAcc: accuracyScore(ytr, predTr),
      testAcc: accuracyScore(yte, predTe),
      macroF1: macroPRF(yte, predTe).f1,
      confusion: confusionMatrix(yte, predTe),
      counts: binaryCounts(yte, predTe),
      roc,
      auc: aucOf(roc),
      timeMs,
      clf,
      Xte,
      yte,
      ...(knnSub?.sampled ? { knnSampled: { from: Xtr.length, to: KNN_TRAIN_CAP } } : {}),
    }
  }

  const validateData = (d: WorkData): string | null => {
    if (d.X.length < 20) return '样本太少：至少需要 20 个样本才能划分训练/测试集'
    const c0 = d.y.filter((v) => v === 0).length
    const c1 = d.y.length - c0
    if (c0 < 5 || c1 < 5) return `每个类别至少需要 5 个样本（当前 ${d.classNames[0]} ${c0} 个 / ${d.classNames[1]} ${c1} 个）`
    return null
  }

  const onTrain = () => {
    const err = validateData(data)
    if (err) {
      setTrainError(err)
      return
    }
    setTrainError(null)
    setTraining(true)
    setTimeout(() => {
      try {
        setResults((r) => ({ ...r, [method]: trainOne(method, data) }))
      } finally {
        setTraining(false)
      }
    }, 30)
  }

  const onCompareAll = () => {
    const err = validateData(data)
    if (err) {
      setTrainError(err)
      return
    }
    setTrainError(null)
    setTraining(true)
    setTimeout(() => {
      try {
        const all: Partial<Record<MethodId, EvalResult>> = {}
        for (const m of METHODS) all[m.id] = trainOne(m.id, data)
        setResults(all)
        setCompared(true)
      } finally {
        setTraining(false)
      }
    }, 30)
  }

  const result = results[method]
  const curMethod = METHODS.find((m) => m.id === method)!

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">模块三 · 分类实验：七种方法对比工作台</h1>
        <p className="mt-1 text-sm text-stone-500">
          同一个数据集，七种分类方法同场竞技：左边选方法、中间备数据、下方看评估。
          混淆矩阵和 ROC 曲线会自动用数字替你"念"出结果。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ===== 左栏：方法选择 ===== */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">① 选择方法</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  method === m.id
                    ? 'border-indigo-400 bg-indigo-50/70 ring-1 ring-indigo-300'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <p className={`text-sm font-medium ${method === m.id ? 'text-indigo-800' : 'text-stone-700'}`}>{m.name}</p>
                <p className="mt-0.5 text-xs leading-4 text-stone-500">{m.intuition}</p>
                <MethodIntroDetails id={m.id} />
                {m.params.length > 0 && (
                  <div className="mt-2 space-y-2 border-t border-stone-100 pt-2" onClick={(e) => e.stopPropagation()}>
                    {m.params.map((p) => (
                      <SliderRow
                        key={p.key}
                        label={p.label}
                        value={params[m.id][p.key] ?? p.def}
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        format={p.format}
                        onChange={(v) => setParams((prev) => ({ ...prev, [m.id]: { ...prev[m.id], [p.key]: v } }))}
                      />
                    ))}
                  </div>
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* ===== 中栏：数据 ===== */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">② 准备数据</CardTitle>
            {/* 数据来源页签 */}
            <div className="flex gap-1 pt-1">
              {(
                [
                  ['builtin', '内置案例', Database],
                  ['csv', '上传 CSV', UploadCloud],
                  ['draw', '画布手绘', PenLine],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setDataTab(id)}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${
                    dataTab === id ? 'bg-indigo-600 font-medium text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {dataTab === 'builtin' && (
              <BuiltinDataPanel
                caseId={caseId}
                caseData={caseData}
                onSelect={(id) => {
                  setCaseId(id)
                  setCaseData(genCaseDataset(id))
                }}
              />
            )}
            {dataTab === 'csv' && (
              <>
                {fromPre && csvData && (
                  <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                    ✅ 已载入来自「数据预处理」的数据：{csvData.y.length} 行 × {csvData.featureNames.length} 个特征，标签「{csvData.classNames.join(' / ')}」。重新上传 CSV 会覆盖它。
                  </p>
                )}
                <CsvUpload
                  onData={(d) => {
                    setCsvData(d)
                    setFromPre(false)
                  }}
                />
              </>
            )}
            {dataTab === 'draw' && (
              <DrawPanel points={drawPoints} setPoints={setDrawPoints} drawClass={drawClass} setDrawClass={setDrawClass} />
            )}
            {/* 当前数据概览 + 散点预览 */}
            <DataSummary data={data} />
          </CardContent>
        </Card>
      </div>

      {/* ===== 评估面板 ===== */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-stone-800">③ 训练与评估</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 概念提示条：为什么分训练集/测试集 */}
          <p className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs leading-5 text-indigo-900">
            <b>为什么要分训练集 / 测试集？</b>训练集是"平时作业"，测试集是"期末考试"——模型只能看作业学规律，再拿没见过的考卷评分，用做过的题考自己不算本事。
            <b>动手试试：</b>把下面的比例滑块拖到 9:1，测试集只剩一成，多点几次训练，看测试准确率怎样"看运气"地忽上忽下。
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-56">
              <SliderRow
                label="测试集占比"
                value={testRatio}
                min={0.1}
                max={0.5}
                step={0.05}
                format={(v) => { const t = Math.round(v * 100); return `训练 ${100 - t}% : 测试 ${t}%` }}
                onChange={setTestRatio}
              />
            </div>
            <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={training} onClick={onTrain}>
              <Play className="mr-1 h-4 w-4" />
              {training ? '训练中…' : `开始训练（${curMethod.name}）`}
            </Button>
            <Button variant="outline" disabled={training} onClick={onCompareAll}>
              <GitCompareArrows className="mr-1 h-4 w-4" />
              全部方法横向对比
            </Button>
            {trainError && <p className="text-sm text-red-600">{trainError}</p>}
          </div>

          {result ? (
            <EvalPanel result={result} methodName={curMethod.name} data={data} testRatio={testRatio} />
          ) : (
            <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500">
              还没有训练结果。选好方法和数据后点「开始训练」，或点「全部方法横向对比」一次跑完七种方法。
            </p>
          )}

          {/* 横向对比表 */}
          {compared && Object.keys(results).length > 1 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-stone-700">七种方法横向对比（点击行查看该方法详情）</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                      <th className="px-3 py-2">方法</th>
                      <th className="px-3 py-2">测试准确率</th>
                      <th className="px-3 py-2">宏 F1</th>
                      <th className="px-3 py-2">AUC</th>
                      <th className="px-3 py-2">训练耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METHODS.filter((m) => results[m.id]).map((m) => {
                      const r = results[m.id]!
                      return (
                        <tr
                          key={m.id}
                          onClick={() => setMethod(m.id)}
                          className={`cursor-pointer border-b border-stone-100 transition-colors ${
                            method === m.id ? 'bg-indigo-50 font-medium' : 'hover:bg-stone-50'
                          }`}
                        >
                          <td className="px-3 py-2">{m.name}</td>
                          <td className="px-3 py-2 font-mono">{(r.testAcc * 100).toFixed(1)}%</td>
                          <td className="px-3 py-2 font-mono">{r.macroF1.toFixed(3)}</td>
                          <td className="px-3 py-2 font-mono">{r.auc.toFixed(3)}</td>
                          <td className="px-3 py-2 font-mono">{r.timeMs.toFixed(0)} ms</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ThinkBox
        questions={[
          '同一数据集上换七种方法跑一遍：谁的训练准确率最高但测试准确率却掉下来了？这说明了什么？',
          '把 kNN 的 k 从 1 调到 25，观察决策区域小图从"碎斑块"变"大色块"的过程——k 太小为什么会过拟合？',
          '在"信贷违约"数据上对比逻辑回归和 XGBoost 的 ROC 曲线：AUC 相差大吗？如果差不多，为什么工业界还爱用更复杂的模型？',
          '把测试集占比调到 50% 再跑横向对比，各方法的排名稳定吗？样本量小时评估结果为什么"看运气"？',
        ]}
      />
    </div>
  )
}

// ============================================================
// 内置案例数据面板
// ============================================================
function BuiltinDataPanel({
  caseId,
  caseData,
  onSelect,
}: {
  caseId: CaseId
  caseData: ReturnType<typeof genCaseDataset>
  onSelect: (id: CaseId) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {CASE_IDS.map((id) => (
          <Button
            key={id}
            size="sm"
            variant={caseId === id ? 'default' : 'outline'}
            className={caseId === id ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
            onClick={() => onSelect(id)}
          >
            {CASE_META[id].name}
          </Button>
        ))}
      </div>
      <p className="text-xs leading-5 text-stone-500">{caseData.desc}</p>
    </div>
  )
}

// ============================================================
// 画布手绘面板
// ============================================================
const DRAW_W = 460
const DRAW_H = 280

function DrawPanel({
  points,
  setPoints,
  drawClass,
  setDrawClass,
}: {
  points: Pt[]
  setPoints: (p: Pt[]) => void
  drawClass: -1 | 0 | 1
  setDrawClass: (c: -1 | 0 | 1) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawClass === -1) return
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = 100 - ((e.clientY - rect.top) / rect.height) * 100
    setPoints([...points, { x, y, label: drawClass }])
  }
  const c0 = points.filter((p) => p.label === 0).length
  const c1 = points.length - c0
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={drawClass !== -1 ? 'default' : 'outline'}
          className={drawClass !== -1 ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
          onClick={() => setDrawClass(drawClass === -1 ? 0 : -1)}
        >
          <MousePointerClick className="mr-1 h-3.5 w-3.5" />
          {drawClass === -1 ? '点击画布加点' : '加点中…'}
        </Button>
        {drawClass !== -1 && (
          <div className="flex overflow-hidden rounded-md border border-stone-300">
            {[0, 1].map((c) => (
              <button
                key={c}
                onClick={() => setDrawClass(c as 0 | 1)}
                className={`px-2.5 py-1 text-xs text-white transition-opacity ${drawClass === c ? 'opacity-100' : 'opacity-40'}`}
                style={{ backgroundColor: CLASS_COLORS[c] }}
              >
                {c === 0 ? 'A 类' : 'B 类'}
              </button>
            ))}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={() => setPoints([])}>
          清空
        </Button>
        <span className="text-xs text-stone-500">
          已画 {points.length} 个点（A 类 {c0} / B 类 {c1}）
        </span>
      </div>
      <svg
        ref={svgRef}
        width={DRAW_W}
        height={DRAW_H}
        viewBox={`0 0 ${DRAW_W} ${DRAW_H}`}
        className={`max-w-full rounded-lg border border-stone-200 bg-white ${drawClass !== -1 ? 'cursor-crosshair' : ''}`}
        onClick={onClick}
      >
        {points.map((p, i) => (
          <circle
            key={i}
            cx={(p.x / 100) * DRAW_W}
            cy={DRAW_H - (p.y / 100) * DRAW_H}
            r={4.5}
            fill={CLASS_COLORS[p.label]}
            stroke="#fff"
            strokeWidth={1.2}
          />
        ))}
      </svg>
      <p className="text-xs text-stone-400">提示：至少画 20 个点、两类各 ≥5 个才能训练。想体验逐步建树可切到「决策树逐步推演」页签。</p>
    </div>
  )
}

// ============================================================
// 当前数据概览 + 2D 散点预览（前两列特征）
// ============================================================
function DataSummary({ data }: { data: WorkData }) {
  const scatter = useMemo(() => {
    if (data.X.length === 0) return null
    const d = data.X[0].length
    const mins = [Infinity, Infinity]
    const maxs = [-Infinity, -Infinity]
    for (const row of data.X) {
      for (const j of [0, 1]) {
        const v = row[Math.min(j, d - 1)]
        if (v < mins[j]) mins[j] = v
        if (v > maxs[j]) maxs[j] = v
      }
    }
    return { mins, maxs }
  }, [data])

  // 散点预览性能保护：超过 2000 个点时固定种子随机抽样 2000 个渲染（SVG 节点过多会卡）
  const SCATTER_CAP = 2000
  const scatterIdx = useMemo(() => {
    const n = data.X.length
    if (n <= SCATTER_CAP) return null // null 表示全量渲染
    const rng = mulberry32(2026)
    const idx = Array.from({ length: n }, (_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    return idx.slice(0, SCATTER_CAP).sort((a, b) => a - b)
  }, [data])

  const c0 = data.y.filter((v) => v === 0).length
  const c1 = data.y.length - c0
  const SW = 460
  const SH = 240

  return (
    <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
      <p className="text-sm text-stone-600">
        当前数据：<b className="text-stone-800">{data.sourceLabel}</b>，{data.y.length} 行 × {data.X[0]?.length ?? 0} 列特征
        {data.y.length > 0 && (
          <>
            ，类别分布：<span style={{ color: CLASS_COLORS[0] }}>{data.classNames[0]} {c0} 个</span>
            {' / '}
            <span style={{ color: CLASS_COLORS[1] }}>{data.classNames[1]} {c1} 个</span>
          </>
        )}
      </p>
      {scatter && data.X.length > 0 && (
        <>
          <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} className="max-w-full rounded-lg border border-stone-200 bg-white">
            {(scatterIdx ?? data.X.map((_, i) => i)).map((i) => {
              const row = data.X[i]
              const d = row.length
              const fx = row[0]
              const fy = row[Math.min(1, d - 1)]
              const nx = (fx - scatter.mins[0]) / (scatter.maxs[0] - scatter.mins[0] || 1)
              const ny = (fy - scatter.mins[1]) / (scatter.maxs[1] - scatter.mins[1] || 1)
              return (
                <circle
                  key={i}
                  cx={20 + nx * (SW - 40)}
                  cy={SH - 20 - ny * (SH - 40)}
                  r={3.5}
                  fill={CLASS_COLORS[data.y[i]]}
                  fillOpacity={0.8}
                />
              )
            })}
            <text x={SW / 2} y={SH - 4} textAnchor="middle" fontSize={11} fill="#a8a29e">
              {data.featureNames[0]}
            </text>
            <text x={10} y={SH / 2} fontSize={11} fill="#a8a29e" transform={`rotate(-90 10 ${SH / 2})`} textAnchor="middle">
              {data.featureNames[Math.min(1, (data.X[0]?.length ?? 1) - 1)]}
            </text>
          </svg>
          {(data.X[0]?.length ?? 0) > 2 && (
            <p className="text-xs text-stone-400">数据有 {data.X[0].length} 个特征，散点图仅展示前两列。</p>
          )}
          {scatterIdx && (
            <p className="text-xs text-stone-400">点较多，散点图仅展示固定种子随机抽样的 {SCATTER_CAP} / {data.X.length} 个点（可复现）。</p>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================
// 评估面板：指标 + 混淆矩阵 + ROC + 决策区域
// ============================================================
function EvalPanel({ result, methodName, data, testRatio }: { result: EvalResult; methodName: string; data: WorkData; testRatio: number }) {
  const { tp, fp, tn, fn } = result.counts
  const total = tp + fp + tn + fn
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  const [neg, pos] = data.classNames

  const metricRows = [
    {
      name: '准确率',
      value: result.testAcc,
      plain: '所有测试样本里猜对的比例',
      calc: `(猜对 ${tp + tn} = ${tn}+${tp}) ÷ 总数 ${total} = ${result.testAcc.toFixed(3)}`,
    },
    {
      name: '精确率',
      value: precision,
      plain: `预测为"${pos}"的样本里，真的是 ${pos} 的比例（不乱报警）`,
      calc: `真${pos} ${tp} ÷ 预测为${pos}共 ${tp + fp} (${tp}+${fp}) = ${precision.toFixed(3)}`,
    },
    {
      name: '召回率',
      value: recall,
      plain: `真实的"${pos}"里，被抓出来的比例（不漏网）`,
      calc: `真${pos} ${tp} ÷ 实际${pos}共 ${tp + fn} (${tp}+${fn}) = ${recall.toFixed(3)}`,
    },
    {
      name: 'F1',
      value: f1,
      plain: '精确率和召回率的调和平均，两头都要顾',
      calc: `2 × ${precision.toFixed(3)} × ${recall.toFixed(3)} ÷ (${precision.toFixed(3)} + ${recall.toFixed(3)}) = ${f1.toFixed(3)}`,
    },
    {
      name: 'AUC',
      value: result.auc,
      plain: 'ROC 曲线下面积；0.5 相当于瞎猜，越接近 1 越好',
      calc: `对 ${result.roc.length} 个 ROC 点用梯形法求面积 = ${result.auc.toFixed(3)}`,
    },
  ]

  return (
    <div className="space-y-5">
      {/* 顶部指标条 */}
      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <div className="rounded-lg bg-stone-50 py-2">
          <p className="text-xs text-stone-500">训练集准确率</p>
          <p className="font-mono text-lg font-bold text-stone-700">{(result.trainAcc * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-lg bg-indigo-50 py-2">
          <p className="text-xs text-indigo-600">测试集准确率</p>
          <p className="font-mono text-lg font-bold text-indigo-700">{(result.testAcc * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-lg bg-indigo-50 py-2">
          <p className="text-xs text-indigo-600">测试集宏 F1</p>
          <p className="font-mono text-lg font-bold text-indigo-700">{result.macroF1.toFixed(3)}</p>
        </div>
        <div className="rounded-lg bg-stone-50 py-2">
          <p className="text-xs text-stone-500">训练耗时（{methodName}）</p>
          <p className="font-mono text-lg font-bold text-stone-700">{result.timeMs.toFixed(0)} ms</p>
        </div>
      </div>
      {result.trainAcc - result.testAcc > 0.1 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          训练准确率比测试准确率高 {(result.trainAcc - result.testAcc).toFixed(2)}，模型可能"背答案"了（过拟合）。试试限制树的深度、增大 kNN 的 k 或减小 SVM 的 C。
        </p>
      )}
      {result.knnSampled && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
          ⚡ kNN 对大数据自动加速：训练集 {result.knnSampled.from} 个样本按固定种子抽取 {result.knnSampled.to} 个代表点参与近邻计算
          （kNN 预测要逐个比对训练点，数据一大会拖慢；散点、混淆矩阵与指标仍基于全量测试集，抽样可复现）。
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* 混淆矩阵 */}
        <div>
          <h3 className="mb-1 text-sm font-medium text-stone-700">混淆矩阵（测试集 {total} 个样本）</h3>
          <ConfusionMatrix m={result.confusion.m} classNames={data.classNames} />
          <p className="mt-1 text-xs leading-5 text-stone-500">
            主对角线（左上→右下）越深越好：这两格是"实际是 {neg} 也猜成 {neg}"和"实际是 {pos} 也猜成 {pos}"；
            副对角线是猜错的，越少越好。
          </p>
          <MajorityBaseline m={result.confusion.m} classNames={data.classNames} testAcc={result.testAcc} />
        </div>

        {/* ROC 曲线 */}
        <div>
          <h3 className="mb-1 text-sm font-medium text-stone-700">ROC 曲线 · AUC = {result.auc.toFixed(3)}</h3>
          <RocChart roc={result.roc} />
          <p className="mt-1 text-xs leading-5 text-stone-500">
            怎么读这条曲线：对角虚线 = 随机瞎猜（AUC = 0.5）；曲线越贴左上角越好；AUC 就是曲线下方的面积，&gt; 0.9 说明两类分得很开。
          </p>
        </div>
      </div>

      {/* 指标对照表 */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-stone-700">指标逐个拆开看（用当前混淆矩阵的数字代入）</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                <th className="px-3 py-2">指标</th>
                <th className="px-3 py-2">数值</th>
                <th className="px-3 py-2">通俗解释</th>
                <th className="px-3 py-2">代入演算</th>
              </tr>
            </thead>
            <tbody>
              {metricRows.map((r) => (
                <tr key={r.name} className="border-b border-stone-100">
                  <td className="px-3 py-2 font-medium text-stone-700">{r.name}</td>
                  <td className="px-3 py-2 font-mono font-bold text-indigo-700">{r.value.toFixed(3)}</td>
                  <td className="px-3 py-2 text-xs leading-5 text-stone-600">{r.plain}</td>
                  <td className="px-3 py-2 font-mono text-xs leading-5 text-stone-500">{r.calc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 决策区域（仅 2 特征） */}
      {data.X[0] && data.X[0].length === 2 && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-stone-700">决策区域（{methodName} · 测试集散点，红圈 = 猜错的）</h3>
          {result.knnSampled && (
            <p className="mb-1 text-xs text-sky-700">⚡ 大数据加速：背景色块由 {result.knnSampled.to} 个代表点渲染（散点仍为全量测试集）</p>
          )}
          <DecisionRegion clf={result.clf} data={data} result={result} />
        </div>
      )}
      <p className="text-xs text-stone-400">
        划分方式：分层抽样，训练 : 测试 = {100 - Math.round(testRatio * 100)}% : {Math.round(testRatio * 100)}%（固定随机种子 42，结果可复现）。
      </p>
    </div>
  )
}

// ============================================================
// 混淆矩阵热力图（SVG）
// ============================================================
function ConfusionMatrix({ m, classNames }: { m: number[][]; classNames: [string, string] }) {
  const CELL = 72
  const PAD = 88
  const n = m.length
  const max = Math.max(1, ...m.flat())
  return (
    <svg width={PAD + n * CELL + 8} height={PAD + n * CELL + 8} className="max-w-full">
      {/* 轴标题 */}
      <text x={PAD + (n * CELL) / 2} y={14} textAnchor="middle" fontSize={12} fill="#78716c">
        预测类别 →
      </text>
      <text x={14} y={PAD + (n * CELL) / 2} fontSize={12} fill="#78716c" transform={`rotate(-90 14 ${PAD + (n * CELL) / 2})`} textAnchor="middle">
        实际类别 →
      </text>
      {m.map((row, i) =>
        row.map((v, j) => {
          const intensity = v / max
          const diag = i === j
          return (
            <g key={`${i}-${j}`}>
              <rect
                x={PAD + j * CELL}
                y={PAD + i * CELL}
                width={CELL - 2}
                height={CELL - 2}
                rx={6}
                fill={diag ? `rgba(79,70,229,${0.12 + 0.75 * intensity})` : `rgba(249,115,22,${0.08 + 0.6 * intensity})`}
              />
              <text
                x={PAD + j * CELL + CELL / 2 - 1}
                y={PAD + i * CELL + CELL / 2 + 6}
                textAnchor="middle"
                fontSize={18}
                fontWeight={700}
                fill={intensity > 0.45 ? '#fff' : '#44403c'}
              >
                {v}
              </text>
            </g>
          )
        }),
      )}
      {/* 轴标签 */}
      {classNames.map((name, j) => (
        <text key={`c${j}`} x={PAD + j * CELL + CELL / 2} y={PAD - 10} textAnchor="middle" fontSize={12} fill="#57534e">
          {name}
        </text>
      ))}
      {classNames.map((name, i) => (
        <text key={`r${i}`} x={PAD - 10} y={PAD + i * CELL + CELL / 2 + 4} textAnchor="end" fontSize={12} fill="#57534e">
          {name}
        </text>
      ))}
    </svg>
  )
}

// ============================================================
// 「准确率会骗人」警示卡：全猜多数类的 baseline 准确率
// ============================================================
function MajorityBaseline({ m, classNames, testAcc }: { m: number[][]; classNames: [string, string]; testAcc: number }) {
  const rowSums = m.map((r) => r.reduce((a, b) => a + b, 0))
  const total = rowSums.reduce((a, b) => a + b, 0)
  if (total === 0) return null
  const majIdx = (rowSums[1] ?? 0) > rowSums[0] ? 1 : 0
  const majAcc = rowSums[majIdx] / total
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
      <b>⚠️ 准确率会骗人：</b>本测试集中「{classNames[majIdx]}」有 {rowSums[majIdx]} / {total} 个。
      如果模型偷懒<b>全猜「{classNames[majIdx]}」</b>，什么都不学，准确率也有 <b className="font-mono">{(majAcc * 100).toFixed(1)}%</b>
      {testAcc <= majAcc + 0.001
        ? '—— 你的模型没有比"全猜多数类"强多少，请重点看召回率和 F1！'
        : `—— 你的模型 ${(testAcc * 100).toFixed(1)}% 必须明显超过这条线才算真本事。类别越不均，越要看召回率和 F1。`}
    </div>
  )
}

// ============================================================
// ROC 曲线（SVG）
// ============================================================
function RocChart({ roc }: { roc: RocPoint[] }) {
  const W = 300
  const H = 240
  const PAD = 32
  const px = (fpr: number) => PAD + fpr * (W - PAD - 8)
  const py = (tpr: number) => H - PAD - tpr * (H - PAD - 8)
  const path = roc.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.fpr).toFixed(1)},${py(p.tpr).toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full rounded-lg border border-stone-200 bg-white">
      {/* 对角参考线 */}
      <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="#d6d3d1" strokeWidth={1.5} strokeDasharray="5 4" />
      {/* 坐标轴 */}
      <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(0)} stroke="#a8a29e" strokeWidth={1} />
      <line x1={px(0)} y1={py(0)} x2={px(0)} y2={py(1)} stroke="#a8a29e" strokeWidth={1} />
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <text x={px(t)} y={py(0) + 14} textAnchor="middle" fontSize={10} fill="#a8a29e">
            {t}
          </text>
          <text x={px(0) - 6} y={py(t) + 3} textAnchor="end" fontSize={10} fill="#a8a29e">
            {t}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#4f46e5" strokeWidth={2.2} />
      {roc.map((p, i) => (
        <circle key={i} cx={px(p.fpr)} cy={py(p.tpr)} r={2} fill="#4f46e5" />
      ))}
      <text x={(W + PAD) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#78716c">
        假阳性率 FPR（误伤好人的比例）
      </text>
      <text x={12} y={H / 2} fontSize={11} fill="#78716c" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
        真阳性率 TPR
      </text>
    </svg>
  )
}

// ============================================================
// 决策区域小图（仅 2 特征）：背景着色 + 测试集散点
// ============================================================
function DecisionRegion({ clf, data, result }: { clf: Classifier; data: WorkData; result: EvalResult }) {
  const W = 460
  const H = 300
  const GX = 56
  const GY = 36
  const { mins, maxs, cells, pts } = useMemo(() => {
    const mins = [Infinity, Infinity]
    const maxs = [-Infinity, -Infinity]
    for (const row of data.X) {
      for (const j of [0, 1]) {
        if (row[j] < mins[j]) mins[j] = row[j]
        if (row[j] > maxs[j]) maxs[j] = row[j]
      }
    }
    for (const j of [0, 1]) {
      const pad = (maxs[j] - mins[j]) * 0.05 || 1
      mins[j] -= pad
      maxs[j] += pad
    }
    const grid: number[][] = []
    for (let r = 0; r < GY; r++) {
      for (let c = 0; c < GX; c++) {
        grid.push([mins[0] + ((c + 0.5) / GX) * (maxs[0] - mins[0]), mins[1] + ((r + 0.5) / GY) * (maxs[1] - mins[1])])
      }
    }
    const cells = clf.predict(grid)
    const pts = result.Xte.map((row, i) => ({
      row,
      y: result.yte[i],
      pred: clf.predict([row])[0],
    }))
    return { mins, maxs, cells, pts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clf, data, result])

  const px = (v: number) => ((v - mins[0]) / (maxs[0] - mins[0] || 1)) * W
  const py = (v: number) => H - ((v - mins[1]) / (maxs[1] - mins[1] || 1)) * H

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full rounded-lg border border-stone-200 bg-white">
      {cells.map((cls, i) => {
        const c = i % GX
        const r = Math.floor(i / GX)
        return <rect key={i} x={(c / GX) * W} y={H - ((r + 1) / GY) * H} width={W / GX + 0.5} height={H / GY + 0.5} fill={CLASS_BG[cls]} />
      })}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={px(p.row[0])} cy={py(p.row[1])} r={4} fill={CLASS_COLORS[p.y]} stroke="#fff" strokeWidth={1} />
          {p.pred !== p.y && <circle cx={px(p.row[0])} cy={py(p.row[1])} r={7} fill="none" stroke="#dc2626" strokeWidth={1.6} />}
        </g>
      ))}
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#a8a29e">
        {data.featureNames[0]}
      </text>
      <text x={12} y={H / 2} fontSize={11} fill="#a8a29e" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
        {data.featureNames[1]}
      </text>
    </svg>
  )
}
