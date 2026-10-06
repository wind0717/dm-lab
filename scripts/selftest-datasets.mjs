// ============================================================
// 数据集可复现性自测 —— 对应 P0 改造「datasets.ts 种子随机」
// 运行方式（项目根目录）：node scripts/selftest-datasets.mjs
//
// 背景：datasets.ts 原先全部使用 Math.random()，导致
//   ① 学生 A 与学生 B 打开同一实验看到的数据不同，无法课堂讨论
//   ② 老师课上演示的结论，学生课后无法复现
//   ③ 同一参数两次跑出不同结果，学生写实验报告无法归因
// 改造后所有生成函数带 seed 参数，本脚本守住「同 seed 必同结果」这条底线。
// ============================================================
import { build } from 'esbuild'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const ROOT = process.cwd()
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-selftest-'))
const OUT = path.join(OUT_DIR, 'datasets.mjs')

await build({
  entryPoints: [path.join(ROOT, 'src/lib/datasets.ts')],
  bundle: true,
  format: 'esm',
  outfile: OUT,
  logLevel: 'error',
})

const D = await import(`file://${OUT}`)

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
let pass = 0
let fail = 0
const check = (name, fn) => {
  try {
    fn()
    pass++
    console.log('  ✓ ' + name)
  } catch (e) {
    fail++
    console.log('  ✗ ' + name + ' → ' + e.message)
  }
}

console.log('【1】同 seed 两次调用必须逐点完全一致（可复现性底线）')
for (const preset of ['linear', 'circles', 'moons', 'xor']) {
  check(`genDTPreset ${preset}`, () => {
    if (!eq(D.genDTPreset(preset, 60, 6), D.genDTPreset(preset, 60, 6))) throw new Error('两次结果不一致')
  })
}
for (const preset of ['blobs', 'rings', 'moons', 'smile']) {
  check(`genKMPreset ${preset}`, () => {
    if (!eq(D.genKMPreset(preset, 50, 4), D.genKMPreset(preset, 50, 4))) throw new Error('两次结果不一致')
  })
}
check('gen1DTwoClass', () => {
  if (!eq(D.gen1DTwoClass(30), D.gen1DTwoClass(30))) throw new Error('两次结果不一致')
})
for (const id of D.CASE_IDS) {
  check(`genCaseDataset ${id}`, () => {
    if (!eq(D.genCaseDataset(id), D.genCaseDataset(id))) throw new Error('两次结果不一致')
  })
}

console.log('')
console.log('【2】不同 seed 必须产生不同数据（确认种子真的生效而非被忽略）')
check('genDTPreset seed42 ≠ seed7', () => {
  if (eq(D.genDTPreset('linear', 60, 6, 42), D.genDTPreset('linear', 60, 6, 7))) throw new Error('种子未生效')
})
check('genKMPreset seed42 ≠ seed7', () => {
  if (eq(D.genKMPreset('blobs', 50, 4, 42), D.genKMPreset('blobs', 50, 4, 7))) throw new Error('种子未生效')
})
check('gen1DTwoClass seed42 ≠ seed7', () => {
  if (eq(D.gen1DTwoClass(30, 42), D.gen1DTwoClass(30, 7))) throw new Error('种子未生效')
})

console.log('')
console.log('【3】数值健全性（改造不应改变原有数据形态）')
check('坐标恒在 [0,100] 内（含高噪声）', () => {
  const all = [...D.genDTPreset('xor', 60, 30), ...D.genDTPreset('circles', 60, 30), ...D.genKMPreset('smile', 50, 30)]
  for (const p of all) if (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) throw new Error('坐标越界: ' + JSON.stringify(p))
})
check('样本数符合参数约定', () => {
  if (D.genDTPreset('linear', 60, 6).length !== 120) throw new Error('linear 每类60应为120点')
  if (D.genKMPreset('blobs', 50, 4).length !== 150) throw new Error('blobs 三团各50应为150点')
})
check('决策树数据类别均衡', () => {
  const a = D.genDTPreset('linear', 60, 6)
  const zeros = a.filter((p) => p.label === 0).length
  if (zeros !== 60) throw new Error('A 类点数 = ' + zeros)
})
check('案例数据标签非全同（否则无分类意义）', () => {
  for (const id of D.CASE_IDS) {
    const c = D.genCaseDataset(id)
    const ones = c.y.reduce((s, v) => s + v, 0)
    if (ones === 0 || ones === c.y.length) throw new Error(id + ' 标签全同')
  }
})

console.log('')
console.log('【4】createRandom 基础行为')
check('同 seed 的均匀序列一致', () => {
  const a = D.createRandom(42)
  const b = D.createRandom(42)
  for (let i = 0; i < 5; i++) if (a.r() !== b.r()) throw new Error('第 ' + i + ' 个值不一致')
})
check('Box-Muller 正态分布均值 ≈ 0', () => {
  const r = D.createRandom(7)
  let s = 0
  const N = 20000
  for (let i = 0; i < N; i++) s += r.rn()
  const m = s / N
  if (Math.abs(m) > 0.05) throw new Error('均值 = ' + m.toFixed(4))
})
check('Box-Muller 正态分布标准差 ≈ 1', () => {
  const r = D.createRandom(7)
  let s = 0
  let s2 = 0
  const N = 20000
  for (let i = 0; i < N; i++) {
    const v = r.rn()
    s += v
    s2 += v * v
  }
  const sd = Math.sqrt(s2 / N - (s / N) ** 2)
  if (Math.abs(sd - 1) > 0.05) throw new Error('标准差 = ' + sd.toFixed(4))
})
check('shuffle 可复现、保长度、确有打乱', () => {
  const a = D.createRandom(3).shuffle([1, 2, 3, 4, 5, 6, 7, 8])
  const b = D.createRandom(3).shuffle([1, 2, 3, 4, 5, 6, 7, 8])
  if (!eq(a, b)) throw new Error('shuffle 不可复现')
  if (a.length !== 8) throw new Error('长度变了')
  if (eq(a, [1, 2, 3, 4, 5, 6, 7, 8])) throw new Error('未真正打乱')
})

console.log('')
console.log(`===== ${pass} 通过 / ${fail} 失败 =====`)
fs.rmSync(OUT_DIR, { recursive: true, force: true })
process.exit(fail ? 1 : 0)