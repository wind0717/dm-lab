// ============================================================
// 数据集生成 —— 纯函数库
// 所有坐标统一落在 [0,100] × [0,100] 的画布坐标系中
//
// 【可复现性约定】所有数据集生成函数都接受 seed 参数（默认 DEFAULT_DATA_SEED），
//   相同 seed + 相同参数 → 逐点完全一致的数据。
//   这样学生 A 与学生 B 打开同一个实验看到的是同一份数据，
//   老师课堂演示的结论学生课后能原样复现，实验结果可写进报告。
//   随机源统一用 classifiers.ts 的 mulberry32（与算法层一致）。
// ============================================================

import { mulberry32 } from './classifiers'

/** 默认数据集种子。教学场景统一用它，保证全班数据一致 */
export const DEFAULT_DATA_SEED = 42

// ------------------------------------------------------------
// 基础类型
// ------------------------------------------------------------

/** 二维样本点（决策树用，带类别标签） */
export interface Pt {
  x: number
  y: number
  label: number // 0 = A 类（橙），1 = B 类（蓝）
}

/** 无标签点（K-Means 用） */
export interface RawPt {
  x: number
  y: number
}

/** 把数值夹到 [lo, hi] 区间 */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// ------------------------------------------------------------
// 随机数工厂：把 seed 封装成一个确定性的随机器集合
// ------------------------------------------------------------

/** 带种子的随机器：r() 均匀分布，rn() 标准正态，shuffle() 原地 Fisher-Yates */
export interface SeededRandom {
  /** [0,1) 均匀分布 */
  r: () => number
  /** 标准正态分布（Box-Muller） */
  rn: () => number
  /** Fisher-Yates 原地洗牌 */
  shuffle: <T>(arr: T[]) => T[]
}

/** 按 seed 创建确定性随机器。同 seed 必然产生同一序列 */
export function createRandom(seed: number = DEFAULT_DATA_SEED): SeededRandom {
  const r = mulberry32(seed)
  // Box-Muller：缓存第二个值，避免连续调用浪费均匀数
  let spare: number | null = null
  const rn = () => {
    if (spare !== null) {
      const v = spare
      spare = null
      return v
    }
    let u = r()
    while (u === 0) u = r()
    const v = r()
    const mag = Math.sqrt(-2 * Math.log(u))
    spare = mag * Math.sin(2 * Math.PI * v)
    return mag * Math.cos(2 * Math.PI * v)
  }
  const shuffle = <T,>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
  return { r, rn, shuffle }
}

// ------------------------------------------------------------
// 模块一：一维二分类数据（两个高斯混合）
// ------------------------------------------------------------
export interface Pt1D {
  x: number
  label: number // 0 = A，1 = B
}

/**
 * 生成约 n 个一维点：A 类 ~ N(32, 12²)，B 类 ~ N(68, 12²)
 * @param n    点数
 * @param seed 随机种子，默认 DEFAULT_DATA_SEED
 */
export function gen1DTwoClass(n = 30, seed: number = DEFAULT_DATA_SEED): Pt1D[] {
  const rnd = createRandom(seed)
  const pts: Pt1D[] = []
  for (let i = 0; i < n; i++) {
    const label = i % 2 === 0 ? 0 : 1
    const mean = label === 0 ? 32 : 68
    pts.push({ x: clamp(mean + rnd.rn() * 12, 2, 98), label })
  }
  // 打乱顺序，避免类别交替出现得太规律
  rnd.shuffle(pts)
  return pts
}

// ------------------------------------------------------------
// 模块二：决策树预设数据集
// ------------------------------------------------------------
export type DTPreset = 'linear' | 'circles' | 'moons' | 'xor'

export const DT_PRESET_NAMES: Record<DTPreset, string> = {
  linear: '线性可分',
  circles: '同心圆',
  moons: '月牙',
  xor: '异或 XOR',
}

