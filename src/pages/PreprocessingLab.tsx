// 模块：数据预处理实验 —— 垃圾进，垃圾出
// 左：原始数据表格 + 每列分布小图；中：流水线操作面板（可勾选、可排序）；右：处理后对比 + 送去分类
import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import CsvUpload from '@/components/CsvUpload'
import {
  genDirtyDataset,
  rowCount,
  getRow,
  numericColStat,
  categoryCounts,
  histCounts,
  opMissing,
  opOutliers,
  opZScore,
  opMinMax,
  opDiscretize,
  opEncode,
  opSmote,
  toClassification,
  type PrepData,
  type Cell,
  type MissingStrategy,
  type OutlierMethod,
  type OutlierAction,
  type DiscretizeStrategy,
  type EncodeMethod,
} from '@/lib/preprocess'
import { Database, UploadCloud, ArrowUp, ArrowDown, ArrowRight, RefreshCw, Eraser } from 'lucide-react'
import { usePersistedState } from '@/hooks/usePersistedState'

// ------------------------------------------------------------
// 操作算子定义
// ------------------------------------------------------------
type OpType = 'missing' | 'outlier' | 'scale' | 'discretize' | 'encode' | 'smote'

interface OpInstance {
  type: OpType
  enabled: boolean
  col: number // 原始数据列下标；-1 = 全部适用列
  params: Record<string, number | string>
}

const OP_META: Record<OpType, { name: string; principle: string; scenario: string }> = {
  missing: {
    name: '缺失值处理',
    principle: '删掉含缺失的行，或用均值 / 中位数 / 众数把空格子补上。',
    scenario: '使用场景：缺失少（<5%）删行最省事；缺失多或分布偏，用中位数填充更稳。',
  },
  outlier: {
    name: '异常值处理',
    principle: 'IQR 法则（超出 Q1−k·IQR ~ Q3+k·IQR 算异常）或 Z-score 法则识别离谱的值，再删除或截断（winsorize 缩到边界）。',
    scenario: '使用场景：财务数据、传感器数据常有意外的极端值（如销售额被录成 99999）。',
  },
  scale: {
    name: '标准化 / 归一化',
    principle: 'Z-score：x′ = (x−μ)/σ，拉到均值 0、标准差 1；Min-Max：x′ = (x−min)/(max−min)，压到 [0,1]。',
    scenario: '使用场景：用距离的算法（kNN、SVM、K-Means）通常要先做；决策树不需要。',
  },
  discretize: {
    name: '离散化（分箱）',
    principle: '把连续数值切成几档：等宽（区间一样宽）或等频（每档人数一样多），数值列变成类别列。',
    scenario: '使用场景：把年龄变成"青年/中年/老年"，某些模型更好解释。',
  },
  encode: {
    name: '类别编码',
    principle: '整数编码：华东→0、华北→1…；独热编码：每个取值单独开一个 0/1 列。',
    scenario: '使用场景："地区"这种文字列，模型读不懂，必须变成数字。',
  },
  smote: {
    name: 'SMOTE 过采样',
    principle: '在少数类样本和它的近邻之间插值，合成新样本，直到少数类 ≈ 多数类。',
    scenario: '使用场景：欺诈、违约样本永远是少数——直接训练，模型会干脆无视它们。',
  },
}

const DEFAULT_OPS: OpInstance[] = [
  { type: 'missing', enabled: false, col: -1, params: { strategy: 'median' } },
  { type: 'outlier', enabled: false, col: 1, params: { method: 'iqr', thr: 1.5, action: 'clip' } },
  { type: 'scale', enabled: false, col: -1, params: { method: 'zscore' } },
  { type: 'discretize', enabled: false, col: 4, params: { bins: 3, strategy: 'width' } },
  { type: 'encode', enabled: false, col: 0, params: { method: 'onehot' } },
  { type: 'smote', enabled: false, col: -1, params: { k: 5 } },
]

// ------------------------------------------------------------
// 流水线执行：按顺序应用启用的操作，维护 原列 → 现列 映射
// ------------------------------------------------------------
interface PipelineResult {
  data: PrepData
  colMap: number[] // 原列下标 → 现列下标（-1 表示不存在了）
  notes: string[]
  appliedSmote: boolean
}

