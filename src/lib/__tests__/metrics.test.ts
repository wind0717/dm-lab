// ============================================================
// 评估指标与信息论 —— 单元测试
//
// 这些函数有精确的数学定义，可以用解析解验证，不只是"跑通不报错"。
// 参照：Wikipedia 混淆矩阵 / ROC-AUC / 香农熵定义
//
// 注意各函数的入参约定（易错点）：
//   binaryEntropy(p)      p 是比例，如 0.5
//   giniBinary(p)         p 是正类比例，如 0.5
//   entropyOfCounts(c)    c 是计数，内部归一化，如 [25,25]
//   confusionMatrix()     返回 { labels, m }，m[实际][预测]
//   macroPRF()            对每个类别算 P/R/F1 后取宏平均
//   standardize()         返回 { Z, mean, std }，Z 用总体标准差
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  confusionMatrix,
  accuracyScore,
  macroPRF,
  binaryCounts,
  rocPoints,
  aucOf,
  trainTestSplit,
  standardize,
} from '@/lib/metrics'
import {
  jointEntropy,
  conditionalEntropy,
  mutualInformation,
  klDivergence,
  splitInfo,
  gainRatio,
} from '@/lib/infotheory'
import { binaryEntropy, giniBinary, entropyOfCounts, giniOfCounts, informationGain } from '@/lib/entropy'

const EPS = 1e-9

describe('混淆矩阵', () => {
  it('binaryCounts 计数正确', () => {
    // 实际 [0,0,1,1]，预测 [0,1,1,1] → TN=1 FP=1 FN=0 TP=2
    const { tn, fp, fn, tp } = binaryCounts([0, 0, 1, 1], [0, 1, 1, 1])
    expect(tn).toBe(1)
    expect(fp).toBe(1)
    expect(fn).toBe(0)
    expect(tp).toBe(2)
  })

  it('矩阵为 2×2，m[实际][预测]', () => {
    const { labels, m } = confusionMatrix([0, 0, 1, 1], [0, 1, 1, 1])
    expect(labels).toEqual([0, 1])
    expect(m).toHaveLength(2)
    expect(m[0]).toHaveLength(2)
    expect(m[0][0]).toBe(1) // 实际0 预测0
    expect(m[0][1]).toBe(1) // 实际0 预测1
    expect(m[1][0]).toBe(0) // 实际1 预测0
    expect(m[1][1]).toBe(2) // 实际1 预测1
  })

  it('矩阵元素总和 = 样本数', () => {
    const y = [0, 1, 0, 1, 1, 1]
    const p = [0, 1, 1, 1, 0, 1]
    const { m } = confusionMatrix(y, p)
    const total = m.flat().reduce((s, v) => s + v, 0)
    expect(total).toBe(y.length)
  })

  it('全预测对时准确率 1，全错时为 0', () => {
    expect(accuracyScore([0, 1, 0, 1], [0, 1, 0, 1])).toBeCloseTo(1, 9)
    expect(accuracyScore([0, 1, 0, 1], [1, 0, 1, 0])).toBeCloseTo(0, 9)
  })

  it('类别不均时准确率会骗人（演示"全猜多数类"）', () => {
    // 95 个 0，5 个 1；模型全猜 0 → 准确率 95%，但正类一个都没抓到
    const y = [...Array(95).fill(0), ...Array(5).fill(1)]
    const p = [...Array(100).fill(0)]
    expect(accuracyScore(y, p)).toBeCloseTo(0.95, 9)
    const { tp, fn } = binaryCounts(y, p)
    expect(tp).toBe(0)
    expect(fn).toBe(5)
    // macroPRF 是宏平均：负类完美（recall=1），正类全错（recall=0）→ 平均 recall = 0.5
    const { recall, f1 } = macroPRF(y, p)
    expect(recall).toBeCloseTo(0.5, 9)
    expect(f1).toBeLessThan(0.5)
  })
})

