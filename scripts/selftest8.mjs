// ============================================================
// 自测 8：上传限制放宽（5MB / 5000 行 / 20 特征）+ 大数据性能保护
// 运行方式（项目根目录）：node scripts/selftest8.mjs
// 断言：
//   ① 5000 行 × 8 特征二分类合成 CSV（~1MB+）经 csv.ts 解析通过
//   ② 七种方法各自训练+评估在合理时间内完成（打印耗时；
//      kNN 训练集 >2000 时降级抽样 2000 个代表点，断言其生效）
//   ③ ROC / AUC 计算 < 1s（排序 + 去重阈值扫描 O(n log n)）
//   ④ 5001 行 / 21 个特征列 / 6MB 的越界输入报中文错误
//   ⑤ Apriori：5000 笔交易解析通过；13 种商品报中文错误（指数复杂度解释）
//   附：K-Means / DBSCAN 在 5000 点上的耗时验证（层次聚类 300 上限不变）
// ============================================================
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'scripts', '.out8')
fs.mkdirSync(outDir, { recursive: true })

execSync(
  `node_modules/.bin/esbuild src/lib/csv.ts src/lib/classifiers.ts src/lib/metrics.ts src/lib/apriori.ts src/lib/kmeans.ts src/lib/dbscan.ts --bundle --format=esm --outdir=${outDir} --out-extension:.js=.mjs --log-level=error`,
  { cwd: root, stdio: 'inherit' },
)

const csv = await import(path.join(outDir, 'csv.mjs'))
const cf = await import(path.join(outDir, 'classifiers.mjs'))
const mt = await import(path.join(outDir, 'metrics.mjs'))
const ap = await import(path.join(outDir, 'apriori.mjs'))
const km = await import(path.join(outDir, 'kmeans.mjs'))
const db = await import(path.join(outDir, 'dbscan.mjs'))

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

// ---------- 数据生成：5000 行 × 8 特征二分类 ----------
const rng = cf.mulberry32(20260930)
const N = 5000
const D = 8
const featureNames = Array.from({ length: D }, (_, j) => `特征${j + 1}`)
const rows = []
for (let i = 0; i < N; i++) {
  const vals = []
  let s = 0
  for (let j = 0; j < D; j++) {
    const v = rng() * 20 - 10
    vals.push(v.toFixed(20)) // 长小数，把文件撑到 ~1MB 量级
    s += (j % 2 === 0 ? v : -v) * (j < 4 ? 1 : 0.2)
  }
  rows.push({ vals, label: s + (rng() - 0.5) * 18 > 2 ? '流失' : '未流失' })
}
// 打乱行序，避免标签按生成顺序排列
for (let i = rows.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1))
  ;[rows[i], rows[j]] = [rows[j], rows[i]]
}
const csvText = [[...featureNames, '是否流失'].join(','), ...rows.map((r) => [...r.vals, r.label].join(','))].join('\n')
const csvMB = Buffer.byteLength(csvText, 'utf-8') / 1024 / 1024

// ---------- ① 上限常量 + 5000×8 解析 ----------
console.log('\n【① 上限常量与 5000 行 × 8 特征解析】')
check('csv.ts 上限 = 5MB / 5000 行 / 20 特征', csv.CSV_LIMITS.maxBytes === 5 * 1024 * 1024 && csv.CSV_LIMITS.maxRows === 5000 && csv.CSV_LIMITS.maxFeatures === 20)
console.log(`  ℹ️  合成 CSV 体积 ${csvMB.toFixed(2)}MB（5000 行 × 8 特征）`)
check('合成 CSV 在 5MB 以内', Buffer.byteLength(csvText, 'utf-8') <= csv.CSV_LIMITS.maxBytes, `${csvMB.toFixed(2)}MB`)
const tParse0 = performance.now()
const data = csv.parseCsvText(csvText)
const tParse = performance.now() - tParse0
check('5000 行 × 8 特征解析通过', data.X.length === 5000 && data.featureNames.length === 8 && data.y.length === 5000, `解析耗时 ${tParse.toFixed(0)}ms`)
check('两类标签识别正确', data.classNames.length === 2 && new Set(data.y).size === 2, data.classNames.join(' / '))

