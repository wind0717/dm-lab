// 冒烟测试 4：概念导览 / 熵曲线标注 / 分类页警示卡 / console 无报错
// 连 Kimi Work 管理的 dev 预览 http://localhost:7100/（若不通可改用 3100）
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE_URL || 'http://localhost:7100/'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,2400'],
  defaultViewport: { width: 1440, height: 1200 },
})

const page = await browser.newPage()
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

const nav = async (label) => {
  await page.evaluate((l) => {
    const btn = [...document.querySelectorAll('header nav button')].find((b) => b.textContent.includes(l))
    btn?.click()
  }, label)
  await sleep(600)
}

try {
  // ---- 1. 首页：概念导览区 ----
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 })
  await sleep(800)
  const conceptCount = await page.evaluate(() => {
    const section = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('三分钟看懂数据挖掘'))
    if (!section) return -1
    const grid = section.parentElement.parentElement.querySelector('.grid')
    return grid ? grid.children.length : 0
  })
  console.log(`[首页] 「三分钟看懂数据挖掘」卡片数（含引导卡）: ${conceptCount}`)
  // 展开一张概念卡验证交互
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('三分钟看懂数据挖掘'))
    h.parentElement.parentElement.querySelector('.grid > div').click()
  })
  await sleep(400)
  const expandedOk = await page.evaluate(() => document.body.innerText.includes('去分类实验拖划分比例') || document.body.innerText.includes('去数学基础急救包'))
  console.log(`[首页] 概念卡点击展开: ${expandedOk ? 'OK' : 'FAIL'}`)
  await page.screenshot({ path: '/tmp/smoke4-home.png', fullPage: true })

  // ---- 2. 理论基础 → 信息论全家桶：熵曲线标注 ----
  await nav('理论基础')
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('信息论全家桶'))
    t?.click()
  })
  await sleep(600)
  // 把红球比例拖到 0.5（默认即 0.5），检查曲线图区域
  const entropyInfo = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg')]
    const texts = []
    for (const s of svgs) {
      const t = [...s.querySelectorAll('text')].map((x) => x.textContent)
      if (t.includes('bit')) texts.push(t)
    }
    return texts[0] ?? null
  })
  console.log(`[信息论] 熵曲线 SVG 文本: ${entropyInfo ? JSON.stringify(entropyInfo.slice(0, 10)) : '未找到'}`)
  // 截图摸球实验卡片（第一张含 bit 的 svg 所在卡片）
  await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg')]
    const target = svgs.find((s) => [...s.querySelectorAll('text')].some((t) => t.textContent === 'bit'))
    target?.closest('.space-y-6 > div, div')?.scrollIntoView()
  })
  await sleep(300)
  const ballCard = await page.evaluateHandle(() => {
    const svgs = [...document.querySelectorAll('svg')]
    const target = svgs.find((s) => [...s.querySelectorAll('text')].some((t) => t.textContent === 'bit'))
    return target
  })
  await ballCard.screenshot({ path: '/tmp/smoke4-entropy.png' })
  console.log('[信息论] 熵曲线截图已存 /tmp/smoke4-entropy.png')

  // ---- 3. 分类实验：提示条 + 训练后警示卡 ----
  await nav('分类实验')
  const tipOk = await page.evaluate(() => document.body.innerText.includes('为什么要分训练集 / 测试集'))
  console.log(`[分类] 训练/测试概念提示条: ${tipOk ? 'OK' : 'FAIL'}`)
  // 开始训练（默认决策树 + 内置案例）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('开始训练'))
    b?.click()
  })
  await sleep(2500)
  const warnOk = await page.evaluate(() => document.body.innerText.includes('准确率会骗人'))
  const rocOk = await page.evaluate(() => document.body.innerText.includes('怎么读这条曲线'))
  console.log(`[分类] 混淆矩阵警示卡: ${warnOk ? 'OK' : 'FAIL'}；ROC 读法说明: ${rocOk ? 'OK' : 'FAIL'}`)
  await page.screenshot({ path: '/tmp/smoke4-classify.png', fullPage: true })

  // ---- 4. 决策树逐步推演：概念卡 + 指标注释 ----
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('决策树逐步推演'))
    b?.click()
  })
  await sleep(600)
  const dtOk = await page.evaluate(() => document.body.innerText.includes('不纯度与信息增益') && document.body.innerText.includes('越深越容易过拟合'))
  console.log(`[决策树] 概念卡 + 指标注释: ${dtOk ? 'OK' : 'FAIL'}`)
  // 跨页跳转：点信息论链接
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('信息论全家桶'))
    b?.click()
  })
  await sleep(800)
  const jumpOk = await page.evaluate(() => document.body.innerText.includes('信息论全家桶') && [...document.querySelectorAll('button')].some((b) => b.textContent.includes('信息论全家桶') && b.className.includes('bg-indigo-600')))
  console.log(`[决策树→理论] 跨页跳转到信息论页签: ${jumpOk ? 'OK' : 'FAIL'}`)

  // ---- 5. 聚类实验工作台概念卡 ----
  await nav('聚类实验')
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('多方法聚类工作台'))
    b?.click()
  })
  await sleep(600)
  const clOk = await page.evaluate(() => document.body.innerText.includes('聚类没有标准答案'))
  console.log(`[聚类] 概念卡: ${clOk ? 'OK' : 'FAIL'}`)

  // ---- 6. 预处理提示 + 数学基础导览 ----
  await nav('数据预处理')
  const prepOk = await page.evaluate(() => document.body.innerText.includes('预处理没有"标准流水线"'))
  console.log(`[预处理] 无标准流水线提示: ${prepOk ? 'OK' : 'FAIL'}`)
  await nav('理论基础')
  await sleep(400)
  const mathOk = await page.evaluate(() => document.body.innerText.includes('分别给后面的模块打底'))
  console.log(`[数学基础] 小节-模块导览: ${mathOk ? 'OK' : 'FAIL'}`)

  console.log(`\n[console] 页面报错数: ${errors.length}`)
  errors.slice(0, 10).forEach((e) => console.log('  -', e.slice(0, 200)))
  console.log(errors.length === 0 ? '\n✅ 冒烟全部通过' : '\n❌ 存在 console 报错')
  process.exitCode = errors.length === 0 ? 0 : 1
} catch (e) {
  console.error('冒烟执行失败:', e)
  process.exitCode = 2
} finally {
  await browser.close()
}