/**
 * 生成决策树实验数据
 * @param perClass 每类样本数
 * @param noise    噪声强度 0~30（叠加到坐标上的高斯抖动标准差）
 * @param seed     随机种子，默认 DEFAULT_DATA_SEED
 */
export function genDTPreset(
  preset: DTPreset,
  perClass: number,
  noise: number,
  seed: number = DEFAULT_DATA_SEED,
): Pt[] {
  const rnd = createRandom(seed)
  const pts: Pt[] = []
  const jitter = () => rnd.rn() * noise * 0.6
  const gauss = (mean: number, sd: number) => mean + rnd.rn() * sd

  if (preset === 'linear') {
    // 两个分离的高斯团：A 在左下，B 在右上
    for (let i = 0; i < perClass; i++) {
      pts.push({ x: clamp(gauss(32, 11) + jitter(), 0, 100), y: clamp(gauss(32, 11) + jitter(), 0, 100), label: 0 })
      pts.push({ x: clamp(gauss(68, 11) + jitter(), 0, 100), y: clamp(gauss(68, 11) + jitter(), 0, 100), label: 1 })
    }
  } else if (preset === 'circles') {
    // A 在中心圆盘，B 在外圈圆环 —— 考验树用很多刀逼近圆形边界
    for (let i = 0; i < perClass; i++) {
      const r = Math.sqrt(rnd.r()) * 20
      const a = rnd.r() * 2 * Math.PI
      pts.push({ x: clamp(50 + r * Math.cos(a) + jitter(), 0, 100), y: clamp(50 + r * Math.sin(a) + jitter(), 0, 100), label: 0 })
      const r2 = 32 + rnd.r() * 12
      const a2 = rnd.r() * 2 * Math.PI
      pts.push({ x: clamp(50 + r2 * Math.cos(a2) + jitter(), 0, 100), y: clamp(50 + r2 * Math.sin(a2) + jitter(), 0, 100), label: 1 })
    }
  } else if (preset === 'moons') {
    // 经典双月牙：上下两条交错的半圆弧
    for (let i = 0; i < perClass; i++) {
      const a = rnd.r() * Math.PI // 0~π
      // 上月牙（A 类）
      pts.push({
        x: clamp(50 + 32 * Math.cos(a) + jitter(), 0, 100),
        y: clamp(38 + 26 * Math.sin(a) + jitter(), 0, 100),
        label: 0,
      })
      // 下月牙（B 类），翻转并错位
      const a2 = rnd.r() * Math.PI
      pts.push({
        x: clamp(50 + 32 * (1 - Math.cos(a2)) - 32 + jitter(), 0, 100),
        y: clamp(62 - 26 * Math.sin(a2) + jitter(), 0, 100),
        label: 1,
      })
    }
  } else {
    // xor：四个对角团簇，A 在左上+右下，B 在右上+左下
    const centers: Array<[number, number, number]> = [
      [30, 70, 0],
      [70, 30, 0],
      [70, 70, 1],
      [30, 30, 1],
    ]
    const perCluster = Math.ceil(perClass / 2)
    for (const [cx, cy, label] of centers) {
      for (let i = 0; i < perCluster; i++) {
        pts.push({ x: clamp(gauss(cx, 8) + jitter(), 0, 100), y: clamp(gauss(cy, 8) + jitter(), 0, 100), label })
      }
    }
  }
  return pts
}

// ------------------------------------------------------------
// 模块三：K-Means 预设数据集（无监督，不携带标签）
// ------------------------------------------------------------
export type KMPreset = 'blobs' | 'rings' | 'moons' | 'smile'

export const KM_PRESET_NAMES: Record<KMPreset, string> = {
  blobs: '三个团簇',
  rings: '同心圆环',
  moons: '月牙双弧',
  smile: '笑脸',
}

/**
 * 生成 K-Means 实验数据
 * @param perGroup 每个团簇/结构大约的点数
 * @param noise    噪声强度 0~30
 * @param seed     随机种子，默认 DEFAULT_DATA_SEED
 */
