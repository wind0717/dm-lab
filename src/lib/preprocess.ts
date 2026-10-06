// ============================================================
// 数据预处理 —— 纯函数库
// 数据用"列式"结构存储（每列一个数组），单元格为 number | string | null
// null 表示缺失值；列分两种：numeric（数值）/ category（类别，如"地区"）
// 所有操作算子都是纯函数：输入 PrepData，返回新的 PrepData，不改原数据
// ============================================================

export type ColKind = 'numeric' | 'category'
export type Cell = number | string | null

export interface PrepData {
  headers: string[]
  kinds: ColKind[]
  /** 列式存储：cols[j][i] = 第 j 列第 i 行 */
  cols: Cell[][]
  /** 标签列下标（二分类用），没有则为 null */
  labelCol: number | null
}

export function rowCount(d: PrepData): number {
  return d.cols[0]?.length ?? 0
}

export function getRow(d: PrepData, i: number): Cell[] {
  return d.cols.map((c) => c[i])
}

/** 深拷贝一份 PrepData（算子内部用） */
function cloneData(d: PrepData): PrepData {
  return {
    headers: [...d.headers],
    kinds: [...d.kinds],
    cols: d.cols.map((c) => [...c]),
    labelCol: d.labelCol,
  }
}

/** 可复现随机数（mulberry32） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------
// 内置"脏数据"案例：乡村电商销售数据
// ------------------------------------------------------------
export interface DirtyOptions {
  n?: number // 样本数，默认 200
  missingRate?: number // 缺失率 0~0.4，默认 0.08
  outlierStrength?: number // 异常强度 0~1（决定极端值的数量与幅度），默认 0.5
  seed?: number
}

/**
 * 生成"乡村电商销售数据"：
 * 列 = 地区(类别) / 月销售额(万元) / 订单数 / 客单价(元) / 用户评分(1~5) / 是否坏账(标签, 少数类≈10%)
 * 故意埋入：缺失值、极端异常值（销售额 99999）、量纲悬殊（万元 vs 1-5 分）、类别列
 */
export function genDirtyDataset(opts: DirtyOptions = {}): PrepData {
  const { n = 200, missingRate = 0.08, outlierStrength = 0.5, seed = 42 } = opts
  const rand = mulberry32(seed)
  const gauss = (mean: number, sd: number) => {
    const u = Math.max(rand(), 1e-9)
    const v = Math.max(rand(), 1e-9)
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd
  }

  const regions = ['华东', '华北', '华中', '西南', '西北']
  const cRegion: Cell[] = []
  const cSales: Cell[] = []
  const cOrders: Cell[] = []
  const cPrice: Cell[] = []
  const cScore: Cell[] = []
  const cLabel: Cell[] = []

  for (let i = 0; i < n; i++) {
    const region = regions[Math.floor(rand() * regions.length)]
    // 销售额：右偏分布（大多数店铺小，少数大）
    const sales = Math.max(1, +(gauss(28, 14) + rand() * 8).toFixed(1))
    const orders = Math.max(3, Math.round(gauss(sales * 9, sales * 2.5)))
    const price = +((sales * 10000) / orders).toFixed(1)
    const score = +Math.min(5, Math.max(1, gauss(4.1, 0.6))).toFixed(1)
    // 坏账：评分低、销售额低的店铺更容易坏账，总体约 10%
    const badProb = score < 3.6 ? 0.35 : score < 4.0 ? 0.12 : 0.03
    const bad = rand() < badProb ? 1 : 0
    cRegion.push(region)
    cSales.push(sales)
    cOrders.push(orders)
    cPrice.push(price)
    cScore.push(score)
    cLabel.push(bad ? '坏账' : '正常')
  }

  // 注入极端异常值：销售额改成 99999 量级、订单数也放大
  const nOut = outlierStrength <= 0 ? 0 : Math.max(1, Math.round(n * 0.02 * outlierStrength * 2))
  for (let k = 0; k < nOut; k++) {
    const i = Math.floor(rand() * n)
    cSales[i] = +(5000 + rand() * 95000 * outlierStrength).toFixed(0) // 最大约 99999
    cOrders[i] = Math.round(3000 + rand() * 20000 * outlierStrength)
  }

  // 注入缺失值（只动特征列，标签列保持完整）
  const featureCols: Cell[][] = [cRegion, cSales, cOrders, cPrice, cScore]
  for (const col of featureCols) {
    for (let i = 0; i < n; i++) {
      if (rand() < missingRate) col[i] = null
    }
  }

  return {
    headers: ['地区', '月销售额(万元)', '订单数', '客单价(元)', '用户评分(1-5)', '是否坏账'],
    kinds: ['category', 'numeric', 'numeric', 'numeric', 'numeric', 'category'],
    cols: [cRegion, cSales, cOrders, cPrice, cScore, cLabel],
    labelCol: 5,
  }
}

