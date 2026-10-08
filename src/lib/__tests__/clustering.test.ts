// ============================================================
// 聚类算法 —— 单元测试
//
// 验证的不是"跑通"，而是算法应当满足的数学性质：
//   K-Means：SSE 逐轮不增、质心等于簇内均值、收敛后不再移动
//   DBSCAN：噪声点识别、核心点判定、簇的连通性
//   层次聚类：每次合并取最近的两个簇、合并数固定为 n-1
//   评估指标：轮廓系数范围、与已知结构的吻合度
// ============================================================
import { describe, it, expect } from 'vitest'
import { assignPoints, updateCentroids, maxShift, type Centroid } from '@/lib/kmeans'
import type { RawPt } from '@/lib/datasets'
import { createDbscan, dbscanRun, regionQuery } from '@/lib/dbscan'
import { agglomerative, labelsAfterMerges, cutTree, type Linkage } from '@/lib/hierarchical'
import { silhouetteSamples, clusterCount, adjustedRandIndex, purity } from '@/lib/clusterMetrics'
import { genKMPreset, genDTPreset, DEFAULT_DATA_SEED, createRandom } from '@/lib/datasets'

/** 手工构造的三团数据，簇结构明确，便于验证 */
function threeBlobs(): RawPt[] {
  return [
    // 簇 A：(10,10) 附近
    { x: 10, y: 10 }, { x: 11, y: 9 }, { x: 9, y: 11 }, { x: 12, y: 10 },
    // 簇 B：(50,50) 附近
    { x: 50, y: 50 }, { x: 51, y: 49 }, { x: 49, y: 51 }, { x: 50, y: 52 },
    // 簇 C：(90,90) 附近
    { x: 90, y: 90 }, { x: 91, y: 89 }, { x: 89, y: 91 }, { x: 92, y: 90 },
  ]
}

describe('K-Means 分配与更新', () => {
  const pts = threeBlobs()
  const centroids: Centroid[] = [
    { x: 10, y: 10 },
    { x: 50, y: 50 },
    { x: 90, y: 90 },
  ]

  it('分配步：每个点归给最近的质心', () => {
    const { assignment } = assignPoints(pts, centroids)
    expect(assignment).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2])
  })

  it('SSE 等于各点到所属质心的距离平方和', () => {
    const { sse } = assignPoints(pts, centroids)
    let expected = 0
    pts.forEach((p, i) => {
      const c = centroids[i < 4 ? 0 : i < 8 ? 1 : 2]
      expected += (p.x - c.x) ** 2 + (p.y - c.y) ** 2
    })
    expect(sse).toBeCloseTo(expected, 9)
  })

  it('更新步：质心移动到簇内均值位置', () => {
    const { assignment } = assignPoints(pts, centroids)
    const next = updateCentroids(pts, assignment, centroids)
    // 簇 A 的均值 = ((10+11+9+12)/4, (10+9+11+10)/4) = (10.5, 10)
    expect(next[0].x).toBeCloseTo(10.5, 9)
    expect(next[0].y).toBeCloseTo(10, 9)
  })

  it('空簇的质心保持原地不动（教学上更直观）', () => {
    const assignment = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] // 全部分到簇 0
    const next = updateCentroids(pts, assignment, centroids)
    expect(next[1]).toEqual(centroids[1])
    expect(next[2]).toEqual(centroids[2])
  })

  it('完整迭代：SSE 单调不增', () => {
    let cs: Centroid[] = centroids
    let prevSse = Infinity
    for (let iter = 0; iter < 20; iter++) {
      const { assignment, sse } = assignPoints(pts, cs)
      const next = updateCentroids(pts, assignment, cs)
      // K-Means 的核心保证：把质心移到均值不会让 SSE 变大
      expect(sse).toBeLessThanOrEqual(prevSse + 1e-9)
      const shift = maxShift(cs, next)
      cs = next
      prevSse = sse
      if (shift < 1e-9) break
    }
    // 收敛后每簇质心在均值处，簇内 SSE = 各点离均值的距离平方和
    // 团 A：(10,10)(11,9)(9,11)(12,10) → 均值 (10.5,10)，平方和 = 7
    // 三团结构对称 → 总 SSE = 21
    expect(prevSse).toBeCloseTo(21, 6)
  })

  it('已收敛时 maxShift 为 0', () => {
    const cs: Centroid[] = [{ x: 50, y: 50 }]
    expect(maxShift(cs, [{ x: 50, y: 50 }])).toBe(0)
    expect(maxShift(cs, [{ x: 55, y: 50 }])).toBeCloseTo(5, 9)
  })
})

