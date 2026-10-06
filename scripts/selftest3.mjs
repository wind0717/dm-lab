// ============================================================
// 聚类 / 关联分析 自测（第三批）
// 运行方式（项目根目录）：node scripts/selftest3.mjs
// 先用 esbuild 把 TS 库打包成 ESM 再导入断言。
// 验证点：
//   1. DBSCAN 在同心圆环上分出 2 簇且与真相高度一致（ARI>0.85），K-Means 失败（ARI<0.6）
//   2. 层次聚类（平均距离）在 3 团簇上切 3 刀，轮廓系数 > 0.5
//   3. Apriori 在校园购物篮里挖出注入的强规则 {尿布,啤酒}：频繁且 lift > 1.5
//   4. 轮廓系数：好聚类 > 0.6，随机标签 ≈ 0
//   5. 辅助断言：ARI 完全一致 = 1；CH 好聚类远大于随机；DB 好聚类小于随机
// ============================================================
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'scripts', '.out3')
fs.mkdirSync(outDir, { recursive: true })

execSync(
  `node_modules/.bin/esbuild src/lib/dbscan.ts src/lib/hierarchical.ts src/lib/clusterMetrics.ts src/lib/apriori.ts src/lib/kmeans.ts src/lib/datasets.ts --bundle --format=esm --outdir=${outDir} --out-extension:.js=.mjs --log-level=error`,
  { cwd: root, stdio: 'inherit' },
)

const dbscan = await import(path.join(outDir, 'dbscan.mjs'))
const hier = await import(path.join(outDir, 'hierarchical.mjs'))
const cm = await import(path.join(outDir, 'clusterMetrics.mjs'))
const apr = await import(path.join(outDir, 'apriori.mjs'))
const km = await import(path.join(outDir, 'kmeans.mjs'))
const ds = await import(path.join(outDir, 'datasets.mjs'))