export function genKMPreset(
  preset: KMPreset,
  perGroup: number,
  noise: number,
  seed: number = DEFAULT_DATA_SEED,
): RawPt[] {
  const rnd = createRandom(seed)
  const pts: RawPt[] = []
  const jitter = () => rnd.rn() * noise * 0.5
  const gauss = (mean: number, sd: number) => mean + rnd.rn() * sd

  if (preset === 'blobs') {
    // 三个球形团簇 —— K-Means 的主场
    const centers: Array<[number, number]> = [
      [28, 30],
      [72, 32],
      [50, 72],
    ]
    for (const [cx, cy] of centers) {
      for (let i = 0; i < perGroup; i++) {
        pts.push({ x: clamp(gauss(cx, 7) + jitter(), 0, 100), y: clamp(gauss(cy, 7) + jitter(), 0, 100) })
      }
    }
  } else if (preset === 'rings') {
    // 中心一团 + 外圈一环 —— 非球状结构，K-Means 会切错
    for (let i = 0; i < perGroup; i++) {
      pts.push({ x: clamp(gauss(50, 8) + jitter(), 0, 100), y: clamp(gauss(50, 8) + jitter(), 0, 100) })
    }
    const ringN = perGroup * 2
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * 2 * Math.PI + rnd.r() * 0.1
      const r = 32 + rnd.rn() * 2.5
      pts.push({ x: clamp(50 + r * Math.cos(a) + jitter(), 0, 100), y: clamp(50 + r * Math.sin(a) + jitter(), 0, 100) })
    }
  } else if (preset === 'moons') {
    // 两条弯月弧 —— 细长弯曲的簇，K-Means 容易从中间劈开
    for (let i = 0; i < perGroup; i++) {
      const a = rnd.r() * Math.PI
      pts.push({ x: clamp(50 + 32 * Math.cos(a) + jitter(), 0, 100), y: clamp(40 + 26 * Math.sin(a) + jitter(), 0, 100) })
      const a2 = rnd.r() * Math.PI
      pts.push({ x: clamp(50 + 32 * (1 - Math.cos(a2)) - 32 + jitter(), 0, 100), y: clamp(60 - 26 * Math.sin(a2) + jitter(), 0, 100) })
    }
  } else {
    // 笑脸：脸轮廓（圆环）+ 两只眼睛 + 嘴巴弧线
    const faceN = Math.max(8, Math.floor(perGroup * 0.55))
    for (let i = 0; i < faceN; i++) {
      const a = (i / faceN) * 2 * Math.PI
      pts.push({ x: clamp(50 + 34 * Math.cos(a) + rnd.rn() * 1.5 + jitter(), 0, 100), y: clamp(50 + 34 * Math.sin(a) + rnd.rn() * 1.5 + jitter(), 0, 100) })
    }
    const eyeN = Math.max(4, Math.floor(perGroup * 0.12))
    for (const ex of [36, 64]) {
      for (let i = 0; i < eyeN; i++) {
        pts.push({ x: clamp(gauss(ex, 2.2) + jitter(), 0, 100), y: clamp(gauss(38, 2.2) + jitter(), 0, 100) })
      }
    }
    const mouthN = Math.max(6, Math.floor(perGroup * 0.2))
    for (let i = 0; i < mouthN; i++) {
      const a = Math.PI * (0.15 + 0.7 * (i / mouthN))
      pts.push({ x: clamp(50 + 20 * Math.cos(a) + rnd.rn() * 1.5 + jitter(), 0, 100), y: clamp(52 + 16 * Math.sin(a) + rnd.rn() * 1.5 + jitter(), 0, 100) })
    }
  }
  return pts
}