function applyOps(src: PrepData, ops: OpInstance[]): PipelineResult {
  let d: PrepData = { ...src, cols: src.cols.map((c) => [...c]) }
  let colMap = src.headers.map((_, i) => i)
  const notes: string[] = []
  let appliedSmote = false

  for (const op of ops) {
    if (!op.enabled) continue
    const name = OP_META[op.type].name
    const ci = op.col === -1 ? -1 : colMap[op.col] ?? -1
    if (op.col !== -1 && ci < 0) {
      notes.push(`「${name}」找不到目标列，已跳过`)
      continue
    }
    switch (op.type) {
      case 'missing': {
        const strategy = op.params.strategy as MissingStrategy
        if (op.col === -1) {
          for (let j = 0; j < d.cols.length; j++) {
            if (j === d.labelCol) continue
            // 类别列没有均值/中位数，自动降级为众数填充
            const st = (strategy === 'mean' || strategy === 'median') && d.kinds[j] === 'category' ? 'mode' : strategy
            d = opMissing(d, j, st)
          }
        } else {
          d = opMissing(d, ci, strategy)
        }
        break
      }
      case 'outlier': {
        if (d.kinds[ci] !== 'numeric') {
          notes.push(`「${name}」目标列「${src.headers[op.col]}」当前不是数值列（可能被离散化过），已跳过`)
          continue
        }
        d = opOutliers(d, ci, op.params.method as OutlierMethod, Number(op.params.thr), op.params.action as OutlierAction)
        break
      }
      case 'scale': {
        const fn = op.params.method === 'zscore' ? opZScore : opMinMax
        if (op.col === -1) {
          for (let j = 0; j < d.cols.length; j++) if (d.kinds[j] === 'numeric' && j !== d.labelCol) d = fn(d, j)
        } else {
          if (d.kinds[ci] !== 'numeric') {
            notes.push(`「${name}」目标列「${src.headers[op.col]}」当前不是数值列，已跳过`)
            continue
          }
          d = fn(d, ci)
        }
        break
      }
      case 'discretize': {
        if (d.kinds[ci] !== 'numeric') {
          notes.push(`「${name}」目标列「${src.headers[op.col]}」当前不是数值列，已跳过`)
          continue
        }
        d = opDiscretize(d, ci, Number(op.params.bins), op.params.strategy as DiscretizeStrategy)
        break
      }
      case 'encode': {
        if (ci === d.labelCol) {
          notes.push(`「${name}」标签列不需要编码，已跳过`)
          continue
        }
        if (d.kinds[ci] !== 'category') {
          notes.push(`「${name}」目标列「${src.headers[op.col]}」当前不是类别列，已跳过`)
          continue
        }
        const beforeCols = d.headers.length
        d = opEncode(d, ci, op.params.method as EncodeMethod)
        const delta = d.headers.length - beforeCols // 独热会多出列
        if (delta > 0) colMap = colMap.map((m, oi) => (oi === op.col ? ci : m > ci ? m + delta : m))
        break
      }
      case 'smote': {
        if (d.labelCol === null) {
          notes.push('「SMOTE 过采样」需要二分类标签列，当前数据没有标签，已跳过')
          continue
        }
        const nBefore = rowCount(d)
        d = opSmote(d, 1, Number(op.params.k ?? 5))
        if (rowCount(d) === nBefore) notes.push('「SMOTE 过采样」未生效：少数类样本太少或已经平衡')
        else appliedSmote = true
        break
      }
    }
  }
  return { data: d, colMap, notes, appliedSmote }
}