describe('P / R / F1（宏平均）', () => {
  it('正类 TP=3 FP=1 FN=2 TN=4 时宏平均数值正确', () => {
    // 10 个样本，5 正 5 负；预测抓到3 个正类、误报 1 个负类、漏掉 2 个正类
    const y = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
    const p = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0]
    const { tp, fp, fn, tn } = binaryCounts(y, p)
    expect(tp).toBe(3) // y=1 且 p=1 → 索引 5,6,7
    expect(fp).toBe(1) // y=0 但 p=1 → 索引 4
    expect(fn).toBe(2) // y=1 但 p=0 → 索引 8,9
    expect(tn).toBe(4) // y=0 且 p=0 → 索引 0,1,2,3
    const { precision, recall, f1 } = macroPRF(y, p)
    // 矩阵 m[实际][预测] = [[4,1],[2,3]]
    // 类别0：tp=4，预测为0共6， 实际为0共5 → P=4/6≈0.667，R=4/5=0.8
    // 类别1：tp=3，预测为1共 4， 实际为1共 5 → P=3/4=0.75， R=3/5=0.6
    const pPos = 3 / 4
    const rPos = 3 / 5
    const pNeg = 4 / 6
    const rNeg = 4 / 5
    expect(precision).toBeCloseTo((pPos + pNeg) / 2, 9)
    expect(recall).toBeCloseTo((rPos + rNeg) / 2, 9)
    expect(f1).toBeCloseTo(((2 * pPos * rPos) / (pPos + rPos) + (2 * pNeg * rNeg) / (pNeg + rNeg)) / 2, 9)
  })

  it('无正类预测时不产生 NaN', () => {
    const { precision, recall, f1 } = macroPRF([1, 1, 1], [0, 0, 0])
    expect(Number.isFinite(precision)).toBe(true)
    expect(Number.isFinite(recall)).toBe(true)
    expect(Number.isFinite(f1)).toBe(true)
    expect(f1).toBeCloseTo(0, 9)
  })

  it('完美预测时 P=R=F1=1', () => {
    const { precision, recall, f1 } = macroPRF([0, 0, 1, 1], [0, 0, 1, 1])
    expect(precision).toBeCloseTo(1, 9)
    expect(recall).toBeCloseTo(1, 9)
    expect(f1).toBeCloseTo(1, 9)
  })
})

describe('ROC / AUC', () => {
  it('完美排序时 AUC = 1', () => {
    // 正类概率都高于负类 → 曲线在右上
    expect(aucOf(rocPoints([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]))).toBeCloseTo(1, 6)
  })

  it('完全反序时 AUC = 0', () => {
    expect(aucOf(rocPoints([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1]))).toBeCloseTo(0, 6)
  })

  it('随机排序时 AUC ≈ 0.5', () => {
    // 概率与标签无关（正类反而低）→ 接近随机
    const y = [...Array(20).fill(0), ...Array(20).fill(1)]
    const proba = y.map((v, i) => (v === 1 ? 1 - i / 40 : i / 40))
    const auc = aucOf(rocPoints(y, proba))
    expect(auc).toBeGreaterThan(0.2)
    expect(auc).toBeLessThan(0.8)
  })

  it('ROC 曲线端点为 (0,0) 到 (1,1)', () => {
    const pts = rocPoints([0, 1], [0.2, 0.8])
    expect(pts[0].fpr).toBeCloseTo(0, 9)
    expect(pts[0].tpr).toBeCloseTo(0, 9)
    const last = pts[pts.length - 1]
    expect(last.fpr).toBeCloseTo(1, 9)
    expect(last.tpr).toBeCloseTo(1, 9)
  })

  it('AUC 恒在 [0,1] 内（不会因输入异常而越界）', () => {
    const cases: Array<[number[], number[]]> = [
      [[0, 1], [0.1, 0.9]],
      [[1, 0], [0.9, 0.1]],
      [[0, 0, 1, 1], [0.5, 0.5, 0.5, 0.5]],
      [[1, 1, 0, 0], [0.1, 0.2, 0.8, 0.9]],
      [[0], [0.5]], // 单样本边界情况不应崩
    ]
    for (const [y, p] of cases) {
      const a = aucOf(rocPoints(y, p))
      expect(Number.isFinite(a)).toBe(true)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(1)
    }
  })
})

