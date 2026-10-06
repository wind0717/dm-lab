// ============================================================
// 七种分类方法 —— 纯 TypeScript 教学实现
// 统一接口：fit(X, y) / predict(X) / predictProba(X)
//   X: n × d 特征矩阵（每行一个样本），y: 0/1 标签（本工作台面向二分类）
//   predictProba 返回"属于 1 类（正类）的概率"，用于 ROC 曲线
// 所有实现面向 ≤500 样本、≤10 特征的教学规模，公式写在注释里
// ============================================================

export interface Classifier {
  fit(X: number[][], y: number[]): void
  predict(X: number[][]): number[]
  predictProba(X: number[][]): number[]
}

/** 带种子的随机数发生器（mulberry32），保证实验结果可复现 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** sigmoid 函数：σ(z) = 1 / (1 + e^(-z))，把任意实数压成 (0,1) 概率 */
function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z))
  const e = Math.exp(z)
  return e / (1 + e)
}

/** 计算每列均值与标准差（标准差为 0 的列记为 1，防止除零） */
function colStats(X: number[][]): { mean: number[]; std: number[] } {
  const n = X.length
  const d = X[0].length
  const mean = new Array(d).fill(0)
  const std = new Array(d).fill(0)
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j] / n
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2 / n
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1
  return { mean, std }
}

/** 用给定均值方差做标准化：z = (x - μ) / σ */
function applyStd(X: number[][], mean: number[], std: number[]): number[][] {
  return X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]))
}

// ============================================================
// 1. kNN（k 近邻）
// 直觉：看离你最近的 k 个邻居里哪类多，你就属于哪类
// 距离：欧氏距离 d(x, x') = √(Σⱼ (xⱼ - x'ⱼ)²)
// ============================================================

/** kNN 大数据降级阈值：训练集超过该规模时先抽样再训练（predict 是 O(n_te·n_tr·d) 暴力扫描） */
export const KNN_TRAIN_CAP = 2000

/**
 * kNN 大数据保护：训练集超过 cap 时，用固定种子随机抽 cap 个代表点。
 * 返回 sampled=true 表示发生了抽样（UI 据此提示"kNN 自动加速"）。
 */
export function subsampleKnnTrain(
  X: number[][],
  y: number[],
  cap = KNN_TRAIN_CAP,
  seed = 99,
): { X: number[][]; y: number[]; sampled: boolean } {
  if (X.length <= cap) return { X, y, sampled: false }
  const rng = mulberry32(seed)
  const idx = X.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  const keep = idx.slice(0, cap).sort((a, b) => a - b)
  return { X: keep.map((i) => X[i]), y: keep.map((i) => y[i]), sampled: true }
}

export class KNNClassifier implements Classifier {
  private X: number[][] = []
  private y: number[] = []
  k: number
  constructor(k = 5) {
    this.k = k
  }

  fit(X: number[][], y: number[]): void {
    this.X = X
    this.y = y
  }

  /** 单个样本的 k 个最近邻居下标（按距离升序） */
  private neighbors(row: number[]): number[] {
    const dists = this.X.map((xi, i) => {
      let s = 0
      for (let j = 0; j < row.length; j++) s += (xi[j] - row[j]) ** 2
      return [s, i] as [number, number]
    })
    dists.sort((a, b) => a[0] - b[0])
    return dists.slice(0, Math.min(this.k, dists.length)).map((d) => d[1])
  }

  predictProba(X: number[][]): number[] {
    return X.map((row) => {
      const nb = this.neighbors(row)
      const ones = nb.reduce((s, i) => s + this.y[i], 0)
      return ones / nb.length // 邻居中正类占比 ≈ 概率
    })
  }

  predict(X: number[][]): number[] {
    return this.predictProba(X).map((p) => (p >= 0.5 ? 1 : 0))
  }
}

// ============================================================
// 2. 逻辑回归（二元，梯度下降）
// 模型：p = σ(w·x + b)
// 损失：交叉熵 L = -(1/n)Σ [y·ln p + (1-y)·ln(1-p)]
// 梯度：∂L/∂w = (1/n)Σ (p - y)·x，∂L/∂b = (1/n)Σ (p - y)
// 特征内部标准化（保存均值方差，预测时套用同一变换）
// ============================================================
export class LogisticRegressionClassifier implements Classifier {
  private w: number[] = []
  private b = 0
  private mean: number[] = []
  private std: number[] = []
  lr: number // 学习率
  iters: number // 迭代次数
  constructor(lr = 0.1, iters = 2000) {
    this.lr = lr
    this.iters = iters
  }