// ------------------------------------------------------------
// 通用小组件
// ------------------------------------------------------------
/** 数据表预览（前 8 行），缺失值标黄 */
function DataTable({ data, rows = 8 }: { data: PrepData; rows?: number }) {
  const n = Math.min(rows, rowCount(data))
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            {data.headers.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-stone-500">
                {h}
                {i === data.labelCol && <span className="ml-1 text-indigo-500">(标签)</span>}
                {i !== data.labelCol && <span className="ml-1 text-stone-300">{data.kinds[i] === 'numeric' ? '数' : '类'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => (
            <tr key={i} className="border-b border-stone-100">
              {getRow(data, i).map((c, j) => (
                <td key={j} className={`whitespace-nowrap px-2 py-1 font-mono ${c === null ? 'bg-amber-50 font-bold text-amber-600' : 'text-stone-600'}`}>
                  {c === null ? '缺失' : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="bg-stone-50 px-2 py-1 text-xs text-stone-400">仅显示前 {n} 行 · 共 {rowCount(data)} 行</p>
    </div>
  )
}

/** 迷你直方图（数值列分布） */
function MiniHist({ values, color = '#4f46e5', bins = 12, height = 44 }: { values: number[]; color?: string; bins?: number; height?: number }) {
  if (values.length === 0) return <p className="text-xs text-stone-400">（全是缺失）</p>
  const { counts } = histCounts(values, bins)
  const max = Math.max(...counts, 1)
  const W = 150
  const bw = W / bins
  return (
    <svg width={W} height={height + 4} className="max-w-full">
      {counts.map((c, i) => (
        <rect key={i} x={i * bw + 0.5} y={height - (c / max) * height} width={bw - 1} height={(c / max) * height} fill={color} fillOpacity={0.75} rx={1} />
      ))}
    </svg>
  )
}

/** 类别列分布（Top 条形） */
function MiniCat({ values }: { values: Cell[] }) {
  const counts = categoryCounts(values).slice(0, 5)
  const max = Math.max(...counts.map(([, n]) => n), 1)
  return (
    <div className="space-y-0.5">
      {counts.map(([name, n]) => (
        <div key={name} className="flex items-center gap-1.5 text-xs">
          <span className={`w-10 truncate ${name === '（缺失）' ? 'text-amber-600' : 'text-stone-600'}`}>{name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
            <div className={`h-full rounded-full ${name === '（缺失）' ? 'bg-amber-400' : 'bg-indigo-400'}`} style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <span className="w-7 text-right font-mono text-stone-500">{n}</span>
        </div>
      ))}
    </div>
  )
}

/** 每列分布小图卡片 */
function ColumnDistGrid({ data, maxCols = 6 }: { data: PrepData; maxCols?: number }) {
  const cols = data.headers.map((_, j) => j).filter((j) => j !== data.labelCol).slice(0, maxCols)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cols.map((j) => (
        <div key={j} className="rounded-lg border border-stone-200 bg-white p-2">
          <p className="mb-1 truncate text-xs font-medium text-stone-600" title={data.headers[j]}>
            {data.headers[j]}
          </p>
          {data.kinds[j] === 'numeric' ? (
            <MiniHist values={data.cols[j].filter((v): v is number => typeof v === 'number')} />
          ) : (
            <MiniCat values={data.cols[j]} />
          )}
        </div>
      ))}
    </div>
  )
}

/** 前后叠加直方图（前灰后蓝；各自按自己的取值范围分箱，对比"形状"变化，图例注明各自范围） */
function OverlayHist({ before, after }: { before: number[]; after: number[] }) {
  if (before.length === 0 || after.length === 0) return null
  const bins = 16
  const bMin = Math.min(...before)
  const bMax = Math.max(...before)
  const aMin = Math.min(...after)
  const aMax = Math.max(...after)
  const cb = histCounts(before, bins).counts
  const ca = histCounts(after, bins).counts
  const peak = Math.max(...cb, ...ca, 1)
  const W = 340
  const H = 120
  const bw = W / bins
  return (
    <div>
      <svg width={W} height={H + 6} className="max-w-full">
        {cb.map((c, i) => (
          <rect key={`b${i}`} x={i * bw + 0.5} y={H - (c / peak) * H} width={bw - 1} height={(c / peak) * H} fill="#a8a29e" fillOpacity={0.65} rx={1} />
        ))}
        {ca.map((c, i) => (
          <rect key={`a${i}`} x={i * bw + 0.5} y={H - (c / peak) * H} width={bw - 1} height={(c / peak) * H} fill="#4f46e5" fillOpacity={0.5} rx={1} />
        ))}
      </svg>
      <p className="text-xs text-stone-500">
        <span className="mr-3">
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-stone-400" />
          处理前（范围 {bMin.toFixed(1)} ~ {bMax.toFixed(1)}）
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-indigo-500" />
          处理后（范围 {aMin.toFixed(2)} ~ {aMax.toFixed(2)}）
        </span>
      </p>
      <p className="mt-0.5 text-xs text-stone-400">各自按自己的坐标轴分箱，专心对比"形状"：标准化只改坐标轴，异常截断会砍掉长尾巴。</p>
    </div>
  )
}

/** SMOTE 前后散点（选"取值最丰富"的两个原始数值特征，按列名匹配处理后的列，跳过独热/二值列） */
function SmoteScatter({ before, after }: { before: PrepData; after: PrepData }) {
  if (before.labelCol === null || after.labelCol === null) return null
  const pick = before.kinds
    .map((k, j) => (k === 'numeric' ? j : -1))
    .filter((j) => j >= 0 && j !== before.labelCol)
    .map((j) => ({ j, distinct: new Set(before.cols[j].filter((v) => v !== null)).size }))
    .sort((a, b) => b.distinct - a.distinct)
    .slice(0, 2)
  if (pick.length < 2) return null
  // 处理后的同名列（独热编码可能插入新列，按下标对不上，必须按名字找）
  const cols = pick
    .map(({ j }) => {
      const name = before.headers[j]
      const ja = after.headers.findIndex((h, k) => h === name && after.kinds[k] === 'numeric')
      return ja >= 0 ? { jb: j, ja, name } : null
    })
    .filter((x): x is { jb: number; ja: number; name: string } => x !== null)
  if (cols.length < 2) return null
  const [{ jb: jb0, ja: ja0 }, { jb: jb1, ja: ja1 }] = cols
  const distinct = Array.from(new Set(after.cols[after.labelCol].filter((v) => v !== null).map(String))).sort()

  // 坐标轴用 1%~99% 分位数裁剪，避免极端值把点云挤成一团
  const clipRange = (vals: number[]): [number, number] => {
    const sorted = [...vals].sort((a, b) => a - b)
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))]
    return [q(0.01), q(0.99)]
  }
  const [xmin, xmax] = clipRange([
    ...before.cols[jb0].filter((v): v is number => typeof v === 'number'),
    ...after.cols[ja0].filter((v): v is number => typeof v === 'number'),
  ])
  const [ymin, ymax] = clipRange([
    ...before.cols[jb1].filter((v): v is number => typeof v === 'number'),
    ...after.cols[ja1].filter((v): v is number => typeof v === 'number'),
  ])

  const renderSvg = (d: PrepData, cx0: number, cx1: number, title: string) => {
    const W = 240
    const H = 170
    const n = rowCount(d)
    const counts = distinct.map((v) => d.cols[d.labelCol!].filter((c) => String(c) === v).length)
    return (
      <div className="flex-1">
        <p className="mb-1 text-xs font-medium text-stone-600">
          {title}：{n} 个样本（{distinct.map((v, i) => `${v} ${counts[i]}`).join(' / ')}）
        </p>
        <svg width={W} height={H} className="max-w-full rounded-lg border border-stone-200 bg-white">
          {Array.from({ length: n }, (_, i) => {
            const x = d.cols[cx0][i]
            const y = d.cols[cx1][i]
            const lb = d.cols[d.labelCol!][i]
            if (typeof x !== 'number' || typeof y !== 'number') return null
            const cx = Math.min(W - 6, Math.max(6, 12 + ((x - xmin) / (xmax - xmin || 1)) * (W - 24)))
            const cy = Math.min(H - 6, Math.max(6, H - 12 - ((y - ymin) / (ymax - ymin || 1)) * (H - 24)))
            const isMinor = String(lb) === distinct[counts[0] <= (counts[1] ?? 0) ? 0 : 1]
            return <circle key={i} cx={cx} cy={cy} r={2.4} fill={isMinor ? '#f97316' : '#4f46e5'} fillOpacity={0.6} />
          })}
        </svg>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-1.5 text-xs text-stone-500">
        SMOTE 前后对比（{before.headers[jb0]} × {before.headers[jb1]}，<span className="text-orange-600">橙=少数类</span>）：
      </p>
      <div className="flex flex-wrap gap-3">
        {renderSvg(before, jb0, jb1, '处理前')}
        {renderSvg(after, ja0, ja1, 'SMOTE 后')}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// 主页面
// ------------------------------------------------------------
interface Props {
  onSendToClassification?: (d: { X: number[][]; y: number[]; featureNames: string[]; classNames: [string, string] }) => void
}

export default function PreprocessingLab({ onSendToClassification }: Props) {
  // ---- 数据来源（参数与种子存档，刷新后不丢）----
  const [srcTab, setSrcTab] = usePersistedState<'builtin' | 'csv'>('prep:srcTab', 'builtin')
  const [nSamples, setNSamples] = usePersistedState('prep:nSamples', 200)
  const [missingRate, setMissingRate] = usePersistedState('prep:missingRate', 0.08)
  const [outlierStrength, setOutlierStrength] = usePersistedState('prep:outlierStrength', 0.5)
  const [seed, setSeed] = usePersistedState('prep:seed', 42)
  // 内置数据由参数派生（useMemo），不存档：刷新后自动重算出同一份「脏数据」
  const builtinData = useMemo(
    () => genDirtyDataset({ n: nSamples, missingRate, outlierStrength, seed }),
    [nSamples, missingRate, outlierStrength, seed],
  )
  // csvData 不存档：可能几 MB，存进 localStorage 会撑爆配额
  const [csvData, setCsvData] = useState<PrepData | null>(null)
  const [labelChoice, setLabelChoice] = usePersistedState<number | null>('prep:labelChoice', 5) // builtin 标签列 = 5
  // 流水线配置存档 —— 这是预处理模块最不能丢的东西（6 个算子的开关/列/参数）
  const [ops, setOps] = usePersistedState<OpInstance[]>('prep:ops', DEFAULT_OPS)
  const [histCol, setHistCol] = usePersistedState('prep:histCol', 1) // 叠加直方图选中的"原始列"

  const src: PrepData = useMemo(() => {
    const base = srcTab === 'csv' && csvData ? csvData : builtinData
    return { ...base, labelCol: labelChoice }
  }, [srcTab, csvData, builtinData, labelChoice])

  // ---- 流水线 ----
  const { data: result, colMap, notes, appliedSmote } = useMemo(() => applyOps(src, ops), [src, ops])

  // 可给 CSV 当标签的列（恰好 2 种取值）
  const labelCandidates = useMemo(
    () =>
      src.headers
        .map((_, j) => j)
        .filter((j) => new Set(src.cols[j].filter((v) => v !== null).map(String)).size === 2),
    [src],
  )

  const numericOrigCols = src.kinds.map((k, j) => (k === 'numeric' ? j : -1)).filter((j) => j >= 0 && j !== src.labelCol)
  const categoryOrigCols = src.kinds.map((k, j) => (k === 'category' ? j : -1)).filter((j) => j >= 0 && j !== src.labelCol)

  const updateOp = (idx: number, patch: Partial<OpInstance>) => setOps((os) => os.map((o, i) => (i === idx ? { ...o, ...patch } : o)))
  const setParam = (idx: number, key: string, v: number | string) =>
    setOps((os) => os.map((o, i) => (i === idx ? { ...o, params: { ...o.params, [key]: v } } : o)))
  const moveOp = (idx: number, dir: -1 | 1) =>
    setOps((os) => {
      const j = idx + dir
      if (j < 0 || j >= os.length) return os
      const next = [...os]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })

  // CSV 载入后：修正标签列与算子默认列
  const onCsv = (d: PrepData) => {
    setCsvData(d)
    setLabelChoice(d.labelCol)
    const nCols = d.headers.length
    const firstNum = d.kinds.findIndex((k, j) => k === 'numeric' && j !== d.labelCol)
    const firstCat = d.kinds.findIndex((k, j) => k === 'category' && j !== d.labelCol)
    setOps((os) =>
      os.map((o) => {
        if (o.col === -1) return o
        const needNum = o.type === 'outlier' || o.type === 'scale' || o.type === 'discretize'
        const fallback = needNum ? firstNum : o.type === 'encode' ? firstCat : o.col
        const col = o.col < nCols ? o.col : fallback
        return { ...o, col: col < 0 ? 0 : col }
      }),
    )
    setHistCol(firstNum >= 0 ? firstNum : 0)
  }

  const cls = useMemo(() => toClassification(result), [result])
  const fmt = (v: number | null, digits = 2) => (v === null ? '—' : Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(digits))

  // ---- 列选择器 ----
  const ColSelect = ({ op, idx, cols, allowAll }: { op: OpInstance; idx: number; cols: number[]; allowAll?: boolean }) => (
    <select
      value={op.col}
      onChange={(e) => updateOp(idx, { col: Number(e.target.value) })}
      className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700"
    >
      {allowAll && <option value={-1}>所有适用列</option>}
      {cols.map((j) => (
        <option key={j} value={j}>
          {src.headers[j]}
        </option>
      ))}
    </select>
  )

  const RadioRow = ({ options, value, onChange }: { options: Array<[string, string]>; value: string; onChange: (v: string) => void }) => (
    <div className="flex flex-wrap gap-1">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${value === id ? 'bg-indigo-600 font-medium text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">模块二 · 数据预处理：垃圾进，垃圾出</h1>
        <p className="mt-1 text-sm text-stone-500">
          真实数据总是脏的：有缺失、有异常、量纲悬殊、还混着文字。左边看原始数据，中间像搭流水线一样叠加处理操作，右边实时对比处理前后的变化。
        </p>
        <p className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 text-xs leading-5 text-stone-600">
          <b>预处理没有"标准流水线"：</b>先做哪个、后做哪个，结果可能不同——试试用面板里的 ↑↓ 按钮调换「异常值处理」和「标准化」的顺序，看右边统计量差多少。
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[330px_minmax(360px,1fr)_390px]">
        {/* ===== 左栏：原始数据 ===== */}
        <div className="space-y-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">① 原始数据（未处理）</CardTitle>
              <p className="text-xs text-stone-500">乡村电商销售数据：故意埋了缺失值、极端异常值、量纲悬殊和文字类别列。</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <DataTable data={src} />
              <div>
                <p className="mb-1.5 text-xs font-medium text-stone-600">每列分布：</p>
                <ColumnDistGrid data={src} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ===== 中栏：数据来源 + 操作流水线 ===== */}
        <div className="space-y-4">
          {/* 数据来源 */}
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">② 选择数据</CardTitle>
              <div className="flex gap-1 pt-1">
                {(
                  [
                    ['builtin', '内置脏数据', Database],
                    ['csv', '上传 CSV', UploadCloud],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => setSrcTab(id)}
                    className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${
                      srcTab === id ? 'bg-indigo-600 font-medium text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {srcTab === 'builtin' ? (
                <>
                  <SliderRow label="样本数" value={nSamples} min={80} max={400} step={20} onChange={setNSamples} />
                  <SliderRow label="缺失率" value={missingRate} min={0} max={0.3} step={0.02} onChange={setMissingRate} format={(v) => `${(v * 100).toFixed(0)}%`} />
                  <SliderRow label="异常强度" value={outlierStrength} min={0} max={1} step={0.1} onChange={setOutlierStrength} format={(v) => v.toFixed(1)} />
                  <Button variant="outline" size="sm" onClick={() => setSeed((s) => s + 1)}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    换一批数据
                  </Button>
                </>
              ) : (
                <CsvUpload loose onDataLoose={onCsv} />
              )}
              {/* 标签列选择 */}
              <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3 text-xs text-stone-600">
                <span>标签列（二分类，给 SMOTE / 分类实验用）：</span>
                <select
                  value={labelChoice === null ? -1 : labelChoice}
                  onChange={(e) => setLabelChoice(Number(e.target.value) === -1 ? null : Number(e.target.value))}
                  className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs"
                >
                  <option value={-1}>无标签</option>
                  {labelCandidates.map((j) => (
                    <option key={j} value={j}>
                      {src.headers[j]}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* 操作流水线 */}
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">③ 处理操作流水线</CardTitle>
              <p className="text-xs text-stone-500">勾选启用、用 ↑↓ 调整顺序，操作会从上往下依次执行。顺序不同，结果可能不同！</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {ops.map((op, idx) => {
                const meta = OP_META[op.type]
                return (
                  <div key={op.type} className={`rounded-lg border p-3 transition-colors ${op.enabled ? 'border-indigo-300 bg-indigo-50/40' : 'border-stone-200 bg-white'}`}>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={op.enabled} onCheckedChange={(c) => updateOp(idx, { enabled: c === true })} />
                      <span className={`text-sm font-medium ${op.enabled ? 'text-indigo-900' : 'text-stone-700'}`}>
                        {idx + 1}. {meta.name}
                      </span>
                      <span className="ml-auto flex gap-0.5">
                        <button onClick={() => moveOp(idx, -1)} disabled={idx === 0} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => moveOp(idx, 1)} disabled={idx === ops.length - 1} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-stone-500">{meta.principle}</p>
                    <p className="mt-0.5 text-xs leading-5 text-orange-700/90">{meta.scenario}</p>
                    {op.enabled && (
                      <div className="mt-2 space-y-2 border-t border-stone-200/70 pt-2">
                        {op.type === 'missing' && (
                          <>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              作用列：<ColSelect op={op} idx={idx} cols={src.headers.map((_, j) => j).filter((j) => j !== src.labelCol)} allowAll />
                            </div>
                            <RadioRow
                              options={[
                                ['drop', '删除含缺失的行'],
                                ['mean', '均值填充'],
                                ['median', '中位数填充'],
                                ['mode', '众数填充'],
                              ]}
                              value={String(op.params.strategy)}
                              onChange={(v) => setParam(idx, 'strategy', v)}
                            />
                          </>
                        )}
                        {op.type === 'outlier' && (
                          <>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                              作用列：<ColSelect op={op} idx={idx} cols={numericOrigCols} />
                              <RadioRow
                                options={[
                                  ['iqr', 'IQR 法则'],
                                  ['zscore', 'Z-score 法则'],
                                ]}
                                value={String(op.params.method)}
                                onChange={(v) => setParam(idx, 'method', v)}
                              />
                            </div>
                            <SliderRow
                              label={op.params.method === 'iqr' ? 'IQR 系数 k（默认 1.5）' : 'Z-score 阈值（默认 3）'}
                              value={Number(op.params.thr)}
                              min={op.params.method === 'iqr' ? 1 : 1.5}
                              max={op.params.method === 'iqr' ? 3 : 4}
                              step={0.1}
                              onChange={(v) => setParam(idx, 'thr', v)}
                              format={(v) => v.toFixed(1)}
                            />
                            <RadioRow
                              options={[
                                ['clip', '截断到边界（winsorize）'],
                                ['drop', '删除异常行'],
                              ]}
                              value={String(op.params.action)}
                              onChange={(v) => setParam(idx, 'action', v)}
                            />
                          </>
                        )}
                        {op.type === 'scale' && (
                          <>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              作用列：<ColSelect op={op} idx={idx} cols={numericOrigCols} allowAll />
                            </div>
                            <RadioRow
                              options={[
                                ['zscore', '标准化 Z-score'],
                                ['minmax', '归一化 Min-Max'],
                              ]}
                              value={String(op.params.method)}
                              onChange={(v) => setParam(idx, 'method', v)}
                            />
                          </>
                        )}
                        {op.type === 'discretize' && (
                          <>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              作用列：<ColSelect op={op} idx={idx} cols={numericOrigCols} />
                            </div>
                            <SliderRow label="分箱数" value={Number(op.params.bins)} min={2} max={8} step={1} onChange={(v) => setParam(idx, 'bins', v)} />
                            <RadioRow
                              options={[
                                ['width', '等宽分箱'],
                                ['freq', '等频分箱'],
                              ]}
                              value={String(op.params.strategy)}
                              onChange={(v) => setParam(idx, 'strategy', v)}
                            />
                          </>
                        )}
                        {op.type === 'encode' && (
                          <>
                            <div className="flex items-center gap-2 text-xs text-stone-600">
                              作用列：
                              {categoryOrigCols.length > 0 ? (
                                <ColSelect op={op} idx={idx} cols={categoryOrigCols} />
                              ) : (
                                <span className="text-amber-600">（当前没有类别列）</span>
                              )}
                            </div>
                            <RadioRow
                              options={[
                                ['integer', '整数编码'],
                                ['onehot', '独热编码'],
                              ]}
                              value={String(op.params.method)}
                              onChange={(v) => setParam(idx, 'method', v)}
                            />
                          </>
                        )}
                        {op.type === 'smote' && (
                          <SliderRow label="近邻数 k" value={Number(op.params.k)} min={1} max={10} step={1} onChange={(v) => setParam(idx, 'k', v)} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <Button variant="outline" size="sm" onClick={() => setOps(DEFAULT_OPS.map((o) => ({ ...o, params: { ...o.params } })))}>
                <Eraser className="mr-1 h-3.5 w-3.5" />
                清空流水线
              </Button>
              {notes.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {notes.map((nt, i) => (
                    <p key={i}>⚠ {nt}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== 右栏：处理后对比 ===== */}
        <div className="space-y-4">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-stone-800">④ 处理后：{rowCount(result)} 行 × {result.headers.length} 列</CardTitle>
              <p className="text-xs text-stone-500">
                启用了 {ops.filter((o) => o.enabled).length} 个操作。行数 {rowCount(src)} → {rowCount(result)}，列数 {src.headers.length} → {result.headers.length}。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <DataTable data={result} />

              {/* 前后叠加直方图 */}
              {(() => {
                const mapped = colMap[histCol]
                const afterNumeric = mapped >= 0 && result.kinds[mapped] === 'numeric'
                const beforeVals = src.cols[histCol]?.filter((v): v is number => typeof v === 'number') ?? []
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-stone-600">
                      <span className="font-medium">分布对比：</span>
                      <select value={histCol} onChange={(e) => setHistCol(Number(e.target.value))} className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs">
                        {numericOrigCols.map((j) => (
                          <option key={j} value={j}>
                            {src.headers[j]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {afterNumeric && beforeVals.length > 0 ? (
                      <OverlayHist before={beforeVals} after={result.cols[mapped].filter((v): v is number => typeof v === 'number')} />
                    ) : (
                      <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">这一列已变成类别列（被离散化/整数编码），没有数值直方图了。</p>
                    )}
                  </div>
                )
              })()}

              {/* 统计量对比表 */}
              <div className="overflow-x-auto rounded-lg border border-stone-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                      <th className="px-2 py-1.5 text-left font-medium">数值列</th>
                      <th className="px-2 py-1.5 text-right font-medium">均值</th>
                      <th className="px-2 py-1.5 text-right font-medium">标准差</th>
                      <th className="px-2 py-1.5 text-right font-medium">缺失</th>
                      <th className="px-2 py-1.5 text-right font-medium">异常(IQR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {numericOrigCols.map((j) => {
                      const mapped = colMap[j]
                      const sb = numericColStat(src.cols[j])
                      const stillNumeric = mapped >= 0 && result.kinds[mapped] === 'numeric'
                      const sa = stillNumeric ? numericColStat(result.cols[mapped]) : null
                      return (
                        <tr key={j} className="border-b border-stone-100">
                          <td className="max-w-[110px] truncate px-2 py-1.5 text-stone-700" title={src.headers[j]}>
                            {src.headers[j]}
                          </td>
                          {sa ? (
                            <>
                              <td className="px-2 py-1.5 text-right font-mono text-stone-600">
                                {fmt(sb.mean)} <span className="text-stone-400">→</span> <span className="text-indigo-700">{fmt(sa.mean)}</span>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-stone-600">
                                {fmt(sb.std)} <span className="text-stone-400">→</span> <span className="text-indigo-700">{fmt(sa.std)}</span>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-stone-600">
                                {sb.missing} <span className="text-stone-400">→</span> <span className={sa.missing > 0 ? 'text-amber-600' : 'text-indigo-700'}>{sa.missing}</span>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-stone-600">
                                {sb.outliersIQR} <span className="text-stone-400">→</span> <span className={sa.outliersIQR > 0 ? 'text-amber-600' : 'text-indigo-700'}>{sa.outliersIQR}</span>
                              </td>
                            </>
                          ) : (
                            <td colSpan={4} className="px-2 py-1.5 text-center text-stone-400">
                              已变成类别列
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* SMOTE 散点对比 */}
              {appliedSmote && <SmoteScatter before={src} after={result} />}

              {/* 送去分类 */}
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
                {cls.ok ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="min-w-0 flex-1 text-xs leading-5 text-indigo-900">
                      数据已就绪：{cls.X.length} 个样本 × {cls.featureNames.length} 个特征，标签「{cls.classNames.join(' / ')}」。可以直接送去七种分类方法同场竞技。
                    </p>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => onSendToClassification?.({ X: cls.X, y: cls.y, featureNames: cls.featureNames, classNames: cls.classNames })}>
                      处理完，送去分类实验
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-indigo-900/80">
                    <b>还不能送去分类：</b>
                    {cls.reason}。补齐后这里会出现「送去分类实验」按钮。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ThinkBox
        questions={[
          '不标准化直接跑 kNN：销售额（几万元）和评分（1~5 分）放在一起算距离，哪个特征会"霸凌"距离公式？观察标准化前后直方图形状的差别。',
          '先"均值填充"再"异常截断"，和先"异常截断"再"中位数填充"，结果一样吗？调换顺序试试——为什么异常值要先处理？',
          '把「用户评分」等宽分成 3 箱，再切成等频 3 箱：两种分法的边界有什么差别？哪种更适合右偏分布（比如销售额）？',
          'SMOTE 合成的新样本是"真数据"吗？如果少数类里混着标错的样本，SMOTE 会放大什么？',
        ]}
      />
    </div>
  )
}
