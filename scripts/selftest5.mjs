// ============================================================
// 逐步推演自测（第五批）
// 运行方式（项目根目录）：node scripts/selftest5.mjs
// 验证点：
//   1. 逻辑回归推演：线性可分数据上损失基本单调下降（允许尾段微波动）、最终训练准确率 > 0.9
//   2. kNN：邻居按距离升序、投票逻辑正确、簇内点判定正确
//   3. 朴素贝叶斯：后验概率和为 1、明显簇内点置信 > 0.9
// ============================================================
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'scripts', '.out5')
fs.mkdirSync(outDir, { recursive: true })

execSync(
  `node_modules/.bin/esbuild src/lib/walkthroughs.ts src/lib/datasets.ts src/lib/classifiers.ts --bundle --format=esm --outdir=${outDir} --out-extension:.js=.mjs --log-level=error`,
  { cwd: root, stdio: 'inherit' },
)

const wt = await import(path.join(outDir, 'walkthroughs.mjs'))
const ds = await import(path.join(outDir, 'datasets.mjs'))

// 固定随机流，保证自测可复现（datasets 的生成器用全局 Math.random）
{
  let s = 20260930
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

// ---------- 1. 逻辑回归推演 ----------
console.log('\n【逻辑回归逐步推演 · 线性可分数据】')
{
  const pts = ds.genDTPreset('linear', 60, 6)
  const X = pts.map((p) => [p.x, p.y])
  const y = pts.map((p) => p.label)
  const walk = wt.logisticWalkthrough(X, y, 0.5, 200)
  const losses = walk.steps.map((s) => s.loss)
  const final = walk.steps[walk.steps.length - 1]

  check('步数合理（2 ~ 201 步，含第 0 步初始化）', walk.steps.length >= 2 && walk.steps.length <= 201, `共 ${walk.steps.length} 步`)
  check('初始损失明显高于最终损失', losses[0] > final.loss * 1.5, `loss: ${losses[0].toFixed(4)} → ${final.loss.toFixed(4)}`)

  // 单调性：允许尾段微波动 —— 统计"上升步"的比例与幅度
  let riseCount = 0
  let maxRise = 0
  for (let i = 1; i < losses.length; i++) {
    const d = losses[i] - losses[i - 1]
    if (d > 0) {
      riseCount++
      if (d > maxRise) maxRise = d
    }
  }
  const riseRatio = riseCount / (losses.length - 1)
  check('损失基本单调下降（上升步 < 10%）', riseRatio < 0.1, `上升步 ${riseCount}/${losses.length - 1}（${(riseRatio * 100).toFixed(1)}%）`)
  check('尾段波动幅度微小（最大单步上升 < 1% 初始损失）', maxRise < losses[0] * 0.01, `最大上升 ${maxRise.toExponential(2)}`)

  check('最终训练准确率 > 0.9', final.acc > 0.9, `acc = ${(final.acc * 100).toFixed(1)}%`)
  check('收敛判停或达上限均有交代', walk.converged || walk.steps.length === 201, walk.converged ? `第 ${walk.steps.length - 1} 步收敛` : '达 200 步上限')

  // 月牙数据（非线性）：准确率应明显掉，说明边界确实在学
  const pts2 = ds.genDTPreset('moons', 60, 6)
  const walk2 = wt.logisticWalkthrough(pts2.map((p) => [p.x, p.y]), pts2.map((p) => p.label), 0.5, 200)
  const acc2 = walk2.steps[walk2.steps.length - 1].acc
  check('非线性数据（月牙）上准确率低于线性可分（能力边界符合预期）', acc2 < final.acc, `月牙 acc = ${(acc2 * 100).toFixed(1)}%`)
}

// ---------- 2. kNN 邻居与投票 ----------
console.log('\n【kNN 邻居投票】')
{
  // 手工构造：A 类在 (20,20) 附近，B 类在 (80,80) 附近
  const X = []
  const y = []
  const base = [
    [18, 22], [22, 18], [20, 20], [19, 24], [24, 21], // A 类 5 个
    [78, 82], [82, 78], [80, 80], [79, 76], [84, 81], // B 类 5 个
  ]
  for (const [i, [a, b]] of base.entries()) {
    X.push([a, b])
    y.push(i < 5 ? 0 : 1)
  }

  const nb = wt.knnNeighbors(X, y, [21, 19], 3)
  check('返回恰好 k 个邻居', nb.length === 3)
  check('邻居按距离升序排列', nb[0].dist <= nb[1].dist && nb[1].dist <= nb[2].dist, nb.map((n) => n.dist.toFixed(2)).join(' ≤ '))
  check('A 簇旁的查询点邻居全是 A 类', nb.every((n) => n.label === 0))

  const [vA, vB] = wt.knnVotes(nb)
  check('投票计数正确（3:0）', vA === 3 && vB === 0, `A=${vA} B=${vB}`)
  check('判定为 A 类', wt.knnPredict(nb) === 0)

  const nbB = wt.knnNeighbors(X, y, [81, 79], 5)
  check('B 簇旁的查询点判定为 B 类', wt.knnPredict(nbB) === 1, `投票 ${JSON.stringify(wt.knnVotes(nbB))}`)

  // 距离数值抽查：到 (20,20) 的欧氏距离 = √2
  const d = wt.knnNeighbors(X, y, [21, 21], 10).find((n) => n.idx === 2)
  check('欧氏距离数值正确（(21,21)→(20,20) = √2 ≈ 1.414）', Math.abs(d.dist - Math.SQRT2) < 1e-9, `dist = ${d.dist.toFixed(4)}`)

  // k=1 平票不可能；k=2 平票时归 B（与 p>=0.5 判正类一致）
  const tie = wt.knnNeighbors([[0, 0], [10, 0]], [0, 1], [5, 0], 2)
  check('平票时按 p≥0.5 规则判 B 类', wt.knnPredict(tie) === 1)
}

// ---------- 3. 朴素贝叶斯后验 ----------
console.log('\n【朴素贝叶斯后验】')
{
  const pts = ds.genDTPreset('linear', 80, 2) // 低噪声双高斯簇
  const X = pts.map((p) => [p.x, p.y])
  const y = pts.map((p) => p.label)
  const fit = wt.nbFit(X, y)

  check('先验和为 1', Math.abs(fit.prior[0] + fit.prior[1] - 1) < 1e-9, `P(A)=${fit.prior[0].toFixed(3)} P(B)=${fit.prior[1].toFixed(3)}`)

  // 明显簇内点：A 类中心 (32,32)
  const postA = wt.nbPosterior(fit, [32, 32])
  check('A 簇中心点后验和为 1', Math.abs(postA.pA + postA.pB - 1) < 1e-9, `P(A|x)=${postA.pA.toFixed(4)} P(B|x)=${postA.pB.toFixed(4)}`)
  check('A 簇中心点判 A 且置信 > 0.9', postA.pA > 0.9, `置信 = ${(postA.pA * 100).toFixed(2)}%`)

  const postB = wt.nbPosterior(fit, [68, 68])
  check('B 簇中心点后验和为 1', Math.abs(postB.pA + postB.pB - 1) < 1e-9, `P(A|x)=${postB.pA.toFixed(4)} P(B|x)=${postB.pB.toFixed(4)}`)
  check('B 簇中心点判 B 且置信 > 0.9', postB.pB > 0.9, `置信 = ${(postB.pB * 100).toFixed(2)}%`)

  // 中间点：置信应低于簇内点
  const postMid = wt.nbPosterior(fit, [50, 50])
  const midConf = Math.max(postMid.pA, postMid.pB)
  check('簇间中点置信低于簇内点（不确定性如实反映）', midConf < Math.max(postA.pA, postB.pB), `中点置信 = ${(midConf * 100).toFixed(2)}%`)

  // 分子一致性：归一化后 pA = numA / (numA + numB)
  check('归一化公式与后验一致', Math.abs(postA.pA - postA.numA / (postA.numA + postA.numB)) < 1e-9)
}

console.log(`\n========================================`)
console.log(`自测结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
