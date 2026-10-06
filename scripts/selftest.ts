// ============================================================
// 算法正确性自测（不进 bundle）
// 运行方式（项目根目录）：
//   npx tsc scripts/selftest.ts --outDir scripts/.out --module commonjs --target es2020 --moduleResolution node --skipLibCheck
//   echo '{"type":"commonjs"}' > scripts/.out/package.json
//   node scripts/.out/scripts/selftest.js
// 验证点：
//   1. 线性可分数据上逻辑回归准确率 > 0.85
//   2. 同心圆数据上随机森林明显优于单棵决策树
//   3. 强信号数据上 ROC 的 AUC > 0.9
//   4. 七种方法在内置案例数据上都能跑出合理结果
// ============================================================

import {
  DecisionTreeClassifier,
  KNNClassifier,
  LogisticRegressionClassifier,
  GaussianNBClassifier,
  LinearSVMClassifier,
  RandomForestClassifier,
  XGBoostClassifier,
  mulberry32,
  type Classifier,
} from '../src/lib/classifiers'
import { trainTestSplit, accuracyScore, rocPoints, aucOf } from '../src/lib/metrics'
import { genCaseDataset, CASE_IDS } from '../src/lib/datasets'

/** 局部高斯采样（带种子，可复现） */
function gaussRng(seed: number) {
  const rand = mulberry32(seed)
  return (mean: number, sd: number) => {
    const u = Math.max(rand(), 1e-9)
    const v = Math.max(rand(), 1e-9)
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd
  }
}

/** 线性可分：两团高斯 */
function makeLinear(n = 300, seed = 1): { X: number[][]; y: number[] } {
  const g = gaussRng(seed)
  const X: number[][] = []
  const y: number[] = []
  for (let i = 0; i < n; i++) {
    const c = i % 2
    X.push([g(c ? 3 : -3, 1.2), g(c ? 3 : -3, 1.2)])
    y.push(c)
  }
  return { X, y }
}

/** 同心圆：内盘 vs 外环（非线性 + 边界重叠噪声，单棵树吃亏） */
function makeCircles(n = 400, seed = 2): { X: number[][]; y: number[] } {
  const rand = mulberry32(seed)
  const g = gaussRng(seed + 99)
  const X: number[][] = []
  const y: number[] = []
  for (let i = 0; i < n; i++) {
    const c = i % 2
    // 半径带重叠：内盘 0~1.8，外环 1.7~3.3，再叠坐标噪声
    const r = c === 0 ? Math.sqrt(rand()) * 1.8 : 1.7 + rand() * 1.6
    const a = rand() * 2 * Math.PI
    X.push([r * Math.cos(a) + g(0, 0.22), r * Math.sin(a) + g(0, 0.22)])
    y.push(c)
  }
  return { X, y }
}

/** 强信号：几乎线性可分，AUC 应接近 1 */
function makeStrong(n = 300, seed = 3): { X: number[][]; y: number[] } {
  const g = gaussRng(seed)
  const X: number[][] = []
  const y: number[] = []
  for (let i = 0; i < n; i++) {
    const c = i % 2
    X.push([g(c ? 5 : -5, 1), g(c ? 5 : -5, 1), g(0, 3)])
    y.push(c)
  }
  return { X, y }
}

let failures = 0
function check(name: string, cond: boolean, detail: string) {
  console.log(`${cond ? '✅' : '❌'} ${name}：${detail}`)
  if (!cond) failures++
}

function evalOn(X: number[][], y: number[], clf: Classifier): { acc: number; auc: number } {
  const { Xtr, ytr, Xte, yte } = trainTestSplit(X, y, 0.3, 42)
  clf.fit(Xtr, ytr)
  const acc = accuracyScore(yte, clf.predict(Xte))
  const roc = rocPoints(yte, clf.predictProba(Xte))
  return { acc, auc: aucOf(roc) }
}

// ---- 1. 逻辑回归 @ 线性可分 ----
const lin = makeLinear()
const lrRes = evalOn(lin.X, lin.y, new LogisticRegressionClassifier(0.1, 2000))
check('逻辑回归 @ 线性可分', lrRes.acc > 0.85, `测试准确率 = ${lrRes.acc.toFixed(3)}（要求 > 0.85）`)

// ---- 2. 随机森林 vs 单棵树 @ 同心圆 ----
const cir = makeCircles()
const treeRes = evalOn(cir.X, cir.y, new DecisionTreeClassifier(4))
const rfRes = evalOn(cir.X, cir.y, new RandomForestClassifier(40, 8))
check(
  '随机森林 vs 单棵树 @ 同心圆',
  rfRes.acc > treeRes.acc + 0.02 && rfRes.acc > 0.85,
  `单棵树 = ${treeRes.acc.toFixed(3)}，随机森林 = ${rfRes.acc.toFixed(3)}（要求森林高出 2 个百分点以上且 > 0.85）`,
)

// ---- 3. AUC @ 强信号 ----
const st = makeStrong()
const stRes = evalOn(st.X, st.y, new LogisticRegressionClassifier(0.1, 2000))
check('AUC @ 强信号数据', stRes.auc > 0.9, `AUC = ${stRes.auc.toFixed(3)}（要求 > 0.9）`)

// ---- 4. 七种方法 @ 内置案例数据 ----
for (const caseId of CASE_IDS) {
  const ds = genCaseDataset(caseId)
  const line: string[] = []
  const clfs: Array<[string, Classifier]> = [
    ['决策树', new DecisionTreeClassifier(6)],
    ['kNN', new KNNClassifier(5)],
    ['逻辑回归', new LogisticRegressionClassifier(0.1, 2000)],
    ['朴素贝叶斯', new GaussianNBClassifier()],
    ['SVM', new LinearSVMClassifier(1)],
    ['随机森林', new RandomForestClassifier(20, 6)],
    ['XGBoost', new XGBoostClassifier(20, 0.3)],
  ]
  let allOk = true
  for (const [name, clf] of clfs) {
    const r = evalOn(ds.X, ds.y, clf)
    line.push(`${name} acc=${r.acc.toFixed(3)} auc=${r.auc.toFixed(3)}`)
    if (!(r.acc > 0.5 && r.auc > 0.5)) allOk = false
  }
  check(`七方法可跑 @ ${ds.name}`, allOk, line.join(' | '))
}

console.log(failures === 0 ? '\n全部自测通过 🎉' : `\n有 ${failures} 项未通过`)
process.exit(failures === 0 ? 0 : 1)