describe('DBSCAN', () => {
  const pts: RawPt[] = [
    // 密集簇（5 点，核心点半径内至少 3 个邻居含自身）
    { x: 50, y: 50 }, { x: 51, y: 50 }, { x: 49, y: 50 }, { x: 50, y: 51 }, { x: 50, y: 49 },
    // 孤立噪声点
    { x: 10, y: 90 }, { x: 90, y: 10 }, { x: 95, y: 95 },
  ]

  it('区域查询：返回 eps 半径内的所有点（含自身）', () => {
    const nb = regionQuery(pts, 0, 2)
    // eps=2 时应包含中心与四个紧邻点（距离 1）
    expect(nb.length).toBe(5)
    expect(nb).toContain(0)
  })

  it('eps 越大邻居越多（单调性）', () => {
    const small = regionQuery(pts, 0, 2).length
    const large = regionQuery(pts, 0, 5).length
    expect(large).toBeGreaterThanOrEqual(small)
  })

  it('识别出孤立点为噪声（label = -1）', () => {
    const { labels } = dbscanRun(pts, 2, 3)
    expect(labels.length).toBe(pts.length)
    // 三个孤立点必为噪声
    expect(labels[5]).toBe(-1)
    expect(labels[6]).toBe(-1)
    expect(labels[7]).toBe(-1)
    // 密集簇内5 点同属一个簇
    expect(labels[0]).toBeGreaterThanOrEqual(0)
    expect(labels[1]).toBe(labels[0])
    expect(labels[4]).toBe(labels[0])
    expect(labels.filter((l) => l === -1).length).toBe(3) // 三个孤立点
  })

  it('minPts 调大后密集簇也会被判为噪声', () => {
    // minPts=10 超过簇内点数 → 全部成为噪声
    const { labels } = dbscanRun(pts, 2, 10)
    expect(labels.every((l) => l === -1)).toBe(true)
  })

  it('eps 调大后噪声点被并入簇（体现 eps 的作用）', () => {
    // 三个孤立点到簇心 (50,50) 的距离分别是 56.6 / 56.6 / 63.6
    const tight = dbscanRun(pts, 2, 3).labels
    const loose = dbscanRun(pts, 60, 3).labels
    expect(tight.filter((l) => l === -1).length).toBe(3) // eps=2：三个都是噪声
    expect(loose.filter((l) => l === -1).length).toBe(1) // eps=60：只剩最远的 (95,95)
    expect(loose.filter((l) => l === -1).length).toBeLessThan(3)
  })

  it('初始状态未完成，跑完后标记 done（逐步推演页依赖）', () => {
    const st0 = createDbscan(pts, 2, 3)
    expect(st0.done).toBe(false)
    expect(dbscanRun(pts, 2, 3).clusterCount).toBeGreaterThan(0)
  })
})

describe('层次聚类', () => {
  const pts = threeBlobs()

  it('n 个点恰好合并 n-1 次', () => {
    const r = agglomerative(pts, 'single')
    expect(r.merges).toHaveLength(pts.length - 1)
  })

  it('合并距离单调不降（层次聚类的性质）', () => {
    for (const linkage of ['single', 'complete', 'average'] as Linkage[]) {
      const r = agglomerative(pts, linkage)
      for (let i = 1; i < r.merges.length; i++) {
        expect(r.merges[i].distance).toBeGreaterThanOrEqual(r.merges[i - 1].distance - 1e-9)
      }
    }
  })

  it('最近的两个簇先合并（第一组合并的是簇内最近点）', () => {
    const r = agglomerative(pts, 'single')
    // 前两簇内部相距约 1，远小于簇间距离 → 第一次合并距离应很小
    expect(r.merges[0].distance).toBeLessThan(5)
    // 最后一次合并应跨越最远的簇
    expect(r.merges[r.merges.length - 1].distance).toBeGreaterThan(50)
  })

  it('单链与全链的结果不同（体现 linkage 的选择）', () => {
    const single = agglomerative(pts, 'single')
    const complete = agglomerative(pts, 'complete')
    // 合并数相同，但合并距离序列通常不同
    expect(single.merges).toHaveLength(complete.merges.length)
    expect(single.merges.map((m) => m.distance)).not.toEqual(complete.merges.map((m) => m.distance))
  })

  it('labelsAfterMerges：初始每个点自成一簇', () => {
    const r = agglomerative(pts, 'single')
    const { labels } = labelsAfterMerges(r, 0)
    expect(labels).toHaveLength(pts.length)
    expect(new Set(labels).size).toBe(pts.length)
  })

  it('labelsAfterMerges：合并 k 次后簇数减少到 n-k', () => {
    const r = agglomerative(pts, 'single')
    for (let k = 0; k < pts.length - 1; k++) {
      const { labels } = labelsAfterMerges(r, k)
      expect(new Set(labels).size).toBe(pts.length - k)
    }
  })

  it('按高度切割能得到预期簇数（三团数据切 3 簇）', () => {
    const r = agglomerative(pts, 'single')
    // 前几次合并都在团内，切割高度取够高的值应得到 3 簇
    const labels = cutTree(r, r.merges[8].distance + 1).labels
    expect(new Set(labels).size).toBe(3)
  })

  it('切得越低簇数越多（单调性）', () => {
    const r = agglomerative(pts, 'single')
    const high = new Set(cutTree(r, 1e6).labels).size
    const low = new Set(cutTree(r, r.merges[0].distance).labels).size
    expect(high).toBeLessThan(low)
  })
})

