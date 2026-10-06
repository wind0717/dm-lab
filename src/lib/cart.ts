// ============================================================
// CART 决策树（连续特征，二分类）—— 纯函数实现
// 训练结果一次性算好，并记录每个内部节点的"展开顺序"（BFS），
// UI 通过 step 序号控制树逐步展开，实现"每一步计算过程可见"。
// ============================================================

import { entropyOfCounts, giniOfCounts } from './entropy'
import type { Pt } from './datasets'

export type Criterion = 'gini' | 'entropy'

export interface TrainConfig {
  criterion: Criterion
  maxDepth: number // 最大深度 1~6
  minSamplesLeaf: number // 叶节点最小样本数
}

/** 一个候选分裂的评估结果 */
export interface SplitCandidate {
  feature: 0 | 1 // 0 = x1，1 = x2
  threshold: number
  gain: number // 信息增益 / 基尼增益
  leftCounts: number[]
  rightCounts: number[]
}

export interface TreeNode {
  id: number
  depth: number
  indices: number[] // 落入该节点的样本下标
  counts: number[] // 各类别计数 [A, B]
  impurity: number // 当前不纯度
  prediction: number // 多数类
  isLeaf: boolean
  leafReason?: string // 为什么停在这里（教学用）
  split?: {
    feature: 0 | 1
    threshold: number
    gain: number
    candidates: SplitCandidate[] // 该节点 Top 3 候选分裂
  }
  left?: TreeNode // 满足 x_f <= threshold
  right?: TreeNode
  /** 该节点在画布上对应的矩形区域 [xmin, ymin, xmax, ymax] */
  region: [number, number, number, number]
  /** BFS 展开顺序（仅内部节点有，从 0 开始）；叶子为 -1 */
  expandOrder: number
}

export interface TrainedTree {
  root: TreeNode
  /** 所有节点（BFS 顺序） */
  nodes: TreeNode[]
  /** 内部节点（按展开顺序排列），长度 = 总步数 */
  internalNodes: TreeNode[]
  depth: number
  leafCount: number
  accuracy: number
}

const impurityFn = (c: Criterion) => (c === 'gini' ? giniOfCounts : entropyOfCounts)

/** 统计样本类别计数 */
function countLabels(samples: Pt[], indices: number[]): number[] {
  const counts = [0, 0]
  for (const i of indices) counts[samples[i].label]++
  return counts
}

/** 评估某特征某阈值的分裂增益 */
function evalSplit(
  samples: Pt[],
  indices: number[],
  feature: 0 | 1,
  threshold: number,
  parentImpurity: number,
  impFn: (c: number[]) => number,
): SplitCandidate {
  const left: number[] = [0, 0]
  const right: number[] = [0, 0]
  for (const i of indices) {
    const v = feature === 0 ? samples[i].x : samples[i].y
    if (v <= threshold) left[samples[i].label]++
    else right[samples[i].label]++
  }
  const n = indices.length
  const nL = left[0] + left[1]
  const nR = n - nL
  const weighted = (nL / n) * impFn(left) + (nR / n) * impFn(right)
  return { feature, threshold, gain: parentImpurity - weighted, leftCounts: left, rightCounts: right }
}

/** 对连续特征穷举候选阈值（排序后相邻取值的中点），返回按增益降序的全部候选 */
export function candidateSplits(
  samples: Pt[],
  indices: number[],
  parentImpurity: number,
  impFn: (c: number[]) => number,
): SplitCandidate[] {
  const all: SplitCandidate[] = []
  for (const feature of [0, 1] as const) {
    const values = indices
      .map((i) => (feature === 0 ? samples[i].x : samples[i].y))
      .sort((a, b) => a - b)
    // 相邻不同值的中点作为候选阈值
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i + 1] - values[i] < 1e-9) continue
      const t = (values[i] + values[i + 1]) / 2
      all.push(evalSplit(samples, indices, feature, t, parentImpurity, impFn))
    }
  }
  all.sort((a, b) => b.gain - a.gain)
  return all
}

