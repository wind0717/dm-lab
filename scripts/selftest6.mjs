// ============================================================
// 逐步推演自测（第六批：SVM / 随机森林 / XGBoost）
// 运行方式（项目根目录）：node scripts/selftest6.mjs
// 验证点：
//   1. SVM 推演：间隔宽度总体上升、线性可分数据最终训练准确率 > 0.95、支持向量非空
//   2. 随机森林：随树数增加，森林测试准确率不低于单棵树（固定种子）
//   3. XGBoost：对数损失随轮下降、强信号数据 30 轮内准确率 > 0.9
// ============================================================
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'scripts', '.out6')
fs.mkdirSync(outDir, { recursive: true })

execSync(
  `node_modules/.bin/esbuild src/lib/walkthroughs2.ts src/lib/datasets.ts --bundle --format=esm --outdir=${outDir} --out-extension:.js=.mjs --log-level=error`,
  { cwd: root, stdio: 'inherit' },
)

const wt = await import(path.join(outDir, 'walkthroughs2.mjs'))
const ds = await import(path.join(outDir, 'datasets.mjs'))

// 固定随机流，保证自测可复现（datasets 的生成器用全局 Math.random）
{
  let s = 20261001
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

// ---------- 1. SVM 逐步推演 ----------
console.log('\n【SVM 逐步推演 · 线性可分数据】')
{
  const pts = ds.genDTPreset('linear', 60, 6)
  const X = pts.map((p) => [p.x, p.y])
  const y = pts.map((p) => p.label)
  const walk = wt.svmWalkthrough(X, y, 10, 0.05, 240)
  const steps = walk.steps
  const final = steps[steps.length - 1]

  check('步数合理（2 ~ 241 步，含第 0 步初始化）', steps.length >= 2 && steps.length <= 241, `共 ${steps.length} 步`)

  // 间隔宽度总体上升：后半段平均明显宽于前半段平均，且最终宽于初始
  const margins = steps.map((s) => s.margin)
  const half = Math.floor(margins.length / 2)
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  const firstAvg = avg(margins.slice(0, half))
  const lastAvg = avg(margins.slice(half))
  check('间隔宽度总体上升（后半段均值 > 前半段均值）', lastAvg > firstAvg, `${firstAvg.toFixed(3)} → ${lastAvg.toFixed(3)}（最终 ${final.margin.toFixed(3)}）`)
  check('最终间隔明显宽于初始间隔（> 1.5 倍）', final.margin > margins[0] * 1.5, `初始 ${margins[0].toFixed(3)} → 最终 ${final.margin.toFixed(3)}`)

  check('最终训练准确率 > 0.95', final.acc > 0.95, `acc = ${(final.acc * 100).toFixed(1)}%`)
  check('违反间隔的样本数下降', final.viol <= steps[0].viol, `${steps[0].viol} → ${final.viol}`)
  check('hinge 损失下降', final.hinge < steps[0].hinge, `${steps[0].hinge.toFixed(4)} → ${final.hinge.toFixed(4)}`)

  // 支持向量：最终落在带上/带内的点，数量应远小于总样本
  check('支持向量非空且是少数派', final.svIdx.length > 0 && final.svIdx.length < y.length * 0.5, `${final.svIdx.length} / ${y.length} 个`)
  // 支持向量的几何性质：每个 sv 满足 yᵢ·s ≤ 1（容差内）
  const okSv = final.svIdx.every((i) => {
    const yi = y[i] === 1 ? 1 : -1
    const z = [(X[i][0] - walk.mean[0]) / walk.std[0], (X[i][1] - walk.mean[1]) / walk.std[1]]
    return yi * (final.w[0] * z[0] + final.w[1] * z[1] + final.b) <= 1 + 1e-4
  })
  check('支持向量均满足 yᵢ·(w·z+b) ≤ 1', okSv)

  // 换月牙数据：线性 SVM 准确率应明显掉（能力边界）
  const pts2 = ds.genDTPreset('moons', 60, 6)
  const walk2 = wt.svmWalkthrough(pts2.map((p) => [p.x, p.y]), pts2.map((p) => p.label), 10, 0.05, 240)
  const acc2 = walk2.steps[walk2.steps.length - 1].acc
  check('非线性数据（月牙）上准确率低于线性可分（能力边界符合预期）', acc2 < final.acc, `月牙 acc = ${(acc2 * 100).toFixed(1)}%`)
}

// ---------- 2. 随机森林逐步推演 ----------
console.log('\n【随机森林逐步推演（固定种子）】')
{
  // 主场数据：线性可分 + 噪声 —— 森林应显著优于单树且准确率高
  const pts = ds.genDTPreset('linear', 60, 6)
  const X = pts.map((p) => [p.x, p.y])
  const y = pts.map((p) => p.label)
  const walk = wt.forestWalkthrough(X, y, 9, 4, 7)

  check('训练 9 棵树、9 个累计步', walk.trees.length === 9 && walk.steps.length === 9)
  check('每棵树都有 bootstrap 抽样记录', walk.trees.every((t) => t.sampleIdx.length === walk.Xtr.length))

  const single = walk.steps[0]
  const forest = walk.steps[walk.steps.length - 1]
  check('森林测试准确率不低于单棵树', forest.testAcc >= single.testAcc - 1e-9, `单树 ${(single.testAcc * 100).toFixed(1)}% → 森林 ${(forest.testAcc * 100).toFixed(1)}%`)
  check('森林训练准确率不低于单棵树', forest.trainAcc >= single.trainAcc - 1e-9, `单树 ${(single.trainAcc * 100).toFixed(1)}% → 森林 ${(forest.trainAcc * 100).toFixed(1)}%`)
  check('最终测试准确率像样（≥ 0.9）', forest.testAcc >= 0.9, `testAcc = ${(forest.testAcc * 100).toFixed(1)}%`)

  // 月牙数据（页面默认）：同样是"森林 ≥ 单树"要成立
  const ptsM = ds.genDTPreset('moons', 60, 6)
  const walkM = wt.forestWalkthrough(ptsM.map((p) => [p.x, p.y]), ptsM.map((p) => p.label), 9, 4, 13)
  check(
    '月牙数据上森林测试准确率也不低于单棵树',
    walkM.steps[8].testAcc >= walkM.steps[0].testAcc - 1e-9,
    `单树 ${(walkM.steps[0].testAcc * 100).toFixed(1)}% → 森林 ${(walkM.steps[8].testAcc * 100).toFixed(1)}%`,
  )

  // 多样性：不同树的预测应当有分歧（否则小图千篇一律，教学失败）
  const probe = walk.Xte.slice(0, 20)
  const signatures = new Set(probe.map((row) => walk.trees.map((t) => wt.forestVote([t.tree], row)).join('')))
  // 每棵树单独投票的签名组合多于 1 种，说明树间确有分歧
  const rowSigs = new Set(
    probe.map((row) => walk.trees.map((t) => (wt.forestVote([t.tree], row) === 1 ? '1' : '0')).join('')),
  )
  check('树与树之间存在分歧（多样性来源）', signatures.size > 1 && rowSigs.size > 1, `${probe.length} 个探测点出现 ${rowSigs.size} 种投票组合`)

  // 确定性：同种子重跑结果一致
  const walk2 = wt.forestWalkthrough(X, y, 9, 4, 7)
  check('固定种子结果可复现', Math.abs(walk2.steps[8].testAcc - forest.testAcc) < 1e-12)
}

// ---------- 3. XGBoost 逐步推演 ----------
console.log('\n【XGBoost 逐步推演 · 强信号数据】')
{
  const pts = ds.genDTPreset('linear', 60, 4) // 低噪声强信号
  const X = pts.map((p) => [p.x, p.y])
  const y = pts.map((p) => p.label)
  const walk = wt.xgbWalkthrough(X, y, 30, 0.3, 3)

  check('30 轮 = 30 棵树 + 31 个状态（含第 0 步先验）', walk.trees.length === 30 && walk.steps.length === 31)

  const losses = walk.steps.map((s) => s.loss)
  let riseCount = 0
  let maxRise = 0
  for (let i = 1; i < losses.length; i++) {
    const d = losses[i] - losses[i - 1]
    if (d > 1e-9) {
      riseCount++
      if (d > maxRise) maxRise = d
    }
  }
  check('对数损失随轮下降（无上升轮）', riseCount === 0, `上升轮 ${riseCount}，最大上升 ${maxRise.toExponential(2)}`)
  check('最终损失远低于初始（< 40%）', losses[losses.length - 1] < losses[0] * 0.4, `loss: ${losses[0].toFixed(4)} → ${losses[losses.length - 1].toFixed(4)}`)

  const bestAcc30 = Math.max(...walk.steps.slice(0, 31).map((s) => s.acc))
  check('30 轮内准确率 > 0.9', bestAcc30 > 0.9, `最佳 acc = ${(bestAcc30 * 100).toFixed(1)}%（第 0 步 ${(walk.steps[0].acc * 100).toFixed(1)}%）`)

  // 残差高亮依据：第 0 步 wrong+unsure 应多，收敛后应锐减
  check('"重点关照"样本数随轮减少', walk.steps[30].wrong + walk.steps[30].unsure < walk.steps[0].wrong + walk.steps[0].unsure, `${walk.steps[0].wrong}+${walk.steps[0].unsure} → ${walk.steps[30].wrong}+${walk.steps[30].unsure}`)

  // 概率接口：只看第 1 棵树的置信应弱于全部叠加（逐步精细）
  const probe = X[0]
  const pFirst = wt.xgbProba(walk, probe, 30, true)
  const pAll = wt.xgbProba(walk, probe, 30, false)
  const conf = (p) => Math.abs(p - 0.5)
  check('全部叠加比单看第 1 棵树更自信（逐轮精细）', conf(pAll) >= conf(pFirst) - 1e-9, `第 1 棵 p=${pFirst.toFixed(3)} → 全部 p=${pAll.toFixed(3)}`)
}

console.log(`\n========================================`)
console.log(`自测结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