  fit(X: number[][], y: number[]): void {
    const { mean, std } = colStats(X)
    this.mean = mean
    this.std = std
    const Z = applyStd(X, mean, std)
    const n = Z.length
    const d = Z[0].length
    this.w = new Array(d).fill(0)
    this.b = 0
    for (let t = 0; t < this.iters; t++) {
      const gw = new Array(d).fill(0)
      let gb = 0
      for (let i = 0; i < n; i++) {
        let z = this.b
        for (let j = 0; j < d; j++) z += this.w[j] * Z[i][j]
        const err = sigmoid(z) - y[i] // (p - y)
        for (let j = 0; j < d; j++) gw[j] += err * Z[i][j]
        gb += err
      }
      for (let j = 0; j < d; j++) this.w[j] -= (this.lr * gw[j]) / n
      this.b -= (this.lr * gb) / n
    }
  }

  predictProba(X: number[][]): number[] {
    return applyStd(X, this.mean, this.std).map((row) => {
      let z = this.b
      for (let j = 0; j < row.length; j++) z += this.w[j] * row[j]
      return sigmoid(z)
    })
  }

  predict(X: number[][]): number[] {
    return this.predictProba(X).map((p) => (p >= 0.5 ? 1 : 0))
  }
}

// ============================================================
// 3. 高斯朴素贝叶斯
// 假设每个特征在类别内服从正态分布，且特征间相互独立（"朴素"）：
//   P(x | c) = Πⱼ N(xⱼ | μ_{c,j}, σ²_{c,j})
// 预测取后验最大的类别：argmax_c P(c)·P(x|c)
// ============================================================
export class GaussianNBClassifier implements Classifier {
  private prior: [number, number] = [0.5, 0.5]
  private mean: [number[], number[]] = [[], []]
  private varr: [number[], number[]] = [[], []]

  fit(X: number[][], y: number[]): void {
    const d = X[0].length
    for (const c of [0, 1] as const) {
      const rows = X.filter((_, i) => y[i] === c)
      this.prior[c] = Math.max(rows.length, 1) / X.length
      const m = new Array(d).fill(0)
      const v = new Array(d).fill(0)
      for (const row of rows) for (let j = 0; j < d; j++) m[j] += row[j] / rows.length
      for (const row of rows) for (let j = 0; j < d; j++) v[j] += (row[j] - m[j]) ** 2 / rows.length
      // 加微小平滑方差，防止某列方差为 0 导致概率爆炸
      this.mean[c] = m
      this.varr[c] = v.map((x) => x + 1e-9)
    }
  }

  /** 对数概率：ln P(c) + Σⱼ ln N(xⱼ|μ,σ²)，ln N = -0.5·ln(2πσ²) - (x-μ)²/(2σ²) */
  private logPosterior(row: number[], c: 0 | 1): number {
    let s = Math.log(this.prior[c])
    for (let j = 0; j < row.length; j++) {
      const varj = this.varr[c][j]
      s += -0.5 * Math.log(2 * Math.PI * varj) - (row[j] - this.mean[c][j]) ** 2 / (2 * varj)
    }
    return s
  }

  predictProba(X: number[][]): number[] {
    return X.map((row) => {
      const l0 = this.logPosterior(row, 0)
      const l1 = this.logPosterior(row, 1)
      const mx = Math.max(l0, l1) // 数值稳定：先减最大值再 softmax
      const e0 = Math.exp(l0 - mx)
      const e1 = Math.exp(l1 - mx)
      return e1 / (e0 + e1)
    })
  }

  predict(X: number[][]): number[] {
    return this.predictProba(X).map((p) => (p >= 0.5 ? 1 : 0))
  }
}

