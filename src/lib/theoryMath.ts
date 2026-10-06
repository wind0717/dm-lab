// ============================================================
// 理论基础页新增小节的纯计算函数（与 UI 解耦，便于自测）
// 覆盖：贝叶斯定理 / 协方差与皮尔逊相关 / 梯度下降 / K 折交叉验证 / PCA(2D)
// ============================================================

/** 可复现的伪随机数（与 classifiers.ts 同款 mulberry32） */
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

/** Box-Muller 标准正态 */
function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-12)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ------------------------------------------------------------
// ① 贝叶斯定理（医学检测）
// ------------------------------------------------------------
export interface BayesResult {
  /** P(真患病 | 检测阳性) */
  posterior: number
  /** 分子 = 患病率 × 灵敏度 */
  numerator: number
  /** 分母中"健康人误报"部分 = (1−患病率) × (1−特异度) */
  falseAlarmTerm: number
}

export function bayesPosterior(prevalence: number, sensitivity: number, specificity: number): BayesResult {
  const numerator = prevalence * sensitivity
  const falseAlarmTerm = (1 - prevalence) * (1 - specificity)
  return { posterior: numerator / (numerator + falseAlarmTerm || 1), numerator, falseAlarmTerm }
}

/** 1000 人方阵的确定性计数（用于点阵着色） */
export interface BayesGrid {
  total: number
  sick: number // 真实患者
  detected: number // 患者中检出（红点）
  missed: number // 患者中漏检（红圈）
  falseAlarm: number // 健康人被误报（黄点）
}

export function bayesGrid(prevalence: number, sensitivity: number, specificity: number, total = 1000): BayesGrid {
  const sick = prevalence > 0 ? Math.max(1, Math.round(total * prevalence)) : 0
  const detected = Math.round(sick * sensitivity)
  const falseAlarm = Math.round((total - sick) * (1 - specificity))
  return { total, sick, detected, missed: sick - detected, falseAlarm }
}

// ------------------------------------------------------------
// ② 协方差与皮尔逊相关系数
// ------------------------------------------------------------
export function covariance(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let s = 0
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my)
  return s / n
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  const denom = Math.sqrt(sxx * syy)
  return denom > 0 ? sxy / denom : 0
}

/** 最小二乘回归线 y = slope·x + intercept */
export function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const cov = covariance(xs, ys)
  let sxx = 0
  for (let i = 0; i < n; i++) sxx += (xs[i] - mx) * (xs[i] - mx)
  const slope = sxx > 0 ? cov / (sxx / n) : 0
  return { slope, intercept: my - slope * mx }
}

export type CovPreset = 'positive' | 'negative' | 'none' | 'nonlinear'
export interface Pt {
  x: number
  y: number
}

/** 生成相关系数演示点云（0~100 坐标，可复现） */
export function genCovPreset(kind: CovPreset, n = 40, seed = 42): Pt[] {
  const rng = mulberry32(seed)
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const x = 5 + (90 * i) / (n - 1) + gauss(rng) * 2
    let y: number
    switch (kind) {
      case 'positive':
        y = 0.72 * x + 14 + gauss(rng) * 8
        break
      case 'negative':
        y = 86 - 0.72 * x + gauss(rng) * 8
        break
      case 'none':
        y = 50 + gauss(rng) * 18
        break
      case 'nonlinear': {
        // 对称抛物线：皮尔逊 r ≈ 0 但关系很强
        const t = (x - 50) / 50
        y = 12 + 68 * t * t + gauss(rng) * 3
        break
      }
    }
    pts.push({ x: Math.min(98, Math.max(2, x)), y: Math.min(98, Math.max(2, y)) })
  }
  return pts
}

// ------------------------------------------------------------
// ③ 一维梯度下降：J(w) = (w − wmin)² + c
// ------------------------------------------------------------
export const GD_WMIN = 2
export const GD_C = 1

export function gdLoss(w: number): number {
  return (w - GD_WMIN) * (w - GD_WMIN) + GD_C
}

export function gdGrad(w: number): number {
  return 2 * (w - GD_WMIN)
}

/** w ← w − η·dJ/dw */
export function gdStep(w: number, eta: number): number {
  return w - eta * gdGrad(w)
}

export type GdStatus = 'converged' | 'diverged' | 'maxsteps'

export interface GdRun {
  /** 每一步的 w（含初始位置） */
  ws: number[]
  status: GdStatus
}