describe('训练/测试集划分', () => {
  const X = Array.from({ length: 100 }, (_, i) => [i, i * 2])
  const y = Array.from({ length: 100 }, (_, i) => i % 2)

  it('分层划分：两类比例保持一致', () => {
    const { Xtr, ytr, Xte, yte } = trainTestSplit(X, y, 0.3)
    expect(Xtr.length + Xte.length).toBe(100)
    const onesTr = ytr.reduce((s: number, v) => s + v, 0)
    const onesTe = yte.reduce((s: number, v: number) => s + v, 0)
    // 原数据正类 50 / 100 = 50%，划分后仍应接近 50%
    expect(onesTr / ytr.length).toBeCloseTo(0.5, 1)
    expect(onesTe / yte.length).toBeCloseTo(0.5, 1)
  })

  it('同种子结果完全一致（可复现）', () => {
    const a = trainTestSplit(X, y, 0.3, 42)
    const b = trainTestSplit(X, y, 0.3, 42)
    expect(a.Xte).toEqual(b.Xte)
    expect(a.yte).toEqual(b.yte)
  })

  it('不同种子产生不同划分', () => {
    const a = trainTestSplit(X, y, 0.3, 42)
    const b = trainTestSplit(X, y, 0.3, 7)
    expect(JSON.stringify(a.Xte)).not.toBe(JSON.stringify(b.Xte))
  })

  it('测试集下标无重复，且总数守恒', () => {
    const { teIdx, Xtr, Xte } = trainTestSplit(X, y, 0.3, 42)
    expect(new Set(teIdx).size).toBe(teIdx.length)
    expect(Xtr.length + Xte.length).toBe(100)
  })

  it('测试比例越大测试集越大', () => {
    const small = trainTestSplit(X, y, 0.1, 42)
    const large = trainTestSplit(X, y, 0.5, 42)
    expect(large.Xte.length).toBeGreaterThan(small.Xte.length)
  })
})

describe('标准化', () => {
  it('结果均值为 0、标准差为 1', () => {
    const { Z } = standardize([[1], [2], [3], [4], [5]])
    const mean = Z.reduce((s, r) => s + r[0], 0) / Z.length
    const sd = Math.sqrt(Z.reduce((s, r) => s + r[0] ** 2, 0) / Z.length)
    expect(mean).toBeCloseTo(0, 9)
    expect(sd).toBeCloseTo(1, 9)
  })

  it('同时返回原始 mean 与 std', () => {
    const { mean, std } = standardize([[1], [2], [3]])
    expect(mean[0]).toBeCloseTo(2, 9)
    expect(std[0]).toBeCloseTo(Math.sqrt(2 / 3), 9)
  })

  it('常数列不会除零（标准差记为 1）', () => {
    const { Z, std } = standardize([[5], [5], [5]])
    expect(std[0]).toBe(1)
    for (const row of Z) expect(Number.isFinite(row[0])).toBe(true)
  })

  it('多列各自独立标准化', () => {
    const X = [[1, 100], [2, 200], [3, 300]]
    const { Z } = standardize(X)
    for (let j = 0; j < 2; j++) {
      const mean = Z.reduce((s, r) => s + r[j], 0) / Z.length
      expect(mean).toBeCloseTo(0, 9)
    }
  })
})

describe('香农熵', () => {
  it('binaryEntropy(0.5) = 1', () => {
    expect(binaryEntropy(0.5)).toBeCloseTo(1, 9)
  })

  it('entropyOfCounts 均匀分布 = log2(n)', () => {
    // 4 个等概率取值 → log2(4) = 2
    expect(entropyOfCounts([25, 25, 25, 25])).toBeCloseTo(2, 9)
  })

  it('确定分布熵为 0', () => {
    expect(binaryEntropy(0)).toBeCloseTo(0, 9)
    expect(binaryEntropy(1)).toBeCloseTo(0, 9)
    expect(entropyOfCounts([50])).toBeCloseTo(0, 9)
    expect(entropyOfCounts([100, 0])).toBeCloseTo(0, 9)
  })

  it('3:1 分布 ≈ 0.8113', () => {
    expect(binaryEntropy(0.75)).toBeCloseTo(0.811278, 6)
  })

  it('熵不超过 log2(类别数)', () => {
    expect(entropyOfCounts([50, 30, 20])).toBeLessThanOrEqual(Math.log2(3) + EPS)
  })

  it('忽略零频项（不产生 NaN）', () => {
    const h = entropyOfCounts([70, 30, 0, 0])
    expect(Number.isFinite(h)).toBe(true)
    expect(h).toBeCloseTo(0.881291, 6)
  })
})