// ============================================================
// 4. 线性 SVM（hinge loss + 次梯度下降，Pegasos 简化版）
// 目标：min  (λ/2)·||w||² + (1/n)Σ max(0, 1 - yᵢ·(w·xᵢ+b))，y∈{-1,+1}
// 次梯度：误分类/间隔内样本贡献 -y·x，正则项贡献 λ·w
// λ = 1/C：C 越大越在乎分错（间隔窄），C 小则间隔宽、更"佛系"
// predictProba：decision = w·x + b 经 sigmoid 压缩的近似概率（教学近似）
// ============================================================
export class LinearSVMClassifier implements Classifier {
  private w: number[] = []
  private b = 0
  private mean: number[] = []
  private std: number[] = []
  C: number
  lr: number
  iters: number
  constructor(C = 1, lr = 0.05, iters = 800) {
    this.C = C
    this.lr = lr
    this.iters = iters
  }

  fit(X: number[][], y: number[]): void {
    const { mean, std } = colStats(X)
    this.mean = mean
    this.std = std
    const Z = applyStd(X, mean, std)
    const n = Z.length
    const d = Z[0].length
    const lambda = 1 / Math.max(this.C, 1e-6)
    this.w = new Array(d).fill(0)
    this.b = 0
    for (let t = 0; t < this.iters; t++) {
      const gw = this.w.map((wj) => lambda * wj)
      let gb = 0
      for (let i = 0; i < n; i++) {
        const yi = y[i] === 1 ? 1 : -1
        let s = this.b
        for (let j = 0; j < d; j++) s += this.w[j] * Z[i][j]
        if (yi * s < 1) {
          // hinge 未满足：贡献次梯度 -y·x
          for (let j = 0; j < d; j++) gw[j] -= (yi * Z[i][j]) / n
          gb -= yi / n
        }
      }
      for (let j = 0; j < d; j++) this.w[j] -= this.lr * gw[j]
      this.b -= this.lr * gb
    }
  }

  private decision(row: number[]): number {
    let s = this.b
    for (let j = 0; j < row.length; j++) s += this.w[j] * row[j]
    return s
  }

  predictProba(X: number[][]): number[] {
    return applyStd(X, this.mean, this.std).map((row) => sigmoid(this.decision(row)))
  }

  predict(X: number[][]): number[] {
    return applyStd(X, this.mean, this.std).map((row) => (this.decision(row) >= 0 ? 1 : 0))
  }
}

// ============================================================
// 通用 CART 树骨架（分类/回归共用节点结构）
// 分裂准则（分类）：Gini 增益 = Gini(父) - [nL/n·Gini(左) + nR/n·Gini(右)]
// 分裂准则（回归）：方差减少 = Var(父) - [nL/n·Var(左) + nR/n·Var(右)]
// 候选阈值：该特征排序后相邻不同值的中点
// ============================================================
export interface TreeNodeG {
  value: number // 叶子输出：分类=正类占比，回归=残差均值
  feature?: number
  threshold?: number
  left?: TreeNodeG
  right?: TreeNodeG
}

export interface TreeCfg {
  maxDepth: number
  minLeaf: number
  maxFeatures: number // 每个节点随机候选的特征数（<= d）
  rng: () => number
}

