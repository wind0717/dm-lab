// 第二批功能冒烟测试：理论基础三页签 + 数据预处理流水线 + 送去分类联动
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:3100'

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 950 })

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

let pass = 0
let fail = 0
const check = async (name, fn) => {
  const ok = await fn()
  console.log(`${ok ? '✅' : '❌'} ${name}`)
  ok ? pass++ : fail++
}
const hasText = (t) => page.evaluate((x) => document.body.innerText.includes(x), t)
const clickByText = async (text, tag = 'button') => {
  const ok = await page.evaluate(
    (t, tg) => {
      const el = [...document.querySelectorAll(tg)].find((b) => b.textContent.trim().includes(t))
      if (el) {
        el.click()
        return true
      }
      return false
    },
    text,
    tag,
  )
  return ok
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 30000 })

// ---------- 首页 ----------
await check('首页加载（含 5 张模块卡）', async () => (await hasText('数据预处理')) && (await hasText('理论基础')) && (await hasText('决策树逐步推演')))

// ---------- 理论基础 ----------
await clickByText('理论基础')
await sleep(600)
await check('理论基础 · 数学基础页签（掷硬币/正态/向量/距离/矩阵）', async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return ['掷硬币', '钟形曲线', '极端值的破坏力', '余弦相似度', '维度灾难', '曼哈顿', '一张表就是一个矩阵'].every((s) => t.includes(s))
})
await clickByText('抽样 100 次')
await sleep(400)
await check('掷硬币抽样出结果（最终频率）', () => hasText('最终频率'))

await clickByText('信息论全家桶')
await sleep(600)
await check('信息论页签（保留摸球/分裂点 + 新增 4 节）', async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return ['摸球实验', '分裂点拖动', '联合熵与条件熵', '互信息', 'KL 散度与交叉熵', '信息增益率', '按学号分裂'].every((s) => t.includes(s))
})
await clickByText('完全独立')
await sleep(300)
await check('联合熵表"完全独立"预设 → 互信息≈0', async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return t.includes('两者独立')
})

await clickByText('GINI 与不纯度家族')
await sleep(500)
await check('GINI 家族页签（三曲线同框 + 工程建议）', async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return ['不纯度家族同框', '误分类误差', '选 gini 还是 entropy'].every((s) => t.includes(s))
})

// ---------- 数据预处理 ----------
await clickByText('数据预处理')
await sleep(700)
await check('预处理页加载（原始数据/流水线/处理后三栏）', async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return ['原始数据', '处理操作流水线', '缺失值处理', 'SMOTE', '处理后'].every((s) => t.includes(s))
})

// 勾选 5 个操作（跳过离散化，保留数值列以便送去分类）
const clickedBoxes = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('button[role="checkbox"]')]
  ;[0, 1, 2, 4, 5].forEach((i) => boxes[i]?.click())
  return boxes.length
})
await sleep(600)
await check(`勾选 5 个预处理操作（页面共 ${clickedBoxes} 个 checkbox）`, () => hasText('启用了 5 个操作'))
await check('SMOTE 生效（样本数变多）', () => hasText('SMOTE 后'))
await check('统计量对比表出现 前后 箭头', () => hasText('→'))

// ---------- 联动：送去分类 ----------
const sent = await clickByText('处理完，送去分类实验')
await sleep(800)
await check('点击"送去分类"→ 跳转分类实验并载入接力数据', async () => {
  if (!sent) return false
  const t = await page.evaluate(() => document.body.innerText)
  return t.includes('多方法对比工作台') && t.includes('已载入来自「数据预处理」的数据')
})
// 在接力数据上训练决策树
await clickByText('开始训练')
await sleep(1500)
await check('接力数据上训练成功（混淆矩阵出现）', () => hasText('混淆矩阵'))

console.log(`\n冒烟结果：${pass} 通过 / ${fail} 失败`)
console.log(errors.length ? `页面报错 ${errors.length} 条：\n${errors.join('\n')}` : '无页面报错')
await browser.close()
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