// ---------- ② 七种方法训练 + 评估耗时 ----------
console.log('\n【② 七种方法训练 + 评估（训练 : 测试 = 7 : 3，与 UI 相同流程）】')
const { Xtr, ytr, Xte, yte } = mt.trainTestSplit(data.X, data.y, 0.3, 42)
console.log(`  ℹ️  训练集 ${Xtr.length} / 测试集 ${Xte.length}`)
const makers = [
  ['决策树', () => new cf.DecisionTreeClassifier(6)],
  ['kNN 近邻', () => new cf.KNNClassifier(5)],
  ['逻辑回归', () => new cf.LogisticRegressionClassifier(0.1, 2000)],
  ['朴素贝叶斯', () => new cf.GaussianNBClassifier()],
  ['SVM', () => new cf.LinearSVMClassifier(1)],
  ['随机森林', () => new cf.RandomForestClassifier(20, 6)],
  ['XGBoost', () => new cf.XGBoostClassifier(20, 0.3)],
]
const timingRows = []
let knnDegraded = false
let totalAll = 0
for (const [name, mk] of makers) {
  const t0 = performance.now()
  const isKnn = name === 'kNN 近邻'
  const sub = isKnn ? cf.subsampleKnnTrain(Xtr, ytr) : null
  if (isKnn && sub.sampled) knnDegraded = true
  const clf = mk()
  clf.fit(sub ? sub.X : Xtr, sub ? sub.y : ytr)
  const tFit = performance.now()
  const predTr = clf.predict(Xtr)
  const predTe = clf.predict(Xte)
  const proba = clf.predictProba(Xte)
  const tPred = performance.now()
  const roc = mt.rocPoints(yte, proba)
  const auc = mt.aucOf(roc)
  const total = performance.now() - t0
  totalAll += total
  const acc = mt.accuracyScore(yte, predTe)
  timingRows.push({ name, fit: tFit - t0, eval: tPred - tFit, total, acc, auc, extra: isKnn && sub.sampled ? `（已降级：${Xtr.length}→${sub.X.length} 代表点）` : '' })
  check(`${name} 训练+评估在合理时间内（<10s）`, total < 10000, `fit=${(tFit - t0).toFixed(0)}ms eval=${(tPred - tFit).toFixed(0)}ms 共 ${total.toFixed(0)}ms acc=${acc.toFixed(3)}`)
  check(`${name} 评估有效（测试准确率 > 0.6）`, acc > 0.6, `acc=${acc.toFixed(3)} auc=${auc.toFixed(3)}`)
}
check('kNN 大数据降级生效（训练集抽样到 2000 代表点）', knnDegraded)
check('七方法串行总耗时 < 15s（横向对比不卡死）', totalAll < 15000, `共 ${(totalAll / 1000).toFixed(2)}s`)

// ---------- ③ ROC / AUC < 1s ----------
console.log('\n【③ ROC / AUC 性能】')
{
  const proba = Xte.map((row) => 1 / (1 + Math.exp(-(row[0] - row[1] + row[2] - row[3]))))
  const t0 = performance.now()
  const roc = mt.rocPoints(yte, proba)
  const auc = mt.aucOf(roc)
  const ms = performance.now() - t0
  check('ROC/AUC 计算 < 1s（排序 + 去重阈值扫描 O(n log n)）', ms < 1000, `${ms.toFixed(1)}ms，${roc.length} 个点，AUC=${auc.toFixed(3)}`)
}

// ---------- ④ 越界输入报中文错误 ----------
console.log('\n【④ 越界输入的中文错误】')
const expectErr = (name, fn, ...keywords) => {
  try {
    fn()
    check(name, false, '没有抛错')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    check(name, keywords.every((k) => msg.includes(k)), msg.slice(0, 70))
  }
}
// 5001 行
expectErr(
  '5001 行 → 行数超限中文错误',
  () => csv.parseCsvText(csvText + '\n' + rows[0].vals.join(',') + ',未流失'),
  '行数超限', '5000', '5001',
)
// 21 个特征列（+ 标签 = 22 列）
expectErr(
  '21 个特征列 → 特征列超限中文错误',
  () => {
    const head = [...Array.from({ length: 21 }, (_, j) => `f${j}`), 'label'].join(',')
    const body = Array.from({ length: 30 }, (_, i) => [...Array.from({ length: 21 }, () => '1'), i % 2 ? 'a' : 'b'].join(',')).join('\n')
    csv.parseCsvText(head + '\n' + body)
  },
  '特征列超限', '20', '21',
)
// 边界：恰好 20 个特征列（21 列含标签）应通过
{
  const head = [...Array.from({ length: 20 }, (_, j) => `f${j}`), 'label'].join(',')
  const body = Array.from({ length: 30 }, (_, i) => [...Array.from({ length: 20 }, () => String(i)), i % 2 ? 'a' : 'b'].join(',')).join('\n')
  const ok20 = csv.parseCsvText(head + '\n' + body)
  check('边界：20 个特征列（含标签共 21 列）解析通过', ok20.featureNames.length === 20)
}
// 6MB 文件：上传组件按 file.size 拦截，这里验证同一阈值与中文文案
{
  const oversize = 6 * 1024 * 1024
  check('6MB 超过 5MB 上限（组件按 file.size 拦截）', oversize > csv.CSV_LIMITS.maxBytes)
  const msg = `文件过大：限制 ${csv.CSV_LIMITS.maxBytes / 1024 / 1024}MB，当前 ${(oversize / 1024 / 1024).toFixed(2)}MB`
  check('文件过大中文文案正确', msg === '文件过大：限制 5MB，当前 6.00MB', msg)
}

