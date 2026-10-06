// ============================================================
// 逐步推演算法库 —— 逻辑回归 / kNN / 朴素贝叶斯
// 纯函数，供页面组件与自测脚本共用（公式与 classifiers.ts 保持一致）
// ============================================================
import { mulberry32 } from '@/lib/classifiers'

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z))
  const e = Math.exp(z)
  return e / (1 + e)
}

// ============================================================
// 1. 逻辑回归逐步梯度下降
//    模型 p = σ(w·z + b)，z 为标准化特征；损失 = 交叉熵
//    steps[0] = 随机初始化状态，之后每一步 = 一次全批量梯度下降迭代
// ============================================================
export interface LogRegStep {
  w: number[] // 当前权重（标准化空间）
  b: number // 当前偏置（标准化空间）
  loss: number // 交叉熵损失
  acc: number // 训练准确率
}

export interface LogRegWalk {
  mean: number[]
  std: number[]
  steps: LogRegStep[]
  converged: boolean // 是否因损失不再明显下降而提前停止
}

export function crossEntropy(Z: number[][], y: number[], w: number[], b: number): number {
  const n = Z.length
  let s = 0
  for (let i = 0; i < n; i++) {
    let z = b
    for (let j = 0; j < w.length; j++) z += w[j] * Z[i][j]
    const p = Math.min(Math.max(sigmoid(z), 1e-12), 1 - 1e-12)
    s += -(y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p))
  }
  return s / n
}

function trainAcc(Z: number[][], y: number[], w: number[], b: number): number {
  let ok = 0
  for (let i = 0; i < Z.length; i++) {
    let z = b
    for (let j = 0; j < w.length; j++) z += w[j] * Z[i][j]
    if ((sigmoid(z) >= 0.5 ? 1 : 0) === y[i]) ok++
  }
  return ok / Z.length
}

export function logisticWalkthrough(
  X: number[][],
  y: number[],
  lr = 0.5,
  maxIters = 200,
  tol = 1e-6,
  seed = 7,
): LogRegWalk {
  const n = X.length
  const d = X[0].length
  // 标准化（与 classifiers.ts 的 colStats/applyStd 一致）
  const mean = new Array(d).fill(0)
  const std = new Array(d).fill(0)
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j] / n
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2 / n
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1
  const Z = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]))

  // 第 0 步：随机初始化（小随机数，让边界"乱指"）
  const rng = mulberry32(seed)
  const w = Array.from({ length: d }, () => (rng() - 0.5) * 1.2)
  let b = (rng() - 0.5) * 1.2

  const steps: LogRegStep[] = [{ w: [...w], b, loss: crossEntropy(Z, y, w, b), acc: trainAcc(Z, y, w, b) }]
  let converged = false

  for (let t = 0; t < maxIters; t++) {
    const gw = new Array(d).fill(0)
    let gb = 0
    for (let i = 0; i < n; i++) {
      let z = b
      for (let j = 0; j < d; j++) z += w[j] * Z[i][j]
      const err = sigmoid(z) - y[i]
      for (let j = 0; j < d; j++) gw[j] += err * Z[i][j]
      gb += err
    }
    for (let j = 0; j < d; j++) w[j] -= (lr * gw[j]) / n
    b -= (lr * gb) / n
    const loss = crossEntropy(Z, y, w, b)
    steps.push({ w: [...w], b, loss, acc: trainAcc(Z, y, w, b) })
    // 收敛判停：损失不再明显下降
    if (Math.abs(steps[steps.length - 2].loss - loss) < tol) {
      converged = true
      break
    }
  }
  return { mean, std, steps, converged }
}

// ============================================================
// 2. kNN 邻居与投票
//    欧氏距离 d = √(Σⱼ (xⱼ − x'ⱼ)²)，取最近 k 个少数服从多数
// ============================================================
export interface KnnNeighbor {
  idx: number // 在原始数据中的下标
  dist: number // 欧氏距离
  label: number // 0 / 1
}