// 固定随机流，保证自测可复现（datasets 的生成器用全局 Math.random）
{
  let s = 7919
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

// ---------- 1. DBSCAN vs K-Means 在同心圆环上 ----------
// genKMPreset('rings')：前 perGroup 个点是中心团，之后 2*perGroup 个点是圆环 → 可直接构造真实标签
console.log('\n【DBSCAN vs K-Means · 同心圆环】')
{
  const perGroup = 70
  const pts = ds.genKMPreset('rings', perGroup, 0)
  const truth = pts.map((_, i) => (i < perGroup ? 0 : 1))

  const d = dbscan.dbscanRun(pts, 6.5, 5)
  const dNoNoise = { idx: pts.map((_, i) => i).filter((i) => d.labels[i] >= 0) }
  const ariD = cm.adjustedRandIndex(dNoNoise.idx.map((i) => truth[i]), dNoNoise.idx.map((i) => d.labels[i]))
  const noiseN = d.labels.filter((l) => l < 0).length
  check('DBSCAN 分出 2 簇', d.clusterCount === 2, `簇数=${d.clusterCount}，噪声=${noiseN}`)
  check('DBSCAN 与真相一致（ARI>0.85）', ariD !== null && ariD > 0.85, `ARI=${ariD?.toFixed(3)}`)

  // K-Means K=2 跑 5 次取最好（按 SSE），仍然切错
  let bestAri = -2
  let bestSse = Infinity
  let bestAssign = null
  for (let r = 0; r < 5; r++) {
    let cent = km.randomCentroids(pts, 2)
    let a = null
    for (let it = 0; it < 40; it++) {
      const { assignment } = km.assignPoints(pts, cent)
      const next = km.updateCentroids(pts, assignment, cent)
      if (km.maxShift(cent, next) < 1e-4) {
        cent = next
        a = km.assignPoints(pts, next).assignment
        break
      }
      cent = next
      a = assignment
    }
    const { sse } = km.assignPoints(pts, cent)
    if (sse < bestSse) {
      bestSse = sse
      bestAssign = a
    }
  }
  bestAri = cm.adjustedRandIndex(truth, bestAssign)
  check('K-Means(K=2) 在圆环上失败（ARI<0.6）', bestAri !== null && bestAri < 0.6, `ARI=${bestAri?.toFixed(3)}（最好的 5 次重启）`)
}

// ---------- 2. 层次聚类在 3 团簇上 ----------
console.log('\n【层次聚类 · 三个团簇】')
{
  const pts = ds.genKMPreset('blobs', 40, 3)
  const truth = pts.map((_, i) => Math.floor(i / 40)) // 生成器按簇顺序写入
  const res = hier.agglomerative(pts, 'average')
  check('合并次数 = n-1', res.merges.length === pts.length - 1, `${res.merges.length} 次`)
  const { labels, k } = (() => {
    const c = hier.cutTreeK(res, 3)
    return { labels: c.labels, k: new Set(c.labels).size }
  })()
  check('切 3 刀得到 3 簇', k === 3)
  const sil = cm.silhouetteSamples(pts, labels)
  check('切 3 刀轮廓系数 > 0.5', sil !== null && sil.mean > 0.5, `s̄=${sil?.mean.toFixed(3)}`)
  const ari = cm.adjustedRandIndex(truth, labels)
  check('层次聚类与真相一致（ARI>0.9）', ari !== null && ari > 0.9, `ARI=${ari?.toFixed(3)}`)

  // 树状图布局：叶子 x 不重复且覆盖 0..n-1
  const layout = hier.dendrogramLayout(res)
  const leafXs = layout.xs.slice(0, pts.length).slice().sort((a, b) => a - b)
  check('树状图叶子布局为 0..n-1 排列', leafXs.every((v, i) => v === i))
}

// ---------- 3. Apriori 校园购物篮 ----------
console.log('\n【Apriori · 校园超市购物篮】')
{
  const tx = apr.genCampusBasket(200, 42)
  const res = apr.apriori(tx, 0.15)
  const pair = res.frequentItemsets.find((f) => f.items.join('|') === '啤酒|尿布')
  check('{尿布,啤酒} 是频繁项集', pair !== undefined, pair ? `support=${pair.support.toFixed(3)}` : '未找到')
  const rules = apr.genRules(res, 0.5)
  const rule = rules.find((r) => r.antecedent.join('|') === '尿布' && r.consequent.join('|') === '啤酒')
  check('规则 尿布→啤酒 存在且 lift>1.5', rule !== undefined && rule.lift > 1.5, rule ? `conf=${rule.confidence.toFixed(2)}, lift=${rule.lift.toFixed(2)}` : '未找到')
  check('规则表非空', rules.length > 0, `${rules.length} 条规则`)

  // Apriori 性质验证：任意非频繁项集的超集都非频繁
  const allItems = ['牛奶', '面包', '啤酒', '尿布']
  const lattice = apr.buildLattice(allItems, tx, 0.15)
  let propertyOk = true
  for (const node of lattice) {
    if (!node.frequent) {
      for (const key of apr.supersetKeys(node, allItems)) {
        const sup = lattice.find((x) => x.key === key)
        if (sup && sup.frequent) propertyOk = false
      }
    }
  }
  check('Apriori 性质：非频繁项集的超集皆非频繁（4 商品格全量验证）', propertyOk)

  // CSV 解析往返
  const csv = apr.sampleBasketCsv()
  const parsed = apr.parseBasketCsv(csv)
  check('购物篮 CSV 解析往返成功', parsed.length === 25 && parsed[0].items.length >= 2, `${parsed.length} 笔`)
}

// ---------- 4. 轮廓系数特性 ----------
console.log('\n【轮廓系数特性】')
{
  const pts = ds.genKMPreset('blobs', 40, 3)
  const truth = pts.map((_, i) => Math.floor(i / 40))
  const good = cm.silhouetteSamples(pts, truth)
  check('好聚类（真实结构）轮廓系数 > 0.6', good !== null && good.mean > 0.6, `s̄=${good?.mean.toFixed(3)}`)

  // 随机标签 ≈ 0
  let s = 999
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
  const randLabels = pts.map(() => Math.floor(rand() * 3))
  const bad = cm.silhouetteSamples(pts, randLabels)
  check('随机标签轮廓系数 ≈ 0（|s̄|<0.15）', bad !== null && Math.abs(bad.mean) < 0.15, `s̄=${bad?.mean.toFixed(3)}`)

  // 单簇返回 null
  check('只有 1 个簇时无法计算（返回 null）', cm.silhouetteSamples(pts, pts.map(() => 0)) === null)
}

// ---------- 5. 指标辅助断言 ----------
console.log('\n【指标辅助断言】')
{
  const pts = ds.genKMPreset('blobs', 40, 3)
  const truth = pts.map((_, i) => Math.floor(i / 40))
  let s = 7
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
  const randLabels = pts.map(() => Math.floor(rand() * 3))

  check('ARI 完全一致 = 1', Math.abs((cm.adjustedRandIndex(truth, truth) ?? 0) - 1) < 1e-9)
  const ariRand = cm.adjustedRandIndex(truth, randLabels)
  check('ARI 随机标签 ≈ 0（|ARI|<0.15）', ariRand !== null && Math.abs(ariRand) < 0.15, `ARI=${ariRand?.toFixed(3)}`)

  const chGood = cm.calinskiHarabasz(pts, truth)
  const chRand = cm.calinskiHarabasz(pts, randLabels)
  check('CH：好聚类远大于随机', chGood !== null && chRand !== null && chGood > chRand * 3, `CH ${chRand?.toFixed(1)} → ${chGood?.toFixed(1)}`)

  const dbGood = cm.daviesBouldin(pts, truth)
  const dbRand = cm.daviesBouldin(pts, randLabels)
  check('DB：好聚类小于随机', dbGood !== null && dbRand !== null && dbGood < dbRand, `DB ${dbGood?.toFixed(2)} < ${dbRand?.toFixed(2)}`)

  const purityPerfect = cm.purity(truth, truth)
  check('纯度：完全一致 = 1', Math.abs((purityPerfect ?? 0) - 1) < 1e-9)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