/** 训练完整棵树 */
export function trainTree(samples: Pt[], cfg: TrainConfig): TrainedTree {
  const impFn = impurityFn(cfg.criterion)
  let nextId = 0

  function build(indices: number[], depth: number, region: [number, number, number, number]): TreeNode {
    const counts = countLabels(samples, indices)
    const impurity = impFn(counts)
    const prediction = counts[0] >= counts[1] ? 0 : 1
    const node: TreeNode = {
      id: nextId++,
      depth,
      indices,
      counts,
      impurity,
      prediction,
      isLeaf: true,
      region,
      expandOrder: -1,
    }

    // ---- 停止条件（满足任一即为叶子）----
    if (indices.length === 0) {
      node.leafReason = '空节点'
      return node
    }
    if (impurity < 1e-9) {
      node.leafReason = '节点已纯净'
      return node
    }
    if (depth >= cfg.maxDepth) {
      node.leafReason = `达到最大深度 ${cfg.maxDepth}`
      return node
    }
    if (indices.length < cfg.minSamplesLeaf * 2) {
      node.leafReason = `样本太少（${indices.length} 个），再分会违反叶节点最小样本数 ${cfg.minSamplesLeaf}`
      return node
    }

    // ---- 穷举候选分裂，挑增益最大的 ----
    const candidates = candidateSplits(samples, indices, impurity, impFn)
    const best = candidates.find(
      (c) => c.leftCounts[0] + c.leftCounts[1] >= cfg.minSamplesLeaf && c.rightCounts[0] + c.rightCounts[1] >= cfg.minSamplesLeaf,
    )
    if (!best || best.gain <= 1e-9) {
      node.leafReason = '找不到更优的分裂（增益≈0）'
      return node
    }

    // ---- 执行分裂 ----
    node.isLeaf = false
    node.split = { feature: best.feature, threshold: best.threshold, gain: best.gain, candidates: candidates.slice(0, 3) }
    const leftIdx: number[] = []
    const rightIdx: number[] = []
    for (const i of indices) {
      const v = best.feature === 0 ? samples[i].x : samples[i].y
      if (v <= best.threshold) leftIdx.push(i)
      else rightIdx.push(i)
    }
    const [xmin, ymin, xmax, ymax] = region
    if (best.feature === 0) {
      node.left = build(leftIdx, depth + 1, [xmin, ymin, best.threshold, ymax])
      node.right = build(rightIdx, depth + 1, [best.threshold, ymin, xmax, ymax])
    } else {
      node.left = build(leftIdx, depth + 1, [xmin, ymin, xmax, best.threshold])
      node.right = build(rightIdx, depth + 1, [xmin, best.threshold, xmax, ymax])
    }
    return node
  }

  const root = build(samples.map((_, i) => i), 0, [0, 0, 100, 100])

  // ---- BFS 收集节点并给内部节点编号展开顺序 ----
  const nodes: TreeNode[] = []
  const internalNodes: TreeNode[] = []
  const queue: TreeNode[] = [root]
  let leafCount = 0
  let maxDepthSeen = 0
  while (queue.length > 0) {
    const n = queue.shift()!
    nodes.push(n)
    maxDepthSeen = Math.max(maxDepthSeen, n.depth)
    if (n.isLeaf) {
      leafCount++
    } else {
      n.expandOrder = internalNodes.length
      internalNodes.push(n)
      if (n.left) queue.push(n.left)
      if (n.right) queue.push(n.right)
    }
  }

  return {
    root,
    nodes,
    internalNodes,
    depth: maxDepthSeen,
    leafCount,
    accuracy: computeAccuracy(samples, root, internalNodes.length),
  }
}

/** 用"展开到第 step 步"的（部分）树预测一个点 */
export function predictPartial(root: TreeNode, x: number, y: number, step: number): number {
  let node = root
  // 节点已展开（expandOrder < step）且不是叶子时才继续往下走
  while (!node.isLeaf && node.expandOrder >= 0 && node.expandOrder < step && node.split) {
    const v = node.split.feature === 0 ? x : y
    const next = v <= node.split.threshold ? node.left : node.right
    if (!next) break
    node = next
  }
  return node.prediction
}

/** 当前（部分）树的训练准确率 */
export function computeAccuracy(samples: Pt[], root: TreeNode, step: number): number {
  if (samples.length === 0) return 0
  let ok = 0
  for (const s of samples) {
    if (predictPartial(root, s.x, s.y, step) === s.label) ok++
  }
  return ok / samples.length
}

/** 当前（部分）树的可见深度与叶数 */
export function visibleStats(root: TreeNode, step: number): { depth: number; leaves: number } {
  let depth = 0
  let leaves = 0
  function visit(n: TreeNode) {
    const expanded = !n.isLeaf && n.expandOrder >= 0 && n.expandOrder < step
    if (!expanded) {
      leaves++
      depth = Math.max(depth, n.depth)
      return
    }
    if (n.left) visit(n.left)
    if (n.right) visit(n.right)
  }
  visit(root)
  return { depth, leaves }
}

/** 类别颜色常量（A 橙 / B 蓝），供各处统一使用 */
export const CLASS_COLORS = ['#f97316', '#3b82f6'] as const
export const CLASS_BG = ['rgba(249,115,22,0.18)', 'rgba(59,130,246,0.18)'] as const
export const CLASS_NAMES = ['A 类', 'B 类'] as const