// ------------------------------------------------------------
// CSV 宽松解析：允许无标签列、允许空单元格（→ null）、自动识别数值/类别列
// ------------------------------------------------------------
export const PREP_CSV_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 5000, maxCols: 20 }

export function parseCsvLoose(text: string): PrepData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) throw new Error('CSV 至少需要 1 行表头 + 1 行数据')
  if (lines.length - 1 > PREP_CSV_LIMITS.maxRows) {
    throw new Error(`行数超限：最多 ${PREP_CSV_LIMITS.maxRows} 行数据，当前 ${lines.length - 1} 行`)
  }
  const rows = lines.map((l) => l.split(',').map((c) => c.trim()))
  const headers = rows[0]
  const nCols = headers.length
  if (nCols < 1) throw new Error('至少需要 1 列数据')
  if (nCols > PREP_CSV_LIMITS.maxCols) {
    throw new Error(`列数超限：最多 ${PREP_CSV_LIMITS.maxCols} 列，当前 ${nCols} 列`)
  }
  const dataRows = rows.slice(1)
  for (const r of dataRows) {
    if (r.length !== nCols) throw new Error(`存在列数不一致的行（应为 ${nCols} 列），请检查是否有多余逗号`)
  }

  const kinds: ColKind[] = []
  const cols: Cell[][] = []
  for (let j = 0; j < nCols; j++) {
    const raw = dataRows.map((r) => (r[j] === '' ? null : r[j]))
    const numericOk = raw.every((v) => v === null || !Number.isNaN(Number(v)))
    if (numericOk) {
      kinds.push('numeric')
      cols.push(raw.map((v) => (v === null ? null : Number(v))))
    } else {
      kinds.push('category')
      const distinct = new Set(raw.filter((v) => v !== null))
      // 列上限放宽到 20 后，独热编码最坏展开 = 20 列 × 20 取值 = 400 列，
      // 与原来 12 × 30 = 360 的规模相当，故每列不同取值上限按比例调为 20
      if (distinct.size > 20) {
        throw new Error(`列「${headers[j]}」有 ${distinct.size} 种文字取值，过多（上限 20 种，独热编码会按取值拆列）`)
      }
      cols.push(raw)
    }
  }

  // 猜测标签列：最后一列恰好 2 种取值时给出建议（不强制）
  const last = cols[nCols - 1]
  const distinctLast = new Set(last.filter((v) => v !== null))
  const labelCol = distinctLast.size === 2 ? nCols - 1 : null

  return { headers, kinds, cols, labelCol }
}

// ------------------------------------------------------------
// 统计量
// ------------------------------------------------------------
export interface NumericStat {
  count: number // 非缺失个数
  missing: number
  mean: number | null
  std: number | null // 总体标准差（除以 n）
  min: number | null
  max: number | null
  median: number | null
  q1: number | null
  q3: number | null
  outliersIQR: number // IQR 法则（k=1.5）识别出的异常个数
}