/** 通用树构建：mode='cls' 用 gini，mode='reg' 用方差；y 为连续值时即回归 */
export function buildTreeG(X: number[][], y: number[], idx: number[], depth: number, cfg: TreeCfg, mode: 'cls' | 'reg'): TreeNodeG {
  const n = idx.length
  const mean = idx.reduce((s, i) => s + y[i], 0) / n
  const node: TreeNodeG = { value: mean }
  if (depth >= cfg.maxDepth || n < cfg.minLeaf * 2) return node

  // 当前节点不纯度
  let parentImp: number
  if (mode === 'cls') {
    const p = mean // 正类占比
    parentImp = 1 - p * p - (1 - p) * (1 - p)
    if (parentImp < 1e-9) return node // 已纯净
  } else {
    parentImp = idx.reduce((s, i) => s + (y[i] - mean) ** 2, 0) / n
    if (parentImp < 1e-12) return node
  }

  const d = X[0].length
  // 随机选 maxFeatures 个特征作为本节点候选（随机森林的"特征子采样"）
  const feats = Array.from({ length: d }, (_, j) => j)
  for (let i = feats.length - 1; i > 0; i--) {
    const j = Math.floor(cfg.rng() * (i + 1))
    ;[feats[i], feats[j]] = [feats[j], feats[i]]
  }
  const candFeats = feats.slice(0, Math.min(cfg.maxFeatures, d))

  let bestGain = 1e-12
  let bestF = -1
  let bestT = 0
  for (const f of candFeats) {
    // 先按该特征排序，再一次线性扫描所有候选切点：
    // 每个切点的不纯度用增量统计 O(1) 更新，单特征总成本 O(n log n)。
    // （旧实现每个切点都重新分组 O(n)，单特征 O(n²)；
    //   5000 行数据下随机森林/XGBoost 需要几十秒，排序扫描后降到亚秒级。
    //   候选切点集合、扫描顺序、tie-breaking 与旧实现完全一致，分裂结果不变。）
    const order = idx.slice().sort((a, b) => X[a][f] - X[b][f])
    if (mode === 'cls') {
      let total = 0
      for (const i of idx) total += y[i] // 0/1 标签，整数求和无浮点误差
      let sumL = 0
      for (let k = 0; k < order.length - 1; k++) {
        sumL += y[order[k]]
        const v0 = X[order[k]][f]
        const v1 = X[order[k + 1]][f]
        if (v1 - v0 < 1e-9) continue
        const nL = k + 1
        const nR = n - nL
        if (nL < cfg.minLeaf || nR < cfg.minLeaf) continue
        const pL = sumL / nL
        const pR = (total - sumL) / nR
        const impL = 1 - pL * pL - (1 - pL) * (1 - pL)
        const impR = 1 - pR * pR - (1 - pR) * (1 - pR)
        const gain = parentImp - (nL / n) * impL - (nR / n) * impR
        if (gain > bestGain) {
          bestGain = gain
          bestF = f
          bestT = (v0 + v1) / 2
        }
      }
    } else {
      let total = 0
      let totalSq = 0
      for (const i of idx) {
        total += y[i]
        totalSq += y[i] * y[i]
      }
      let sumL = 0
      let sumSqL = 0
      for (let k = 0; k < order.length - 1; k++) {
        const yv = y[order[k]]
        sumL += yv
        sumSqL += yv * yv
        const v0 = X[order[k]][f]
        const v1 = X[order[k + 1]][f]
        if (v1 - v0 < 1e-9) continue
        const nL = k + 1
        const nR = n - nL
        if (nL < cfg.minLeaf || nR < cfg.minLeaf) continue
        // 方差 = E[y²] - (E[y])²（与"先求均值再求平方偏差"数学等价）
        const mL = sumL / nL
        const mR = (total - sumL) / nR
        const impL = Math.max(0, sumSqL / nL - mL * mL)
        const impR = Math.max(0, (totalSq - sumSqL) / nR - mR * mR)
        const gain = parentImp - (nL / n) * impL - (nR / n) * impR
        if (gain > bestGain) {
          bestGain = gain
          bestF = f
          bestT = (v0 + v1) / 2
        }
      }
    }
  }
  if (bestF < 0) return node // 找不到有效分裂
  // 用最优切点把样本分成左右两组（O(n)，只在最终选定的特征上做一次）
  const bestL: number[] = []
  const bestR: number[] = []
  for (const i of idx) (X[i][bestF] <= bestT ? bestL : bestR).push(i)
  node.feature = bestF
  node.threshold = bestT
  node.left = buildTreeG(X, y, bestL, depth + 1, cfg, mode)
  node.right = buildTreeG(X, y, bestR, depth + 1, cfg, mode)
  return node
}

export function treePredictG(node: TreeNodeG, row: number[]): number {
  let cur = node
  while (cur.feature !== undefined && cur.left && cur.right) {
    cur = row[cur.feature] <= cur.threshold! ? cur.left : cur.right
  }
  return cur.value
}

// ============================================================
// 5. 决策树分类器（通用 CART，gini 准则）
// ============================================================
export class DecisionTreeClassifier implements Classifier {
  private root: TreeNodeG | null = null
  maxDepth: number
  minLeaf: number
  constructor(maxDepth = 6, minLeaf = 2) {
    this.maxDepth = maxDepth
    this.minLeaf = minLeaf
  }

  fit(X: number[][], y: number[]): void {
    const cfg: TreeCfg = {
      maxDepth: this.maxDepth,
      minLeaf: this.minLeaf,
      maxFeatures: X[0].length,
      rng: mulberry32(42),
    }
    this.root = buildTreeG(X, y, X.map((_, i) => i), 0, cfg, 'cls')
  }