describe('GINI 不纯度', () => {
  it('giniBinary(0.5) = 0.5', () => {
    // 1 - 0.25 - 0.25 = 0.5
    expect(giniBinary(0.5)).toBeCloseTo(0.5, 9)
    expect(giniBinary(0)).toBeCloseTo(0, 9)
    expect(giniBinary(1)).toBeCloseTo(0, 9)
  })

  it('giniOfCounts = 1 - Σp²', () => {
    expect(giniOfCounts([50, 50])).toBeCloseTo(0.5, 9)
    expect(giniOfCounts([100, 0])).toBeCloseTo(0, 9)
    // 4 等分 → 1 - 4*(1/4)² = 0.75
    expect(giniOfCounts([25, 25, 25, 25])).toBeCloseTo(0.75, 9)
  })

  it('GINI ≤ 熵（同分布下恒成立）', () => {
    for (const counts of [[50, 50], [75, 25], [90, 10], [40, 30, 20, 10]]) {
      expect(giniOfCounts(counts)).toBeLessThanOrEqual(entropyOfCounts(counts) + EPS)
    }
  })
})

describe('信息增益', () => {
  it('完美分离时增益等于父节点熵', () => {
    // 父 [50,50] 熵=1；子 [50,0] 与 [0,50] 熵=0 → IG = 1
    expect(informationGain([50, 50], [50, 0], [0, 50], entropyOfCounts)).toBeCloseTo(1, 9)
  })

  it('无信息的分裂增益为 0', () => {
    expect(informationGain([50, 50], [25, 25], [25, 25], entropyOfCounts)).toBeCloseTo(0, 9)
  })

  it('换成 GINI 计算：完美分离增益为 0.5', () => {
    expect(informationGain([50, 50], [50, 0], [0, 50], giniOfCounts)).toBeCloseTo(0.5, 9)
  })

  it('增益不会为负（子节点加权不纯度不可能超过父节点）', () => {
    const ig = informationGain([60, 40], [35, 25], [25, 15], entropyOfCounts)
    expect(ig).toBeGreaterThanOrEqual(-EPS)
  })
})

describe('互信息', () => {
  it('独立时互信息为 0', () => {
    expect(mutualInformation([[25, 25], [25, 25]])).toBeCloseTo(0, 9)
  })

  it('完全相关时互信息 = H(X) = 1', () => {
    expect(mutualInformation([[50, 0], [0, 50]])).toBeCloseTo(1, 9)
  })

  it('互信息非负且不超过 1（对 2×2 表）', () => {
    const mi = mutualInformation([[40, 10], [20, 30]])
    expect(mi).toBeGreaterThanOrEqual(-EPS)
    expect(mi).toBeLessThanOrEqual(1 + EPS)
  })

  it('I(X;Y) = I(Y;X)（对称）', () => {
    const a = mutualInformation([[40, 10], [20, 30]])
    const b = mutualInformation([[40, 20], [10, 30]]) // 转置
    expect(a).toBeCloseTo(b, 9)
  })
})

