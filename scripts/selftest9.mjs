// ============================================================
// 自测 9：理论基础新增七节的纯计算（src/lib/theoryMath.ts）
// 运行方式（项目根目录）：node scripts/selftest9.mjs
// 断言：
//   ① 贝叶斯：1% / 99% / 95% 时 P(患病|阳性) ≈ 16.7%；点阵计数自洽
//   ② 皮尔逊 r：完全线性 = ±1；非线性（抛物线）预设 r ≈ 0
//   ③ 梯度下降：η=0.2 收敛到 w*=2 且损失单调下降；η=1.05 发散
//   ④ K 折交叉验证：折数 = 得分数；折覆盖全部样本且不重叠
//   ⑤ PCA(2D)：第一主成分与椭圆长轴夹角 < 5°；方差保留率 > 90%
// ============================================================
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'scripts', '.out9')
fs.mkdirSync(outDir, { recursive: true })

execSync(`node_modules/.bin/esbuild src/lib/theoryMath.ts --bundle --format=esm --outdir=${outDir} --out-extension:.js=.mjs --log-level=error`, {
  cwd: root,
  stdio: 'inherit',
})

const tm = await import(path.join(outDir, 'theoryMath.mjs'))

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

// ---------- ① 贝叶斯 ----------
console.log('\n【① 贝叶斯定理】')
{
  const r = tm.bayesPosterior(0.01, 0.99, 0.95)
  check('经典案例 P(患病|阳性) ≈ 16.7%', Math.abs(r.posterior - 1 / 6) < 0.002, `posterior = ${(r.posterior * 100).toFixed(2)}%`)
  check('分子 = 患病率 × 灵敏度', Math.abs(r.numerator - 0.0099) < 1e-9, `numerator = ${r.numerator}`)
  check('误报项 = (1−患病率) × (1−特异度)', Math.abs(r.falseAlarmTerm - 0.0495) < 1e-9, `falseAlarmTerm = ${r.falseAlarmTerm}`)

  const r30 = tm.bayesPosterior(0.3, 0.99, 0.95)
  check('患病率 30% 时后验大幅上升（>89%）', r30.posterior > 0.89, `${(r30.posterior * 100).toFixed(1)}%`)

  const g = tm.bayesGrid(0.01, 0.99, 0.95)
  check('1000 人点阵：患者 10 / 检出 10 / 误报 50', g.sick === 10 && g.detected === 10 && g.falseAlarm === 50, JSON.stringify(g))
  check('点阵计数自洽（检出+漏检=患者）', g.detected + g.missed === g.sick)
  check('误报远多于真患者（罕见病的假阳性淹没效应）', g.falseAlarm > g.detected * 4)
}

// ---------- ② 皮尔逊相关 ----------
console.log('\n【② 协方差与皮尔逊 r】')
{
  const xs = [1, 2, 3, 4, 5]
  check('完全正线性 r = +1', Math.abs(tm.pearson(xs, xs.map((x) => 2 * x + 3)) - 1) < 1e-12)
  check('完全负线性 r = −1', Math.abs(tm.pearson(xs, xs.map((x) => -x)) + 1) < 1e-12)
  check('协方差符号：同向为正', tm.covariance(xs, xs) > 0)
  check('协方差符号：反向为负', tm.covariance(xs, xs.map((x) => -x)) < 0)

  const pos = tm.genCovPreset('positive')
  const neg = tm.genCovPreset('negative')
  const non = tm.genCovPreset('none')
  const nl = tm.genCovPreset('nonlinear')
  const rPos = tm.pearson(pos.map((p) => p.x), pos.map((p) => p.y))
  const rNeg = tm.pearson(neg.map((p) => p.x), neg.map((p) => p.y))
  const rNon = tm.pearson(non.map((p) => p.x), non.map((p) => p.y))
  const rNl = tm.pearson(nl.map((p) => p.x), nl.map((p) => p.y))
  check('正相关预设 r > 0.9', rPos > 0.9, `r = ${rPos.toFixed(3)}`)
  check('负相关预设 r < −0.9', rNeg < -0.9, `r = ${rNeg.toFixed(3)}`)
  check('无关预设 |r| < 0.2', Math.abs(rNon) < 0.2, `r = ${rNon.toFixed(3)}`)
  check('非线性（抛物线）预设 r ≈ 0（|r| < 0.15）——"r=0 ≠ 没关系"的教学点', Math.abs(rNl) < 0.15, `r = ${rNl.toFixed(3)}`)

  const fit = tm.linearFit([0, 1, 2, 3], [1, 3, 5, 7])
  check('回归线斜率/截距正确（y = 2x + 1）', Math.abs(fit.slope - 2) < 1e-9 && Math.abs(fit.intercept - 1) < 1e-9)
}