function numericValues(values: Cell[]): number[] {
  return values.filter((v): v is number => typeof v === 'number')
}

/** 已排序数组的分位数（线性插值） */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function numericColStat(values: Cell[]): NumericStat {
  const nums = numericValues(values)
  const missing = values.length - nums.length
  if (nums.length === 0) {
    return { count: 0, missing, mean: null, std: null, min: null, max: null, median: null, q1: null, q3: null, outliersIQR: 0 }
  }
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const std = Math.sqrt(nums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / nums.length)
  const sorted = [...nums].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  const lo = q1 - 1.5 * iqr
  const hi = q3 + 1.5 * iqr
  return {
    count: nums.length,
    missing,
    mean,
    std,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: quantile(sorted, 0.5),
    q1,
    q3,
    outliersIQR: nums.filter((v) => v < lo || v > hi).length,
  }
}

/** 类别列取值计数（按计数降序） */
export function categoryCounts(values: Cell[]): Array<[string, number]> {
  const m = new Map<string, number>()
  let missing = 0
  for (const v of values) {
    if (v === null) missing++
    else m.set(String(v), (m.get(String(v)) ?? 0) + 1)
  }
  const arr = Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  if (missing > 0) arr.push(['（缺失）', missing])
  return arr
}

/** 直方图分箱：返回各箱计数与左边缘 */
export function histCounts(values: number[], bins: number, forcedMin?: number, forcedMax?: number) {
  if (values.length === 0) return { edges: [] as number[], counts: [] as number[] }
  const min = forcedMin ?? Math.min(...values)
  const max = forcedMax ?? Math.max(...values)
  const w = (max - min) / bins || 1
  const counts = new Array(bins).fill(0)
  for (const v of values) {
    let idx = Math.floor((v - min) / w)
    if (idx >= bins) idx = bins - 1
    if (idx < 0) idx = 0
    counts[idx]++
  }
  const edges = Array.from({ length: bins }, (_, i) => min + i * w)
  return { edges, counts }
}

// ------------------------------------------------------------
// 异常值识别
// ------------------------------------------------------------
/** IQR 法则：v < Q1 - k·IQR 或 v > Q3 + k·IQR 记为异常。返回与输入等长的布尔数组 */
export function iqrMask(values: Cell[], k = 1.5): boolean[] {
  const nums = numericValues(values)
  if (nums.length < 4) return values.map(() => false)
  const sorted = [...nums].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  const lo = q1 - k * iqr
  const hi = q3 + k * iqr
  return values.map((v) => typeof v === 'number' && (v < lo || v > hi))
}

/** Z-score 法则：|z| > thr 记为异常 */
export function zscoreMask(values: Cell[], thr = 3): boolean[] {
  const nums = numericValues(values)
  if (nums.length < 2) return values.map(() => false)
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const std = Math.sqrt(nums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / nums.length)
  if (std === 0) return values.map(() => false)
  return values.map((v) => typeof v === 'number' && Math.abs((v - mean) / std) > thr)
}

// ------------------------------------------------------------
// 操作算子（每个都返回新的 PrepData）
// ------------------------------------------------------------
export type MissingStrategy = 'drop' | 'mean' | 'median' | 'mode'

/** 缺失值处理：删除行 / 均值填充 / 中位数填充 / 众数填充（众数也适用于类别列） */
export function opMissing(data: PrepData, col: number, strategy: MissingStrategy): PrepData {
  const d = cloneData(data)
  const c = d.cols[col]
  if (strategy === 'drop') {
    const keep = c.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0)
    d.cols = d.cols.map((cc) => keep.map((i) => cc[i]))
    return d
  }
  const nums = numericValues(c)
  let fill: Cell = null
  if (strategy === 'mean') {
    if (nums.length === 0) return d
    fill = nums.reduce((a, b) => a + b, 0) / nums.length
  } else if (strategy === 'median') {
    if (nums.length === 0) return d
    fill = quantile([...nums].sort((a, b) => a - b), 0.5)
  } else {
    // mode：数值/类别通用
    const counts = new Map<Cell, number>()
    for (const v of c) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1)
    let best: Cell = null
    let bestN = -1
    for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n }
    fill = best
  }
  d.cols[col] = c.map((v) => (v === null ? fill : v))
  return d
}

