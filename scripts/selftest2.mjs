// ============================================================
// 数据预处理 / 信息论 自测（第二批）
// 运行方式（项目根目录）：node scripts/selftest2.mjs
// 脚本会先用 esbuild 把 TS 库打包成 ESM 再导入断言，不进 vite bundle。
// 验证点：
//   1. Min-Max 归一化后范围严格落在 [0,1]
//   2. Z-score 标准化后均值≈0、标准差≈1
//   3. IQR 法则能抓出注入的 99999 极端异常值
//   4. 中位数填充后缺失清零，且不被极端值带偏
//   5. SMOTE 后少数类计数翻倍量级（≈多数类）
//   6. 独热编码把类别列拆成 k 个 0/1 列
//   7. 等频/等宽离散化产生正确箱数
//   8. 完全独立列联表互信息≈0；完全相关时互信息≈H(Y)
//   9. KL(P‖P)=0，按学号分裂的增益率远低于其信息增益
// ============================================================
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'scripts', '.out2')
fs.mkdirSync(outDir, { recursive: true })

// 打包两个纯函数库（互不依赖，一起打）
execSync(
  `node_modules/.bin/esbuild src/lib/preprocess.ts src/lib/infotheory.ts src/lib/entropy.ts --bundle --format=esm --outdir=${outDir} --out-extension:.js=.mjs --log-level=error`,
  { cwd: root, stdio: 'inherit' },
)

const prep = await import(path.join(outDir, 'preprocess.mjs'))
const info = await import(path.join(outDir, 'infotheory.mjs'))
const ent = await import(path.join(outDir, 'entropy.mjs'))

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
const nums = (col) => col.filter((v) => typeof v === 'number')

// ---------- 构造合成数据 ----------
// 正常值 10~50 之间 100 个，注入一个 99999 极端值 + 3 个缺失
const salesCol = []
let s = 12345
const rand = () => {
  s = (s * 1103515245 + 12345) % 2147483648
  return s / 2147483648
}
for (let i = 0; i < 100; i++) salesCol.push(+(10 + rand() * 40).toFixed(1))
salesCol[50] = 99999
salesCol[10] = null
salesCol[20] = null
salesCol[30] = null
const catCol = Array.from({ length: 100 }, (_, i) => ['华东', '华北', '西南'][i % 3])
const labelCol = Array.from({ length: 100 }, (_, i) => (i % 10 === 0 ? '坏账' : '正常')) // 10% 少数类

const base = {
  headers: ['地区', '月销售额(万元)', '是否坏账'],
  kinds: ['category', 'numeric', 'category'],
  cols: [catCol, [...salesCol], labelCol],
  labelCol: 2,
}

console.log('\n【预处理算子】')

// 1. Min-Max
{
  const d = prep.opMinMax(base, 1)
  const v = nums(d.cols[1])
  const min = Math.min(...v)
  const max = Math.max(...v)
  check('Min-Max 归一化范围 [0,1]', min >= 0 && min < 1e-9 && Math.abs(max - 1) < 1e-9, `min=${min}, max=${max}`)
}

// 2. Z-score
{
  const d = prep.opZScore(base, 1)
  const v = nums(d.cols[1])
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const std = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / v.length)
  check('Z-score 标准化 均值≈0 标准差≈1', Math.abs(mean) < 1e-6 && Math.abs(std - 1) < 1e-3, `mean=${mean.toFixed(6)}, std=${std.toFixed(4)}`)
}

// 3. IQR 抓 99999
{
  const mask = prep.iqrMask(base.cols[1], 1.5)
  check('IQR 法则抓出注入的 99999', mask[50] === true, `识别出 ${mask.filter(Boolean).length} 个异常`)
  const normalIdx = [0, 1, 2, 3, 4].filter((i) => mask[i])
  check('IQR 不误伤正常值（前 5 个正常样本）', normalIdx.length === 0)
}

// 3b. Z-score 法则也能抓 99999
{
  const mask = prep.zscoreMask(base.cols[1], 3)
  check('Z-score 法则抓出 99999', mask[50] === true)
}

// 4. 中位数填充
{
  const d = prep.opMissing(base, 1, 'median')
  const stillNull = d.cols[1].filter((v) => v === null).length
  const filled = d.cols[1][10]
  const meanFilled = prep.opMissing(base, 1, 'mean').cols[1][10]
  check('中位数填充后缺失清零', stillNull === 0)
  check('中位数填充值 ≈ 30（不被 99999 带偏）', Math.abs(filled - 30) < 2, `中位数填充=${filled.toFixed(1)}，均值填充=${meanFilled.toFixed(1)}（被拉高）`)
}

// 4b. 截断 winsorize
{
  const d = prep.opOutliers(base, 1, 'iqr', 1.5, 'clip')
  const v = nums(d.cols[1])
  check('IQR 截断后 99999 被缩回边界', Math.max(...v) < 200, `截断后 max=${Math.max(...v).toFixed(1)}`)
}

// 5. SMOTE（用内置脏数据：少数类≈10%）
{
  const dirty = prep.genDirtyDataset({ n: 200, missingRate: 0, outlierStrength: 0, seed: 42 })
  const before = dirty.cols[dirty.labelCol].filter((v) => v === '坏账').length
  const total = prep.rowCount(dirty)
  const d = prep.opSmote(dirty, 1, 5, 7)
  const after = d.cols[d.labelCol].filter((v) => v === '坏账').length
  const majority = total - before
  check(
    'SMOTE 后少数类翻倍量级（≈多数类）',
    after >= majority - 1 && after > before * 2,
    `少数类 ${before} → ${after}（多数类 ${majority}）`,
  )
}