export function gdRun(w0: number, eta: number, maxSteps = 200): GdRun {
  const ws = [w0]
  let w = w0
  for (let i = 0; i < maxSteps; i++) {
    w = gdStep(w, eta)
    ws.push(w)
    if (!Number.isFinite(w) || Math.abs(w) > 1e6) return { ws, status: 'diverged' }
    if (Math.abs(w - GD_WMIN) < 1e-4) return { ws, status: 'converged' }
  }
  return { ws, status: 'maxsteps' }
}

// ------------------------------------------------------------
// ④ K 折交叉验证
// ------------------------------------------------------------
/** 连续切分：返回 k 个折的测试下标（与 UI 数据条分段一致） */
export function kfoldSplit(n: number, k: number): number[][] {
  const folds: number[][] = []
  const base = Math.floor(n / k)
  const rem = n % k
  let start = 0
  for (let f = 0; f < k; f++) {
    const size = base + (f < rem ? 1 : 0)
    folds.push(Array.from({ length: size }, (_, i) => start + i))
    start += size
  }
  return folds
}

export interface KfoldDemo {
  folds: number[][]
  scores: number[]
  mean: number
  std: number
}

/**
 * 教学演示用 K 折：合成一组确定性标签，每折用"训练折多数类"做预测算准确率，
 * 让 5 个得分有真实差异而不是随手写的数字。
 */
export function kfoldDemo(n = 100, k = 5, seed = 7): KfoldDemo {
  const rng = mulberry32(seed)
  // 标签：一个略带噪声的确定性模式（约 6:4 两类）
  const y: number[] = []
  for (let i = 0; i < n; i++) {
    const base = (i * 37 + 11) % 10 < 6 ? 1 : 0
    y.push(rng() < 0.12 ? 1 - base : base) // 12% 标签噪声
  }
  const folds = kfoldSplit(n, k)
  const all = folds.flat()
  const scores = folds.map((testIdx) => {
    const testSet = new Set(testIdx)
    const train = all.filter((i) => !testSet.has(i))
    const ones = train.reduce((s, i) => s + y[i], 0)
    const majority = ones * 2 >= train.length ? 1 : 0
    const correct = testIdx.reduce((s, i) => s + (y[i] === majority ? 1 : 0), 0)
    return correct / testIdx.length
  })
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) * (b - mean), 0) / scores.length)
  return { folds, scores, mean, std }
}

// ------------------------------------------------------------
// ⑤ PCA（二维闭式解）
// ------------------------------------------------------------
export interface Pca2d {
  mean: [number, number]
  /** 第一主成分方向角（度，−90~90） */
  angleDeg: number
  /** 第一主成分单位方向向量 */
  dir: [number, number]
  lambda1: number
  lambda2: number
  /** 第一主成分保留的方差比例 λ1/(λ1+λ2) */
  varRatio: number
}

export function pca2d(points: Pt[]): Pca2d {
  const n = points.length
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of points) {
    const dx = p.x - mx
    const dy = p.y - my
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  sxx /= n
  sxy /= n
  syy /= n
  // 2×2 对称矩阵闭式特征分解：最大特征值对应方向
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const dir: [number, number] = [Math.cos(theta), Math.sin(theta)]
  const mid = (sxx + syy) / 2
  const r = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy)
  const lambda1 = mid + r
  const lambda2 = Math.max(0, mid - r)
  return {
    mean: [mx, my],
    angleDeg: (theta * 180) / Math.PI,
    dir,
    lambda1,
    lambda2,
    varRatio: lambda1 + lambda2 > 0 ? lambda1 / (lambda1 + lambda2) : 0,
  }
}

/** 生成旋转椭圆点云（长轴方向角 angleDeg，中心 cx,cy），用于 PCA 演示 */
export function genEllipse(n = 120, angleDeg = 25, seed = 7, major = 30, minor = 5, cx = 50, cy = 50): Pt[] {
  const rng = mulberry32(seed)
  const a = (angleDeg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const u = gauss(rng) * major * 0.42
    const v = gauss(rng) * minor * 0.42
    pts.push({ x: cx + u * ca - v * sa, y: cy + u * sa + v * ca })
  }
  return pts
}

/** 把点投影到方向 dir 上，返回标量坐标（相对 mean） */
export function projectOnto(p: Pt, mean: [number, number], dir: [number, number]): number {
  return (p.x - mean[0]) * dir[0] + (p.y - mean[1]) * dir[1]
}