export type OutlierMethod = 'iqr' | 'zscore'
export type OutlierAction = 'drop' | 'clip'

/** 异常值处理：IQR / Z-score 识别 + 删除行 / 截断（winsorize 缩到边界） */
export function opOutliers(data: PrepData, col: number, method: OutlierMethod, thr: number, action: OutlierAction): PrepData {
  const d = cloneData(data)
  const c = d.cols[col]
  const mask = method === 'iqr' ? iqrMask(c, thr) : zscoreMask(c, thr)
  if (action === 'drop') {
    const keep = mask.map((bad, i) => (bad ? -1 : i)).filter((i) => i >= 0)
    d.cols = d.cols.map((cc) => keep.map((i) => cc[i]))
    return d
  }
  // clip：截断到识别边界
  const nums = numericValues(c)
  if (nums.length < 4) return d
  let lo: number, hi: number
  if (method === 'iqr') {
    const sorted = [...nums].sort((a, b) => a - b)
    const q1 = quantile(sorted, 0.25)
    const q3 = quantile(sorted, 0.75)
    const iqr = q3 - q1
    lo = q1 - thr * iqr
    hi = q3 + thr * iqr
  } else {
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length
    const std = Math.sqrt(nums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / nums.length)
    lo = mean - thr * std
    hi = mean + thr * std
  }
  d.cols[col] = c.map((v) => (typeof v === 'number' ? Math.min(hi, Math.max(lo, v)) : v))
  return d
}

/** 标准化 Z-score：x' = (x − μ) / σ —— 均值变 0、标准差变 1 */
export function opZScore(data: PrepData, col: number): PrepData {
  const d = cloneData(data)
  const nums = numericValues(d.cols[col])
  if (nums.length === 0) return d
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const std = Math.sqrt(nums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / nums.length)
  if (std === 0) return d
  d.cols[col] = d.cols[col].map((v) => (typeof v === 'number' ? +((v - mean) / std).toFixed(4) : v))
  return d
}

/** 归一化 Min-Max：x' = (x − min) / (max − min) —— 范围压到 [0, 1] */
export function opMinMax(data: PrepData, col: number): PrepData {
  const d = cloneData(data)
  const nums = numericValues(d.cols[col])
  if (nums.length === 0) return d
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  if (max === min) return d
  d.cols[col] = d.cols[col].map((v) => (typeof v === 'number' ? +((v - min) / (max - min)).toFixed(4) : v))
  return d
}

export type DiscretizeStrategy = 'width' | 'freq'

/** 离散化：等宽 / 等频分箱，把数值列变成类别列（如"年龄 → 青年/中年/老年"） */
export function opDiscretize(data: PrepData, col: number, bins: number, strategy: DiscretizeStrategy): PrepData {
  const d = cloneData(data)
  const c = d.cols[col]
  const nums = numericValues(c)
  if (nums.length < bins) return d
  const sorted = [...nums].sort((a, b) => a - b)
  // 计算各箱边界
  const bounds: number[] = []
  if (strategy === 'width') {
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const w = (max - min) / bins || 1
    for (let i = 1; i < bins; i++) bounds.push(min + i * w)
  } else {
    for (let i = 1; i < bins; i++) bounds.push(quantile(sorted, i / bins))
  }
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1))
  const labelOf = (v: number) => {
    let idx = 0
    while (idx < bounds.length && v >= bounds[idx]) idx++
    const lo = idx === 0 ? sorted[0] : bounds[idx - 1]
    const hi = idx === bounds.length ? sorted[sorted.length - 1] : bounds[idx]
    return `${idx + 1}档·[${fmt(lo)}, ${fmt(hi)})`
  }
  d.cols[col] = c.map((v) => (typeof v === 'number' ? labelOf(v) : v))
  d.kinds[col] = 'category'
  return d
}

