// ============================================================
// 逐步推演算法库（第二批）—— SVM / 随机森林 / XGBoost
// 纯函数，供页面组件与自测脚本共用（公式与 classifiers.ts 保持一致）
// ============================================================
import { mulberry32, buildTreeG, treePredictG, type TreeNodeG, type TreeCfg } from '@/lib/classifiers'
import { trainTestSplit } from '@/lib/metrics'

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z))
  const e = Math.exp(z)
  return e / (1 + e)
}

// 特征标准化（与 walkthroughs.ts / classifiers.ts 同一套约定）
function standardize(X: number[][]): { Z: number[][]; mean: number[]; std: number[] } {
  const n = X.length
  const d = X[0].length
  const mean = new Array(d).fill(0)
  const std = new Array(d).fill(0)
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j] / n
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2 / n
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1
  return { Z: X.map((row) => row.map((v, j) => (v - mean[j]) / std[j])), mean, std }
}

// ============================================================
// 1. 线性 SVM 逐步推演（Pegasos 简化版，与 LinearSVMClassifier 同公式）
//    目标：min (λ/2)·||w||² + (1/n)Σ max(0, 1 − yᵢ·(w·zᵢ+b))，y∈{−1,+1}，λ = 1/C
//    steps[0] = 随机初始化（随便画的一条线），之后每一步 = 一次全批量次梯度迭代
//    间隔宽度 = 2/||w||：正则项不断把 ||w|| 往下压，所以训练中间隔总体变宽
// ============================================================
export interface SvmStep {
  w: number[] // 当前法向量（标准化空间）
  b: number // 当前偏置（标准化空间）
  margin: number // 间隔宽度 2/||w||
  viol: number // 违反间隔的样本数：yᵢ·s < 1（落在带内或误侧）
  hinge: number // 平均 hinge 损失 (1/n)Σ max(0, 1 − yᵢ·s)
  acc: number // 训练准确率
  svIdx: number[] // 当前"正在起作用"的样本下标（yᵢ·s ≤ 1）
}

export interface SvmWalk {
  mean: number[]
  std: number[]
  steps: SvmStep[]
  converged: boolean
}

export function svmWalkthrough(X: number[][], y: number[], C = 1, lr = 0.05, maxIters = 240, seed = 13): SvmWalk {
  const { Z, mean, std } = standardize(X)
  const n = Z.length
  const d = Z[0].length
  const lambda = 1 / Math.max(C, 1e-6)

  const snap = (w: number[], b: number): SvmStep => {
    const norm = Math.hypot(...w)
    let viol = 0
    let hingeSum = 0
    let ok = 0
    const svIdx: number[] = []
    for (let i = 0; i < n; i++) {
      const yi = y[i] === 1 ? 1 : -1
      let s = b
      for (let j = 0; j < d; j++) s += w[j] * Z[i][j]
      const m = yi * s
      if (m < 1) {
        viol++
        hingeSum += 1 - m
      }
      if (m <= 1 + 1e-6) svIdx.push(i)
      if ((s >= 0 ? 1 : 0) === y[i]) ok++
    }
    return { w: [...w], b, margin: norm > 1e-9 ? 2 / norm : Infinity, viol, hinge: hingeSum / n, acc: ok / n, svIdx }
  }

  // 第 0 步：随机初始化一条"又陡又偏"的线（||w|| 偏大 → 间隔很窄，给"变宽"留出空间）
  const rng = mulberry32(seed)
  const w = Array.from({ length: d }, () => (rng() - 0.5) * 12)
  let b = (rng() - 0.5) * 4

  const steps: SvmStep[] = [snap(w, b)]
  let converged = false
  let prevObj = Infinity

  for (let t = 0; t < maxIters; t++) {
    const gw = w.map((wj) => lambda * wj)
    let gb = 0
    for (let i = 0; i < n; i++) {
      const yi = y[i] === 1 ? 1 : -1
      let s = b
      for (let j = 0; j < d; j++) s += w[j] * Z[i][j]
      if (yi * s < 1) {
        for (let j = 0; j < d; j++) gw[j] -= (yi * Z[i][j]) / n
        gb -= yi / n
      }
    }
    for (let j = 0; j < d; j++) w[j] -= lr * gw[j]
    b -= lr * gb
    const cur = snap(w, b)
    steps.push(cur)
    // 收敛判停：目标函数（hinge + λ/2·||w||²）不再明显下降
    const obj = cur.hinge + (lambda / 2) * (cur.w[0] ** 2 + cur.w[1] ** 2)
    if (Math.abs(prevObj - obj) < 1e-7) {
      converged = true
      break
    }
    prevObj = obj
  }
  return { mean, std, steps, converged }
}

/** 标准化空间直线 w·z + b = v 还原为原始坐标系数 a·x + c·y + e = v */
export function svmLineRaw(walk: SvmWalk, w: number[], b: number, v: number): { a: number; c: number; e: number } {
  const [m1, m2] = walk.mean
  const [s1, s2] = walk.std
  return { a: w[0] / s1, c: w[1] / s2, e: b - v - (w[0] * m1) / s1 - (w[1] * m2) / s2 }
}

// ============================================================
// 2. 随机森林逐步推演
//    第 k 步 = 训练第 k 棵树（bootstrap 抽样 + 节点级特征子集，与 RandomForestClassifier 一致）
//    steps[k] = 前 k+1 棵树多数投票后的训练/测试准确率
// ============================================================
export interface ForestTree {
  tree: TreeNodeG
  sampleIdx: number[] // 这棵树 bootstrap 抽到的训练样本下标（基于 Xtr）
}

export interface ForestStep {
  trainAcc: number // 前 k+1 棵树投票的训练准确率
  testAcc: number // 前 k+1 棵树投票的测试准确率
}

