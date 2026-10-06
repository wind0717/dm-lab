// ============================================================
// 聚类推演自测（第七批：DBSCAN / 层次聚类 步进数据结构完整性）
// 运行方式（项目根目录）：node scripts/selftest7.mjs
// 本轮算法库（dbscan.ts / hierarchical.ts）无改动，重点断言三个推演页依赖的
// 步进数据结构完整性：
//   1. DBSCAN：步进器必终止、终止时所有点都已访问且有确定标签、
//      clusterCount 与标签集合一致、dbscanRun 与逐步执行结果一致、典型数据集上分簇正确
//   2. 层次聚类：合并序列长度 = n-1、合并距离单调不降、labelsAfterMerges / cutTree /
//      cutTreeK / dendrogramLayout 结构完整、三种 linkage 均完整
// ============================================================
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'scripts', '.out7')
fs.mkdirSync(outDir, { recursive: true })

execSync(
  `node_modules/.bin/esbuild src/lib/dbscan.ts src/lib/hierarchical.ts src/lib/datasets.ts --bundle --format=esm --outdir=${outDir} --out-extension:.js=.mjs --log-level=error`,
  { cwd: root, stdio: 'inherit' },
)

const db = await import(path.join(outDir, 'dbscan.mjs'))
const hc = await import(path.join(outDir, 'hierarchical.mjs'))
const ds = await import(path.join(outDir, 'datasets.mjs'))