export type EncodeMethod = 'integer' | 'onehot'

/** 类别编码：整数编码（华东→0…）/ 独热编码（每个取值拆成一个 0/1 列） */
export function opEncode(data: PrepData, col: number, method: EncodeMethod): PrepData {
  const c = data.cols[col]
  const distinct = Array.from(new Set(c.filter((v) => v !== null).map(String))).sort()
  if (distinct.length === 0) return data
  if (method === 'integer') {
    const d = cloneData(data)
    const map = new Map(distinct.map((v, i) => [v, i]))
    d.cols[col] = c.map((v) => (v === null ? null : map.get(String(v))!))
    d.kinds[col] = 'numeric'
    d.headers[col] = `${data.headers[col]}(整数编码)`
    return d
  }
  // onehot：拆成 k 个新列，替换原列位置
  const newCols: Cell[][] = []
  const newHeaders: string[] = []
  const newKinds: ColKind[] = []
  let newLabelCol = data.labelCol
  for (let j = 0; j < data.cols.length; j++) {
    if (j !== col) {
      newCols.push([...data.cols[j]])
      newHeaders.push(data.headers[j])
      newKinds.push(data.kinds[j])
    } else {
      for (const val of distinct) {
        newCols.push(c.map((v) => (v === null ? null : v === val ? 1 : 0)))
        newHeaders.push(`${data.headers[col]}=${val}`)
        newKinds.push('numeric')
      }
      if (newLabelCol !== null) {
        newLabelCol = newLabelCol > col ? newLabelCol + distinct.length - 1 : newLabelCol
      }
    }
  }
  return { headers: newHeaders, kinds: newKinds, cols: newCols, labelCol: newLabelCol }
}

// ------------------------------------------------------------
// SMOTE 过采样（教学简化版）
// ------------------------------------------------------------
/**
 * SMOTE：对少数类样本两两插值合成新样本，直到少数类 ≈ 多数类 × targetRatio
 * 仅对数值列插值；类别列直接复制"父样本"的取值；缺失值先按列均值临时填补
 * @returns 新的 PrepData（样本数变多）；无法执行时返回原数据
 */