// ------------------------------------------------------------
// 分类工作台：内置业务案例数据集（多特征二分类，带噪声）
// ------------------------------------------------------------
export interface CaseDataset {
  id: string
  name: string
  desc: string
  featureNames: string[]
  classNames: [string, string]
  X: number[][]
  y: number[]
}

export const CASE_IDS = ['churn', 'credit', 'quality'] as const
export type CaseId = (typeof CASE_IDS)[number]

export const CASE_META: Record<CaseId, { name: string; desc: string }> = {
  churn: {
    name: '客户流失预测',
    desc: '特征：月均活跃天数、月均消费金额、近半年投诉次数。活跃低 + 投诉多的客户更容易流失。',
  },
  credit: {
    name: '信贷违约预测',
    desc: '特征：年收入（万元）、负债率（%）、历史逾期次数。负债率高 + 逾期多 → 违约风险大。',
  },
  quality: {
    name: '商品质检判定',
    desc: '特征：尺寸偏差（mm）、表面瑕疵点数。偏差或瑕疵超标判为不合格，边界附近有测量噪声。',
  },
}

/**
 * 生成内置案例数据集（约 300 行）
 * 每个案例有独立固定种子，天然可复现；seed 参数仅供需要变体时使用。
 */
export function genCaseDataset(id: CaseId, seed?: number): CaseDataset {
  // 案例默认种子由 id 决定，保证同一案例永远是同一份数据
  const baseSeed = seed ?? (id === 'churn' ? 2024 : id === 'credit' ? 2025 : 2026)
  const rnd = createRandom(baseSeed)
  const gauss = (mean: number, sd: number) => mean + rnd.rn() * sd

  const X: number[][] = []
  const y: number[] = []
  const N = 300
  let featureNames: string[] = []
  let classNames: [string, string] = ['', '']

  if (id === 'churn') {
    featureNames = ['月均活跃天数', '月均消费金额', '近半年投诉次数']
    classNames = ['未流失', '流失']
    for (let i = 0; i < N; i++) {
      const churn = i % 2
      // 流失：活跃低、消费低、投诉多
      const active = Math.max(0, gauss(churn ? 7 : 19, 5))
      const spend = Math.max(5, gauss(churn ? 45 : 110, 35))
      const complaints = Math.max(0, Math.round(gauss(churn ? 4 : 1.2, 1.6)))
      X.push([+active.toFixed(1), +spend.toFixed(1), complaints])
      y.push(churn)
    }
  } else if (id === 'credit') {
    featureNames = ['年收入(万元)', '负债率(%)', '历史逾期次数']
    classNames = ['未违约', '违约']
    for (let i = 0; i < N; i++) {
      const bad = i % 2
      const income = Math.max(2, gauss(bad ? 9 : 22, 6))
      const debt = Math.min(98, Math.max(2, gauss(bad ? 72 : 32, 15)))
      const overdue = Math.max(0, Math.round(gauss(bad ? 3.5 : 0.4, 1.4)))
      X.push([+income.toFixed(1), +debt.toFixed(1), overdue])
      y.push(bad)
    }
  } else {
    featureNames = ['尺寸偏差(mm)', '表面瑕疵点数']
    classNames = ['合格', '不合格']
    for (let i = 0; i < N; i++) {
      const ng = i % 2
      // 不合格：偏差大或瑕疵多（两条路径，边界非线性）
      const dev = Math.max(0, gauss(ng ? 2.6 : 0.9, ng ? 1.1 : 0.45))
      const flaw = Math.max(0, Math.round(gauss(ng ? 5 : 1.4, ng ? 2.6 : 1.1)))
      X.push([+dev.toFixed(2), flaw])
      y.push(ng)
    }
  }

  // 打乱行序
  const order = X.map((_, i) => i)
  rnd.shuffle(order)
  return {
    id,
    name: CASE_META[id].name,
    desc: CASE_META[id].desc,
    featureNames,
    classNames,
    X: order.map((i) => X[i]),
    y: order.map((i) => y[i]),
  }
}