export interface ForestWalk {
  trees: ForestTree[]
  steps: ForestStep[]
  Xtr: number[][]
  ytr: number[]
  Xte: number[][]
  yte: number[]
}

/** 前 k 棵树对单行的多数投票结果（0/1） */
export function forestVote(trees: TreeNodeG[], row: number[]): number {
  let ones = 0
  for (const t of trees) if (treePredictG(t, row) >= 0.5) ones++
  return ones * 2 >= trees.length ? 1 : 0
}

export function forestWalkthrough(X: number[][], y: number[], nTrees = 9, maxDepth = 4, seed = 7): ForestWalk {
  const { Xtr, ytr, Xte, yte } = trainTestSplit(X, y, 0.3, 42)
  const n = Xtr.length
  const d = Xtr[0].length
  const rng = mulberry32(seed)

  const trees: ForestTree[] = []
  const steps: ForestStep[] = []
  for (let t = 0; t < nTrees; t++) {
    // 有放回抽样 n 个训练样本（bootstrap）
    const idx: number[] = []
    for (let i = 0; i < n; i++) idx.push(Math.floor(rng() * n))
    const cfg: TreeCfg = {
      maxDepth,
      minLeaf: 2,
      maxFeatures: Math.max(1, Math.round(Math.sqrt(d))),
      rng,
    }
    const tree = buildTreeG(Xtr, ytr, idx, 0, cfg, 'cls')
    trees.push({ tree, sampleIdx: idx })
    // 累计投票准确率
    const soFar = trees.map((tt) => tt.tree)
    let okTr = 0
    for (let i = 0; i < n; i++) if (forestVote(soFar, Xtr[i]) === ytr[i]) okTr++
    let okTe = 0
    for (let i = 0; i < Xte.length; i++) if (forestVote(soFar, Xte[i]) === yte[i]) okTe++
    steps.push({ trainAcc: okTr / n, testAcc: Xte.length ? okTe / Xte.length : 0 })
  }
  return { trees, steps, Xtr, ytr, Xte, yte }
}

// ============================================================
// 3. XGBoost 逐步推演（梯度提升树，与 XGBoostClassifier 同公式）
//    F₀ = log(p̄/(1−p̄))；每轮拟合负梯度残差 rᵢ = yᵢ − σ(Fᵢ)，F += η·tree
//    steps[k] = 加入 k 棵树之后的状态；steps[k].resid = 第 k+1 轮要"重点关照"的残差
//    树在原始坐标上生长（树模型不需要标准化）
// ============================================================
export interface XgbStep {
  loss: number // 对数损失（交叉熵）：−(1/n)Σ[y·ln p + (1−y)·ln(1−p)]
  acc: number // 训练准确率
  resid: number[] // 当前每个训练样本的残差 y − p（下一轮新树的"攻关名单"）
  wrong: number // |resid| ≥ 0.5 的样本数（此前猜错的）
  unsure: number // 0.25 ≤ |resid| < 0.5 的样本数（没把握的）
}

export interface XgbWalk {
  baseScore: number
  eta: number
  trees: TreeNodeG[] // trees[k] = 第 k+1 轮新增的小树（拟合 steps[k].resid）
  steps: XgbStep[] // 长度 = rounds + 1（含第 0 步：只有先验，没有树）
}

function xgbState(y: number[], F: number[]): XgbStep {
  const n = y.length
  let lossSum = 0
  let ok = 0
  let wrong = 0
  let unsure = 0
  const resid: number[] = []
  for (let i = 0; i < n; i++) {
    const p = Math.min(Math.max(sigmoid(F[i]), 1e-12), 1 - 1e-12)
    lossSum += -(y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p))
    const r = y[i] - p
    resid.push(r)
    const ar = Math.abs(r)
    if (ar >= 0.5) wrong++
    else if (ar >= 0.25) unsure++
    if ((p >= 0.5 ? 1 : 0) === y[i]) ok++
  }
  return { loss: lossSum / n, acc: ok / n, resid, wrong, unsure }
}

export function xgbWalkthrough(X: number[][], y: number[], rounds = 30, eta = 0.3, maxDepth = 3, seed = 11): XgbWalk {
  const n = X.length
  const rng = mulberry32(seed)
  const pMean = Math.min(Math.max(y.reduce((a, b2) => a + b2, 0) / n, 1e-4), 1 - 1e-4)
  const baseScore = Math.log(pMean / (1 - pMean))

  const F = new Array(n).fill(baseScore)
  const steps: XgbStep[] = [xgbState(y, F)]
  const trees: TreeNodeG[] = []
  const allIdx = X.map((_, i) => i)

  for (let r = 0; r < rounds; r++) {
    const resid = steps[steps.length - 1].resid
    const cfg: TreeCfg = { maxDepth, minLeaf: 3, maxFeatures: X[0].length, rng }
    const tree = buildTreeG(X, resid, allIdx, 0, cfg, 'reg')
    trees.push(tree)
    for (let i = 0; i < n; i++) F[i] += eta * treePredictG(tree, X[i])
    steps.push(xgbState(y, F))
  }
  return { baseScore, eta, trees, steps }
}

/** 用前 k 棵树对单行打分（k = 0 时只有先验）；firstOnly = true 时只用第 1 棵树（对比开关） */
export function xgbProba(walk: XgbWalk, row: number[], k: number, firstOnly = false): number {
  let f = walk.baseScore
  if (firstOnly) {
    if (k >= 1 && walk.trees.length > 0) f += walk.eta * treePredictG(walk.trees[0], row)
  } else {
    const kk = Math.min(k, walk.trees.length)
    for (let t = 0; t < kk; t++) f += walk.eta * treePredictG(walk.trees[t], row)
  }
  return sigmoid(f)
}