export function opSmote(data: PrepData, targetRatio = 1, k = 5, seed = 7): PrepData {
  if (data.labelCol === null) return data
  const yRaw = data.cols[data.labelCol]
  const distinct = Array.from(new Set(yRaw.filter((v) => v !== null).map(String))).sort()
  if (distinct.length !== 2) return data
  const numCols = data.kinds.map((kd, j) => (kd === 'numeric' ? j : -1)).filter((j) => j >= 0 && j !== data.labelCol)
  if (numCols.length === 0) return data

  // 数值矩阵（缺失先按列均值填补，仅用于距离计算与插值）
  const means = numCols.map((j) => {
    const nums = numericValues(data.cols[j])
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
  })
  const n = rowCount(data)
  const featOf = (i: number) => numCols.map((j, t) => (typeof data.cols[j][i] === 'number' ? (data.cols[j][i] as number) : means[t]))
  const yOf = (i: number) => String(yRaw[i])

  const count0 = yRaw.filter((v) => String(v) === distinct[0]).length
  const count1 = n - count0
  if (count0 === 0 || count1 === 0) return data
  const minorityVal = count0 <= count1 ? distinct[0] : distinct[1]
  const minorityIdx: number[] = []
  const majorityCount = Math.max(count0, count1)
  for (let i = 0; i < n; i++) if (yOf(i) === minorityVal) minorityIdx.push(i)
  const minorityCount = minorityIdx.length
  const target = Math.round(majorityCount * targetRatio)
  const need = target - minorityCount
  if (need <= 0) return data
  const kk = Math.min(k, minorityCount - 1)
  if (kk < 1) return data

  // 少数类特征矩阵 + kNN（欧氏距离，暴力即可，教学数据量小）
  const feats = minorityIdx.map(featOf)
  const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, t) => s + (v - b[t]) * (v - b[t]), 0))
  const neighbors = feats.map((f, i) =>
    feats
      .map((g, j) => ({ j, d: i === j ? Infinity : dist(f, g) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, kk)
      .map((o) => o.j),
  )

  const rand = mulberry32(seed)
  const d = cloneData(data)
  const colAppend: Cell[][] = d.cols.map(() => [])
  // 二值数值列（如独热编码产生的 0/1 列）插值会造出 0.37 这种非法值，按"复制父样本"处理
  const binaryLike = data.cols.map(
    (c, j) => data.kinds[j] === 'numeric' && new Set(c.filter((v) => v !== null)).size <= 2,
  )
  for (let s = 0; s < need; s++) {
    const aIdx = Math.floor(rand() * minorityCount)
    const bIdx = neighbors[aIdx][Math.floor(rand() * kk)]
    const gap = rand()
    const fa = feats[aIdx]
    const fb = feats[bIdx]
    for (let j = 0; j < d.cols.length; j++) {
      if (j === data.labelCol) {
        colAppend[j].push(minorityVal)
      } else {
        const t = numCols.indexOf(j)
        if (t >= 0 && !binaryLike[j]) {
          colAppend[j].push(+(fa[t] + gap * (fb[t] - fa[t])).toFixed(4))
        } else {
          // 类别列与二值列：复制父样本取值
          colAppend[j].push(data.cols[j][minorityIdx[aIdx]])
        }
      }
    }
  }
  for (let j = 0; j < d.cols.length; j++) d.cols[j] = d.cols[j].concat(colAppend[j])
  return d
}

// ------------------------------------------------------------
// 导出给分类实验：PrepData → {X, y, featureNames, classNames}
// ------------------------------------------------------------
export type ToClassificationResult =
  | { ok: true; X: number[][]; y: number[]; featureNames: string[]; classNames: [string, string] }
  | { ok: false; reason: string }

export function toClassification(data: PrepData): ToClassificationResult {
  if (data.labelCol === null) return { ok: false, reason: '没有标签列：需要一列恰好 2 种取值的标签（如"是否坏账"）' }
  const yRaw = data.cols[data.labelCol]
  const distinct = Array.from(new Set(yRaw.filter((v) => v !== null).map(String))).sort()
  if (distinct.length !== 2) return { ok: false, reason: '标签列必须恰好有 2 种取值' }
  if (yRaw.some((v) => v === null)) return { ok: false, reason: '标签列存在缺失值，请先处理' }
  const labelMap = new Map(distinct.map((v, i) => [v, i]))

  const featureCols: number[] = []
  for (let j = 0; j < data.cols.length; j++) {
    if (j === data.labelCol) continue
    if (data.kinds[j] !== 'numeric') return { ok: false, reason: `列「${data.headers[j]}」还是文字类别，请先做"类别编码"` }
    if (data.cols[j].some((v) => v === null)) return { ok: false, reason: `列「${data.headers[j]}」还有缺失值，请先做"缺失值处理"` }
    featureCols.push(j)
  }
  if (featureCols.length === 0) return { ok: false, reason: '没有可用的特征列' }
  if (featureCols.length > 12) return { ok: false, reason: '特征列超过 12 个，分类工作台放不下，请精简' }

  const n = rowCount(data)
  const X: number[][] = Array.from({ length: n }, (_, i) => featureCols.map((j) => data.cols[j][i] as number))
  const y = yRaw.map((v) => labelMap.get(String(v))!)
  return {
    ok: true,
    X,
    y,
    featureNames: featureCols.map((j) => data.headers[j]),
    classNames: [distinct[0], distinct[1]],
  }
}