// 固定随机流，保证自测可复现
{
  let s = 20261007
  Math.random = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ' —— ' + detail : ''}`)
  } else {
    fail++
    console.error(`  ❌ ${name}${detail ? ' —— ' + detail : ''}`)
  }
}

// ---------- 1. DBSCAN 步进器 ----------
console.log('\n【DBSCAN 步进器 · 数据结构完整性】')
{
  const pts = ds.genKMPreset('blobs', 30, 4) // 90 个点、3 个团簇

  // 1) 逐步执行必终止，且终止时所有点已访问
  let st = db.createDbscan(pts, 7, 4)
  let guard = pts.length * 5 + 200
  let steps = 0
  while (!st.done && guard-- > 0) {
    st = db.dbscanStep(st)
    steps++
  }
  check('步进器在有限步内终止（done = true）', st.done, `共 ${steps} 步`)
  check('终止时所有点都已访问', st.visited.every(Boolean), `${st.visited.filter(Boolean).length}/${pts.length}`)
  check('终止时队列已清空', st.queue.length === 0)
  check('stepCount 与实际步数一致', st.stepCount === steps, `${st.stepCount} vs ${steps}`)

  // 2) 终止时每个点都有确定标签：要么属于某个簇（0..clusterCount-1），要么是噪声（-1）
  const labelOk = st.labels.every((l) => l === -1 || (l >= 0 && l < st.clusterCount))
  check('所有点标签合法（-1 噪声 或 0..簇数-1）', labelOk)
  const distinct = new Set(st.labels.filter((l) => l >= 0))
  check('clusterCount 与标签集合一致', distinct.size === st.clusterCount, `${distinct.size} vs ${st.clusterCount}`)
  check('核心点必有簇归属', st.isCore.every((c, i) => !c || st.labels[i] >= 0))

  // 3) 三个团簇上应分出 3 簇
  check('「三个团簇」分出 3 个簇', st.clusterCount === 3, `clusterCount = ${st.clusterCount}`)

  // 4) dbscanRun（一口气跑完）与逐步执行结果一致
  const run = db.dbscanRun(pts, 7, 4)
  check(
    'dbscanRun 与逐步执行结果一致',
    run.clusterCount === st.clusterCount && run.labels.every((l, i) => l === st.labels[i]) && run.isCore.every((c, i) => c === st.isCore[i]),
  )

  // 5) 同心圆环：K-Means 的死角，DBSCAN 应分出 2 簇（每组 60 点保证环密度足够；重置种子避免受前面消耗影响）
  {
    let s = 20261007
    Math.random = () => {
      s = (s * 1103515245 + 12345) % 2147483648
      return s / 2147483648
    }
  }
  const rings = ds.genKMPreset('rings', 60, 2)
  const r2 = db.dbscanRun(rings, 7, 4)
  check('「同心圆环」分出 2 个簇', r2.clusterCount === 2, `clusterCount = ${r2.clusterCount}`)

  // 6) ε 极小 → 没有簇，全是噪声（参数语义无回归）
  const r3 = db.dbscanRun(pts, 0.5, 4)
  check('ε=0.5 时全部点为噪声、0 簇', r3.clusterCount === 0 && r3.labels.every((l) => l === -1))

  // 7) 中间态单调性：每一步 stepCount 恰好 +1（推演页按步回放的依赖）
  let s2 = db.createDbscan(pts, 7, 4)
  let mono = true
  for (let i = 0; i < 10 && !s2.done; i++) {
    const next = db.dbscanStep(s2)
    if (next.stepCount !== s2.stepCount + 1) mono = false
    s2 = next
  }
  check('每步 stepCount 恰好 +1（步进序列可回放）', mono)
}

// ---------- 2. 层次聚类 ----------
console.log('\n【层次聚类 · 合并序列完整性】')
{
  const pts = ds.genKMPreset('blobs', 25, 4) // 75 个点
  const n = pts.length

  for (const linkage of ['single', 'complete', 'average']) {
    const res = hc.agglomerative(pts, linkage)
    check(`[${linkage}] 合并序列长度 = n-1`, res.merges.length === n - 1, `${res.merges.length} vs ${n - 1}`)
    check(`[${linkage}] membersOf 长度 = 2n-1`, res.membersOf.length === 2 * n - 1)
    check(
      `[${linkage}] 合并节点编号连续（n+i）且成员数正确`,
      res.merges.every((m, i) => m.id === n + i && m.size === res.membersOf[m.a].length + res.membersOf[m.b].length),
    )
    check(
      `[${linkage}] 合并距离单调不降`,
      res.merges.every((m, i) => i === 0 || m.distance >= res.merges[i - 1].distance - 1e-9),
    )
    check(`[${linkage}] maxDist = 最后一次合并距离`, Math.abs(res.maxDist - res.merges[res.merges.length - 1].distance) < 1e-9)
  }

  const res = hc.agglomerative(pts, 'average')

  // labelsAfterMerges：0 次合并 = n 个单点簇；全部合并 = 1 簇
  const l0 = hc.labelsAfterMerges(res, 0)
  const lAll = hc.labelsAfterMerges(res, res.merges.length)
  check('0 次合并 → n 个单点簇', l0.sizes.length === n && l0.sizes.every((s) => s === 1))
  check('全部合并 → 1 个簇', lAll.sizes.length === 1 && lAll.sizes[0] === n)
  check('labels 长度恒为 n 且下标合法', l0.labels.length === n && lAll.labels.every((l) => l === 0))

  // 中间步：剩余簇数 = n - s
  const lMid = hc.labelsAfterMerges(res, 20)
  check('合并 s 次后剩余簇数 = n - s', lMid.sizes.length === n - 20, `${lMid.sizes.length} vs ${n - 20}`)

  // cutTree / cutTreeK
  check('cutTree(最大高度) → 1 簇', hc.cutTree(res, res.maxDist).k === 1)
  const k3 = hc.cutTreeK(res, 3)
  check('cutTreeK(3) → 恰好 3 簇', k3.sizes.length === 3, `${k3.sizes.length} 簇`)
  check('cutTreeK(3) 各簇大小之和 = n', k3.sizes.reduce((a, b) => a + b, 0) === n)

  // 切一刀的高度介于两次合并之间 → 簇数符合预期（推演页 heightForK 的依赖性质）
  const s = n - 3
  const hMid = (res.merges[s - 1].distance + res.merges[s].distance) / 2
  check('在两合并距离中点切一刀 → 恰好 3 簇', hc.cutTree(res, hMid).k === 3)

  // 树状图布局：叶子 x 是 0..n-1 的一个排列（不重叠、不缺失）
  const layout = hc.dendrogramLayout(res)
  const leafXs = layout.xs.slice(0, n).slice().sort((a, b) => a - b)
  check('树状图叶子 x 为 0..n-1 的排列', leafXs.every((v, i) => v === i))
  check(
    '树状图内部节点 y = 对应合并距离',
    res.merges.every((m) => Math.abs(layout.ys[m.id] - m.distance) < 1e-9),
  )

  // 业务正确性：三个团簇 + 平均距离切 3 簇，应完美还原三个团（对照生成中心）
  const centers = [
    [28, 30],
    [72, 32],
    [50, 72],
  ]
  const trueBlob = pts.map((p) => {
    let best = 0
    let bd = Infinity
    centers.forEach(([cx, cy], ci) => {
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2
      if (d < bd) {
        bd = d
        best = ci
      }
    })
    return best
  })
  // 业务正确性：三个团簇 + 平均距离切 3 簇，每个簇应由单一真实团主导（≥90%，容忍个别游走点）
  const purityOk = [0, 1, 2].every((c) => {
    const blobs = trueBlob.filter((_, i) => k3.labels[i] === c)
    if (blobs.length === 0) return false
    const cnt = [0, 0, 0]
    blobs.forEach((b) => cnt[b]++)
    return Math.max(...cnt) / blobs.length >= 0.9
  })
  check('三个团簇切 3 簇基本还原真实结构（簇内主导团 ≥90%）', purityOk)
}

console.log(`\n========================================`)
console.log(`自测结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