export function knnNeighbors(X: number[][], y: number[], pt: number[], k: number): KnnNeighbor[] {
  const all = X.map((xi, i) => {
    let s = 0
    for (let j = 0; j < pt.length; j++) s += (xi[j] - pt[j]) ** 2
    return { idx: i, dist: Math.sqrt(s), label: y[i] }
  })
  all.sort((a, b) => a.dist - b.dist)
  return all.slice(0, Math.min(Math.max(1, Math.round(k)), all.length))
}

/** 投票统计：返回 [A 类票数, B 类票数]，平票时归 B（与 knnPredict 的 p>=0.5 判定一致） */
export function knnVotes(neighbors: KnnNeighbor[]): [number, number] {
  let ones = 0
  for (const nb of neighbors) ones += nb.label
  return [neighbors.length - ones, ones]
}

export function knnPredict(neighbors: KnnNeighbor[]): number {
  const [a, bVotes] = knnVotes(neighbors)
  return bVotes >= a ? 1 : 0
}

// ============================================================
// 3. 高斯朴素贝叶斯
//    P(c|x) ∝ P(c) · Πⱼ N(xⱼ | μ_{c,j}, σ²_{c,j})
// ============================================================
export interface NbFit {
  prior: [number, number]
  mean: [number[], number[]]
  varr: [number[], number[]]
  counts: [number, number]
}

export function nbFit(X: number[][], y: number[]): NbFit {
  const d = X[0].length
  const prior: [number, number] = [0.5, 0.5]
  const mean: [number[], number[]] = [[], []]
  const varr: [number[], number[]] = [[], []]
  const counts: [number, number] = [0, 0]
  for (const c of [0, 1] as const) {
    const rows = X.filter((_, i) => y[i] === c)
    counts[c] = rows.length
    prior[c] = Math.max(rows.length, 1) / X.length
    const m = new Array(d).fill(0)
    const v = new Array(d).fill(0)
    for (const row of rows) for (let j = 0; j < d; j++) m[j] += row[j] / rows.length
    for (const row of rows) for (let j = 0; j < d; j++) v[j] += (row[j] - m[j]) ** 2 / rows.length
    mean[c] = m
    varr[c] = v.map((x) => x + 1e-9)
  }
  return { prior, mean, varr, counts }
}

/** 一维高斯概率密度：N(x|μ,σ²) = 1/√(2πσ²) · e^(−(x−μ)²/(2σ²)) */
export function gaussPdf(x: number, mean: number, varr: number): number {
  return Math.exp(-((x - mean) ** 2) / (2 * varr)) / Math.sqrt(2 * Math.PI * varr)
}

export interface NbPosterior {
  pdfA: number[] // P(xⱼ|A) 每个特征的密度
  pdfB: number[]
  numA: number // 未归一化分子 P(A)·Π P(xⱼ|A)
  numB: number
  pA: number // 后验 P(A|x)
  pB: number
}

export function nbPosterior(fit: NbFit, x: number[]): NbPosterior {
  const d = x.length
  const pdfA: number[] = []
  const pdfB: number[] = []
  let numA = fit.prior[0]
  let numB = fit.prior[1]
  for (let j = 0; j < d; j++) {
    const fa = gaussPdf(x[j], fit.mean[0][j], fit.varr[0][j])
    const fb = gaussPdf(x[j], fit.mean[1][j], fit.varr[1][j])
    pdfA.push(fa)
    pdfB.push(fb)
    numA *= fa
    numB *= fb
  }
  // 数值下溢保护：原始乘积太小时退化为对数路径
  if (numA + numB < 1e-300) {
    const logScore = (c: 0 | 1) => {
      let s = Math.log(fit.prior[c])
      for (let j = 0; j < d; j++) {
        const varj = fit.varr[c][j]
        s += -0.5 * Math.log(2 * Math.PI * varj) - (x[j] - fit.mean[c][j]) ** 2 / (2 * varj)
      }
      return s
    }
    const l0 = logScore(0)
    const l1 = logScore(1)
    const mx = Math.max(l0, l1)
    const e0 = Math.exp(l0 - mx)
    const e1 = Math.exp(l1 - mx)
    const pA = e0 / (e0 + e1)
    return { pdfA, pdfB, numA: 0, numB: 0, pA, pB: 1 - pA }
  }
  const pA = numA / (numA + numB)
  return { pdfA, pdfB, numA, numB, pA, pB: 1 - pA }
}