describe('KL 散度', () => {
  it('相同分布时为 0', () => {
    expect(klDivergence([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(0, 9)
  })

  it('非负（Gibbs 不等式）', () => {
    expect(klDivergence([0.9, 0.1], [0.5, 0.5])).toBeGreaterThanOrEqual(-EPS)
    expect(klDivergence([0.1, 0.9], [0.3, 0.7])).toBeGreaterThanOrEqual(-EPS)
  })

  it('不对称：KL(P||Q) ≠ KL(Q||P)', () => {
    const pq = klDivergence([0.9, 0.1], [0.5, 0.5])
    const qp = klDivergence([0.5, 0.5], [0.9, 0.1])
    expect(Math.abs(pq - qp)).toBeGreaterThan(0.01)
  })

  it('q 有 0 而 p 对应项为正时返回 Infinity（而非 NaN）', () => {
    // p=[1,0] q=[0.5,0.5]：第一项正常，第二项 pi=0 被跳过 → 有限值
    expect(klDivergence([1, 0], [0.5, 0.5])).toBeCloseTo(1, 9)
    // p=[0.5,0.5] q=[1,0]：第二项 pi>0 但 qi=0 → Infinity
    expect(klDivergence([0.5, 0.5], [1, 0])).toBe(Infinity)
  })

  it('p 有 0 的项被跳过，不影响有限结果', () => {
    // 0·log(0/q) 按约定记为 0，所以结果有限
    expect(Number.isFinite(klDivergence([1, 0], [0.5, 0.5]))).toBe(true)
  })
})

describe('增益率', () => {
  it('分裂信息为 0 时增益率为 0（避免除零）', () => {
    expect(gainRatio(0.5, 0)).toBe(0)
  })

  it('增益率 = 信息增益 / 分裂信息', () => {
    expect(gainRatio(1, 1)).toBeCloseTo(1, 9)
    expect(gainRatio(0.5, 0.5)).toBeCloseTo(1, 9)
    expect(gainRatio(0.4, 0.8)).toBeCloseTo(0.5, 9)
  })

  it('增益率可放大也可压低信息增益（这正是引入它的原因）', () => {
    // 分裂信息小于信息增益时，增益率被放大：
    // 单看 IG 会偏爱「分裂很偏」的候选
    expect(gainRatio(0.6, 0.5)).toBeCloseTo(1.2, 9)
    // 分裂信息大于信息增益时，增益率被压低
    expect(gainRatio(0.3, 0.9)).toBeCloseTo(1 / 3, 9)
    expect(gainRatio(0.3, 0.9)).toBeGreaterThan(0.3)
  })
})

describe('条件熵与联合熵', () => {
  // 注意约定：条件熵是 H(Y|X)，列联表「行 = X，列 = Y」
  // （"知道 X 之后，Y 还剩多少不确定性"）

  it('联合熵 = 全部计数摊平后的熵', () => {
    expect(jointEntropy([[40, 10], [20, 30]])).toBeCloseTo(entropyOfCounts([40, 10, 20, 30]), 9)
  })

  it('H(Y|X) = H(X,Y) − H(X)，H(X) 是行合计的熵', () => {
    const counts = [[40, 10], [20, 30]]
    const hxy = jointEntropy(counts)
    const hx = entropyOfCounts([50, 50]) // 行合计 [50, 50]
    expect(conditionalEntropy(counts)).toBeCloseTo(hxy - hx, 9)
  })

  it('X 与 Y 独立时 H(Y|X) = H(Y)', () => {
    const counts = [[25, 25], [25, 25]]
    // 独立时 H(X,Y) = H(X) + H(Y) → H(Y|X) = H(Y) = 1
    expect(conditionalEntropy(counts)).toBeCloseTo(1, 9)
  })

  it('已知 X 完全确定 Y 时条件熵为 0', () => {
    // 每行只有一个非零元素 → 给定 X 后 Y 唯一确定
    expect(conditionalEntropy([[50, 0], [0, 50]])).toBeCloseTo(0, 9)
  })
})

describe('分裂信息', () => {
  it('单分支时为 0', () => {
    expect(splitInfo([100])).toBeCloseTo(0, 9)
  })

  it('等分二分 = 1', () => {
    expect(splitInfo([50, 50])).toBeCloseTo(1, 9)
  })

  it('三等分 = log2(3)', () => {
    expect(splitInfo([100 / 3, 100 / 3, 100 / 3])).toBeCloseTo(Math.log2(3), 9)
  })

  it('越不均匀分裂信息越小', () => {
    expect(splitInfo([90, 10])).toBeLessThan(splitInfo([50, 50]))
  })
})