  predictProba(X: number[][]): number[] {
    return X.map((row) => treePredictG(this.root!, row))
  }

  predict(X: number[][]): number[] {
    return this.predictProba(X).map((p) => (p >= 0.5 ? 1 : 0))
  }
}

// ============================================================
// 6. 随机森林
// Bagging：每棵树对样本做有放回抽样（bootstrap，约 63.2% 样本被抽到）
// 特征随机子集：每个节点只从随机 sqrt(d) 个特征里挑分裂
// 预测：多数投票；predictProba = 投正类的树占比
// ============================================================
export class RandomForestClassifier implements Classifier {
  private trees: TreeNodeG[] = []
  nTrees: number
  maxDepth: number
  minLeaf: number
  constructor(nTrees = 20, maxDepth = 6, minLeaf = 2) {
    this.nTrees = nTrees
    this.maxDepth = maxDepth
    this.minLeaf = minLeaf
  }

  fit(X: number[][], y: number[]): void {
    const n = X.length
    const d = X[0].length
    const rng = mulberry32(7)
    this.trees = []
    for (let t = 0; t < this.nTrees; t++) {
      // 有放回抽样 n 个样本
      const idx: number[] = []
      for (let i = 0; i < n; i++) idx.push(Math.floor(rng() * n))
      const cfg: TreeCfg = {
        maxDepth: this.maxDepth,
        minLeaf: this.minLeaf,
        maxFeatures: Math.max(1, Math.round(Math.sqrt(d))),
        rng,
      }
      this.trees.push(buildTreeG(X, y, idx, 0, cfg, 'cls'))
    }
  }

  predictProba(X: number[][]): number[] {
    return X.map((row) => {
      let ones = 0
      for (const t of this.trees) if (treePredictG(t, row) >= 0.5) ones++
      return ones / this.trees.length
    })
  }

  predict(X: number[][]): number[] {
    return this.predictProba(X).map((p) => (p >= 0.5 ? 1 : 0))
  }
}

// ============================================================
// 7. XGBoost 教学简化版（梯度提升树）
// 思想：一轮一轮地加小回归树，每棵新树拟合当前模型的"负梯度残差"
//   对数损失下，负梯度 = y - p（真实标签 - 当前预测概率）
//   F₀ = log(p̄/(1-p̄))（先验胜率），F_t = F_{t-1} + η·tree_t
//   最终概率 p = σ(F)
// 与真正的 XGBoost 的差别（教学简化）：没有二阶导数（hessian）加权、
// 没有正则项和列采样，但"逐步纠错"的核心直觉完全一致。
// 基学习器：深度 ≤3 的小回归树（方差减少分裂）
// ============================================================
export class XGBoostClassifier implements Classifier {
  private trees: TreeNodeG[] = []
  private baseScore = 0
  rounds: number
  eta: number // 学习率：每棵树的贡献打几折
  maxDepth: number
  constructor(rounds = 20, eta = 0.3, maxDepth = 3) {
    this.rounds = rounds
    this.eta = eta
    this.maxDepth = maxDepth
  }

  fit(X: number[][], y: number[]): void {
    const n = X.length
    const rng = mulberry32(11)
    const pMean = Math.min(Math.max(y.reduce((a, b) => a + b, 0) / n, 1e-4), 1 - 1e-4)
    this.baseScore = Math.log(pMean / (1 - pMean))
    const F = new Array(n).fill(this.baseScore)
    this.trees = []
    for (let r = 0; r < this.rounds; r++) {
      // 负梯度残差：g_i = y_i - σ(F_i)
      const resid = F.map((f, i) => y[i] - sigmoid(f))
      const cfg: TreeCfg = { maxDepth: this.maxDepth, minLeaf: 3, maxFeatures: X[0].length, rng }
      const tree = buildTreeG(X, resid, X.map((_, i) => i), 0, cfg, 'reg')
      this.trees.push(tree)
      for (let i = 0; i < n; i++) F[i] += this.eta * treePredictG(tree, X[i])
    }
  }

  predictProba(X: number[][]): number[] {
    return X.map((row) => {
      let f = this.baseScore
      for (const t of this.trees) f += this.eta * treePredictG(t, row)
      return sigmoid(f)
    })
  }

  predict(X: number[][]): number[] {
    return this.predictProba(X).map((p) => (p >= 0.5 ? 1 : 0))
  }
}