// 6. 独热编码
{
  const d = prep.opEncode(base, 0, 'onehot')
  check('独热编码：1 个类别列 → 3 个 0/1 列', d.headers.length === 5 && d.kinds.filter((k) => k === 'numeric').length === 4, d.headers.join(' | '))
  const row0 = prep.getRow(d, 0)
  check('独热编码行内容正确（华东 → [1,0,0]）', row0[0] === 1 && row0[1] === 0 && row0[2] === 0, `第0行=${JSON.stringify(row0.slice(0, 3))}`)
}

// 6b. 整数编码
{
  const d = prep.opEncode(base, 0, 'integer')
  check('整数编码：类别列变数值列', d.kinds[0] === 'numeric' && d.cols[0].every((v) => typeof v === 'number'))
}

// 7. 离散化
{
  const clean = prep.opMissing(base, 1, 'median')
  const d = prep.opDiscretize(clean, 1, 4, 'freq')
  const distinct = new Set(d.cols[1].filter((v) => v !== null))
  check('等频离散化：数值列变 4 档类别列', d.kinds[1] === 'category' && distinct.size === 4, `档数=${distinct.size}`)
}

// 8. 内置脏数据 + 导出分类矩阵
{
  const dirty = prep.genDirtyDataset({ n: 200, missingRate: 0.08, outlierStrength: 0.5, seed: 42 })
  const bad = prep.toClassification(dirty)
  check('脏数据直接导出分类被拒绝（有缺失/类别列）', bad.ok === false, bad.ok ? '' : bad.reason)
  // 流水线：缺失填充（数值列中位数、类别列众数）→ 异常截断 → 地区独热 → 导出
  let d = dirty
  for (let j = 0; j < d.cols.length; j++) {
    if (j === d.labelCol) continue
    d = prep.opMissing(d, j, d.kinds[j] === 'numeric' ? 'median' : 'mode')
  }
  d = prep.opOutliers(d, 1, 'iqr', 1.5, 'clip')
  d = prep.opEncode(d, 0, 'onehot')
  const good = prep.toClassification(d)
  // 5 个地区独热列 + 4 个数值特征 = 9 个特征
  check('流水线处理后导出分类成功', good.ok === true && good.X.length === 200 && good.featureNames.length === 9, good.ok ? `特征=${good.featureNames.length}` : good.reason)
}

console.log('\n【信息论】')

// 9a. 完全独立 → 互信息 ≈ 0
{
  const indep = [[12, 18], [8, 12]] // 晴/雨 出游比例相同
  const mi = info.mutualInformation(indep)
  check('完全独立：I(X;Y) ≈ 0', Math.abs(mi) < 1e-9, `I=${mi.toFixed(6)}`)
}

// 9b. 完全相关 → 互信息 = H(Y)
{
  const dep = [[16, 0], [0, 14]]
  const mi = info.mutualInformation(dep)
  const hy = ent.entropyOfCounts([16, 14])
  check('完全相关：I(X;Y) = H(Y)', Math.abs(mi - hy) < 1e-9, `I=${mi.toFixed(4)}, H(Y)=${hy.toFixed(4)}`)
}

// 9c. 链式法则 H(X,Y) = H(X) + H(Y|X)
{
  const t = [[14, 6], [6, 14]]
  const hxy = info.jointEntropy(t)
  const hx = ent.entropyOfCounts([20, 20])
  const hyx = info.conditionalEntropy(t)
  check('链式法则 H(X,Y) = H(X) + H(Y|X)', Math.abs(hxy - (hx + hyx)) < 1e-9, `${hxy.toFixed(4)} = ${(hx + hyx).toFixed(4)}`)
}

// 10a. KL(P‖P) = 0
{
  const p = [0.4, 0.2, 0.15, 0.1, 0.1, 0.05]
  check('KL(P‖P) = 0', Math.abs(info.klDivergence(p, p)) < 1e-12)
}

// 10b. 交叉熵 = 熵 + KL
{
  const p = [0.4, 0.2, 0.15, 0.1, 0.1, 0.05]
  const q = [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6]
  const hp = ent.entropyOfCounts([40, 20, 15, 10, 10, 5])
  const lhs = info.crossEntropy(p, q)
  const rhs = hp + info.klDivergence(p, q)
  check('H(P,Q) = H(P) + D_KL(P‖Q)', Math.abs(lhs - rhs) < 1e-9, `${lhs.toFixed(4)} = ${rhs.toFixed(4)}`)
}

// 10c. 按学号分裂：IG 爆炸但增益率被打回原形
{
  const n = 30
  const parent = [15, 15] // H = 1
  const igBinary = 0.9 // 假设一个不错的二分裂
  const siBinary = info.splitInfo([15, 15])
  const igId = ent.entropyOfCounts(parent) // 每组 1 人 → 加权熵 0
  const siId = info.splitInfo(Array(n).fill(1))
  const grId = info.gainRatio(igId, siId)
  const grBinary = info.gainRatio(igBinary, siBinary)
  check('按学号分裂 IG = 父熵（爆炸到最大）', Math.abs(igId - 1) < 1e-9, `IG=${igId}`)
  check('按学号分裂 增益率 < 普通好分裂的增益率', grId < grBinary, `增益率 ${grId.toFixed(3)} < ${grBinary.toFixed(3)}`)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