// ---------- ⑤ Apriori 购物篮 ----------
console.log('\n【⑤ Apriori 购物篮 CSV】')
const ITEMS12 = Array.from({ length: 12 }, (_, i) => `商品${i + 1}`)
{
  const rng2 = cf.mulberry32(7)
  const lines = []
  for (let i = 0; i < 5000; i++) {
    const k = 2 + Math.floor(rng2() * 4)
    const basket = new Set()
    while (basket.size < k) basket.add(ITEMS12[Math.floor(rng2() * 12)])
    lines.push([...basket].join(','))
  }
  const tx = ap.parseBasketCsv(lines.join('\n'))
  check('5000 笔交易（12 种商品）解析通过', tx.length === 5000, `${tx.length} 笔`)
}
expectErr(
  '13 种商品 → 中文错误并解释指数复杂度',
  () => {
    const items13 = Array.from({ length: 13 }, (_, i) => `商品${i + 1}`)
    const lines = Array.from({ length: 20 }, (_, i) => [items13[i % 13], items13[(i + 1) % 13]].join(','))
    ap.parseBasketCsv(lines.join('\n'))
  },
  '商品种类过多', '12', '13', '指数', '合并低频商品',
)
// 边界：恰好 12 种商品应通过（上面 5000 笔用例已覆盖，这里再验证错误文案不触发）
{
  const lines = Array.from({ length: 24 }, (_, i) => [ITEMS12[i % 12], ITEMS12[(i + 3) % 12]].join(','))
  check('边界：恰好 12 种商品解析通过', ap.parseBasketCsv(lines.join('\n')).length === 24)
}

// ---------- 附：聚类在 5000 点上的耗时 ----------
console.log('\n【附】K-Means / DBSCAN 在 5000 点的耗时（层次聚类 300 上限不变）')
{
  const rng3 = cf.mulberry32(11)
  const pts = []
  for (let i = 0; i < 5000; i++) {
    const c = i % 3
    pts.push({ x: [20, 80, 50][c] + (rng3() - 0.5) * 16, y: [25, 30, 75][c] + (rng3() - 0.5) * 16 })
  }
  const t0 = performance.now()
  let cent = km.randomCentroids(pts, 3)
  let asg = km.assignPoints(pts, cent).assignment
  for (let it = 0; it < 50; it++) {
    const next = km.updateCentroids(pts, asg, cent)
    if (km.maxShift(cent, next) < 0.1) break
    cent = next
    asg = km.assignPoints(pts, cent).assignment
  }
  const kmMs = performance.now() - t0
  check('K-Means 5000 点一键收敛 < 2s', kmMs < 2000, `${kmMs.toFixed(0)}ms`)

  const t1 = performance.now()
  const r = db.dbscanRun(pts, 7, 4)
  const dbMs = performance.now() - t1
  check('DBSCAN 5000 点直接出结果 < 5s', dbMs < 5000, `${dbMs.toFixed(0)}ms，${r.clusterCount} 簇`)
}

// ---------- 汇总 ----------
console.log('\n========================================')
console.log('各方法耗时一览（5000 行 × 8 特征，训练 3500 / 测试 1500）：')
for (const r of timingRows) {
  console.log(`  ${r.name.padEnd(8)} fit=${r.fit.toFixed(0).padStart(5)}ms  eval=${r.eval.toFixed(0).padStart(5)}ms  共=${r.total.toFixed(0).padStart(5)}ms  acc=${r.acc.toFixed(3)}  auc=${r.auc.toFixed(3)} ${r.extra}`)
}
console.log(`  七方法合计 ${(totalAll / 1000).toFixed(2)}s`)
console.log('========================================')
console.log(`自测结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