// ---------- ③ 梯度下降 ----------
console.log('\n【③ 梯度下降 J(w) = (w−2)² + 1】')
{
  const run = tm.gdRun(6, 0.2, 500)
  check('η=0.2 收敛', run.status === 'converged', `走了 ${run.ws.length - 1} 步，终点 w = ${run.ws.at(-1).toFixed(6)}`)
  check('收敛到 w* = 2', Math.abs(run.ws.at(-1) - 2) < 1e-3)
  const losses = run.ws.map(tm.gdLoss)
  let monotone = true
  for (let i = 1; i < losses.length; i++) if (losses[i] > losses[i - 1] + 1e-12) monotone = false
  check('η=0.2 时损失序列单调下降', monotone)

  const slow = tm.gdRun(6, 0.05, 500)
  check('η=0.05 仍能收敛（慢但稳）', slow.status === 'converged', `${slow.ws.length - 1} 步`)
  check('η 越小步数越多（0.05 比 0.2 慢）', slow.ws.length > run.ws.length)

  const big = tm.gdRun(6, 1.05, 500)
  check('η=1.05 发散', big.status === 'diverged', `${big.ws.length} 步后飞出`)
  check('η=0.5 一步到谷底', tm.gdRun(6, 0.5, 10).status === 'converged' && tm.gdRun(6, 0.5, 10).ws.length === 2)
  const crit = tm.gdRun(6, 1.0, 100)
  check('η=1.0 临界：来回振荡不收敛（maxsteps）', crit.status === 'maxsteps' && Math.abs(crit.ws.at(-1) - 6) < 1e-9)
}

// ---------- ④ K 折交叉验证 ----------
console.log('\n【④ K 折交叉验证】')
{
  const folds = tm.kfoldSplit(100, 5)
  check('5 折，每折 20 个样本', folds.length === 5 && folds.every((f) => f.length === 20))
  const all = folds.flat()
  check('折覆盖全部样本且不重叠', new Set(all).size === 100 && all.length === 100)
  const folds7 = tm.kfoldSplit(103, 5)
  check('不能整除时前 3 折多 1 个（103 = 21×3 + 20×2）', folds7.slice(0, 3).every((f) => f.length === 21) && folds7.slice(3).every((f) => f.length === 20))

  const demo = tm.kfoldDemo(100, 5, 7)
  check('折数与得分个数一致（5 折 → 5 个得分）', demo.folds.length === 5 && demo.scores.length === 5)
  check('得分都在 [0,1]', demo.scores.every((s) => s >= 0 && s <= 1), demo.scores.map((s) => s.toFixed(3)).join(', '))
  const meanCheck = demo.scores.reduce((a, b) => a + b, 0) / 5
  check('平均分 = 得分均值', Math.abs(demo.mean - meanCheck) < 1e-12, `mean = ${(demo.mean * 100).toFixed(1)}%`)
  check('波动（标准差）非负且可复现', demo.std >= 0 && Math.abs(tm.kfoldDemo(100, 5, 7).mean - demo.mean) < 1e-15)
}

// ---------- ⑤ PCA ----------
console.log('\n【⑤ PCA 降维直觉】')
const angleDiff = (a, b) => {
  let d = Math.abs(a - b) % 180
  if (d > 90) d = 180 - d
  return d
}
{
  for (const target of [0, 25, -40, 60]) {
    const pts = tm.genEllipse(200, target, 7)
    const p = tm.pca2d(pts)
    const diff = angleDiff(p.angleDeg, target)
    check(`长轴 ${target}° → 第一主成分夹角 < 5°`, diff < 5, `估得 ${p.angleDeg.toFixed(2)}°，夹角 ${diff.toFixed(2)}°，保留率 ${(p.varRatio * 100).toFixed(1)}%`)
    check(`长轴 ${target}° → 方差保留率 > 90%`, p.varRatio > 0.9)
  }
  // 方向向量与角度一致、投影均值归零
  const pts = tm.genEllipse(150, 30, 3)
  const p = tm.pca2d(pts)
  check('dir 是单位向量', Math.abs(Math.hypot(...p.dir) - 1) < 1e-9)
  check('dir 与 angleDeg 一致', Math.abs(p.dir[0] - Math.cos((p.angleDeg * Math.PI) / 180)) < 1e-9)
  const scalars = pts.map((pt) => tm.projectOnto(pt, p.mean, p.dir))
  check('投影坐标均值 ≈ 0（相对数据中心）', Math.abs(scalars.reduce((a, b) => a + b, 0) / scalars.length) < 1e-9)
  check('λ1 ≥ λ2 ≥ 0', p.lambda1 >= p.lambda2 && p.lambda2 >= 0)
}

// ---------- 汇总 ----------
console.log('\n========================================')
console.log(`自测结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