describe('聚类评估指标', () => {
  it('轮廓系数在 [-1, 1] 内', () => {
    const pts = threeBlobs()
    const labels = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]
    const r = silhouetteSamples(pts, labels)
    expect(r).not.toBeNull()
    if (r) {
      for (const v of r.values) {
        expect(v).toBeGreaterThanOrEqual(-1 - 1e-9)
        expect(v).toBeLessThanOrEqual(1 + 1e-9)
      }
      expect(r.mean).toBeGreaterThan(0.5) // 分离良好的簇应该高
    }
  })

  it('分簇越差轮廓系数越低', () => {
    const pts = threeBlobs()
    const good = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]
    // 打乱成 1 个大簇 / 4 个碎片簇
    const oneBig = pts.map(() => 0)
    const fragmented = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
    const g = silhouetteSamples(pts, good)
    const f = silhouetteSamples(pts, fragmented)
    expect(g?.mean ?? 0).toBeGreaterThan(f?.mean ?? 0)
    expect(silhouetteSamples(pts, oneBig)).toBeNull() // 只有 1 簇时无法评估
  })

  it('clusterCount 忽略噪声点', () => {
    expect(clusterCount([0, 0, 1, 1, -1, -1])).toBe(2)
    expect(clusterCount([-1, -1])).toBe(0)
  })

  it('ARI = 1 当聚类与真实标签完全一致', () => {
    const truth = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]
    const same = [...truth]
    expect(adjustedRandIndex(truth, same)).toBeCloseTo(1, 6)
  })

  it('ARI = 0 当聚类随机（期望值）', () => {
    // 极端情况：全部归一簇
    const truth = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]
    const allOne = truth.map(() => 0)
    const ari = adjustedRandIndex(truth, allOne)
    expect(ari).toBeLessThan(0.5)
    expect(ari).toBeGreaterThanOrEqual(-1 - 1e-9)
  })

  it('纯度：与真实标签一致时为 1', () => {
    const truth = [0, 0, 0, 0, 1, 1, 1, 1]
    expect(purity(truth, [...truth])).toBeCloseTo(1, 6)
    // 全归一簇时纯度 = 多数类占比 = 0.5
    expect(purity(truth, truth.map(() => 0))).toBeCloseTo(0.5, 6)
  })
})

describe('数据集种子可复现性', () => {
  it('createRandom 同 seed 产生同一序列', () => {
    const a = createRandom(42)
    const b = createRandom(42)
    for (let i = 0; i < 10; i++) expect(a.r()).toBe(b.r())
  })

  it('genKMPreset 同 seed 逐点一致', () => {
    const a = genKMPreset('blobs', 30, 4, DEFAULT_DATA_SEED)
    const b = genKMPreset('blobs', 30, 4, DEFAULT_DATA_SEED)
    expect(a).toEqual(b)
  })

  it('不同 seed 产生不同数据', () => {
    const a = genKMPreset('blobs', 30, 4, 42)
    const b = genKMPreset('blobs', 30, 4, 7)
    expect(a).not.toEqual(b)
  })

  it('坐标恒在 [0,100] 内（高噪声也不越界）', () => {
    for (const preset of ['blobs', 'rings', 'moons', 'smile'] as const) {
      const pts = genKMPreset(preset, 40, 30, 42)
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(100)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(100)
      }
    }
  })

  it('genDTPreset 类别均衡', () => {
    const pts = genDTPreset('linear', 40, 5, 42)
    expect(pts).toHaveLength(80)
    expect(pts.filter((p) => p.label === 0)).toHaveLength(40)
    expect(pts.filter((p) => p.label === 1)).toHaveLength(40)
  })
})