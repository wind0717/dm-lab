// ============================================================
// 模型评估指标 —— 纯函数库
// 混淆矩阵 / 准确率 / 精确率 / 召回率 / F1 / ROC / AUC / 标准化 / 分层划分
// ============================================================

import { mulberry32 } from './classifiers'

/** 分层抽样的训练/测试集划分：每个类别内部按比例随机分 */
export function trainTestSplit(
  X: number[][],
  y: number[],
  testRatio: number,
  seed = 42,
): { Xtr: number[][]; ytr: number[]; Xte: number[][]; yte: number[]; teIdx: number[] } {
  const rng = mulberry32(seed)
  // 按类别分组下标
  const byClass = new Map<number, number[]>()
  y.forEach((c, i) => {
    if (!byClass.has(c)) byClass.set(c, [])
    byClass.get(c)!.push(i)
  })
  const teSet = new Set<number>()
  for (const idx of byClass.values()) {
    // 洗牌后取前 k 个进测试集
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    const k = Math.max(1, Math.round(idx.length * testRatio))
    for (let i = 0; i < k; i++) teSet.add(idx[i])
  }
  const Xtr: number[][] = []
  const ytr: number[] = []
  const Xte: number[][] = []
  const yte: number[] = []
  const teIdx: number[] = []
  X.forEach((row, i) => {
    if (teSet.has(i)) {
      Xte.push(row)
      yte.push(y[i])
      teIdx.push(i)
    } else {
      Xtr.push(row)
      ytr.push(y[i])
    }
  })
  return { Xtr, ytr, Xte, yte, teIdx }
}

/** 混淆矩阵：m[实际][预测]，labels 为出现的类别（升序） */
export function confusionMatrix(yTrue: number[], yPred: number[]): { labels: number[]; m: number[][] } {
  const labels = Array.from(new Set([...yTrue, ...yPred])).sort((a, b) => a - b)
  const pos = new Map(labels.map((c, i) => [c, i]))
  const m = labels.map(() => labels.map(() => 0))
  for (let i = 0; i < yTrue.length; i++) m[pos.get(yTrue[i])!][pos.get(yPred[i])!]++
  return { labels, m }
}

/** 准确率 = 猜对的 ÷ 总数 */
export function accuracyScore(yTrue: number[], yPred: number[]): number {
  if (yTrue.length === 0) return 0
  let ok = 0
  for (let i = 0; i < yTrue.length; i++) if (yTrue[i] === yPred[i]) ok++
  return ok / yTrue.length
}

/** 宏平均指标：把每个类别轮流当"正类"算 P/R/F1，再取算术平均 */
export function macroPRF(yTrue: number[], yPred: number[]): { precision: number; recall: number; f1: number } {
  const { labels, m } = confusionMatrix(yTrue, yPred)
  let pSum = 0
  let rSum = 0
  let fSum = 0
  labels.forEach((_, c) => {
    const tp = m[c][c]
    let predC = 0
    let trueC = 0
    for (let i = 0; i < labels.length; i++) {
      predC += m[i][c] // 预测为 c 的总数
      trueC += m[c][i] // 实际为 c 的总数
    }
    const p = predC > 0 ? tp / predC : 0
    const r = trueC > 0 ? tp / trueC : 0
    pSum += p
    rSum += r
    fSum += p + r > 0 ? (2 * p * r) / (p + r) : 0
  })
  const k = labels.length || 1
  return { precision: pSum / k, recall: rSum / k, f1: fSum / k }
}

/** 二分类四格计数：把 label=1 当正类 */
export function binaryCounts(yTrue: number[], yPred: number[]): { tp: number; fp: number; tn: number; fn: number } {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === 1 && yPred[i] === 1) tp++
    else if (yTrue[i] === 0 && yPred[i] === 1) fp++
    else if (yTrue[i] === 0 && yPred[i] === 0) tn++
    else fn++
  }
  return { tp, fp, tn, fn }
}

export interface RocPoint {
  threshold: number
  fpr: number // 假阳性率 = FP / (FP + TN)
  tpr: number // 真阳性率（召回）= TP / (TP + FN)
}

/** ROC 曲线点列：阈值从高到低扫描 predictProba，每落一个样本挪一步 */
export function rocPoints(yTrue: number[], proba: number[]): RocPoint[] {
  const P = yTrue.filter((v) => v === 1).length
  const N = yTrue.length - P
  const pairs = yTrue.map((v, i) => ({ p: proba[i], y: v })).sort((a, b) => b.p - a.p)
  const pts: RocPoint[] = [{ threshold: Infinity, fpr: 0, tpr: 0 }]
  let tp = 0
  let fp = 0
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) tp++
    else fp++
    // 相同概率的样本合并为一个点
    if (i + 1 < pairs.length && Math.abs(pairs[i + 1].p - pairs[i].p) < 1e-12) continue
    pts.push({ threshold: pairs[i].p, fpr: N > 0 ? fp / N : 0, tpr: P > 0 ? tp / P : 0 })
  }
  return pts
}

/** AUC（梯形法）：把 ROC 曲线下方面积一块一块加起来 */
export function aucOf(pts: RocPoint[]): number {
  let a = 0
  for (let i = 1; i < pts.length; i++) {
    const w = pts[i].fpr - pts[i - 1].fpr
    a += (w * (pts[i].tpr + pts[i - 1].tpr)) / 2
  }
  return a
}

/** 标准化：返回变换后的矩阵及每列均值/标准差 */
export function standardize(X: number[][]): { Z: number[][]; mean: number[]; std: number[] } {
  const n = X.length
  const d = X[0].length
  const mean = new Array(d).fill(0)
  const std = new Array(d).fill(0)
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j] / n
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2 / n
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1
  const Z = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]))
  return { Z, mean, std }
}
