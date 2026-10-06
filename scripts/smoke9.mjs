// 冒烟测试 9：理论基础四个子页签 + 新增七节的交互
// 覆盖：贝叶斯点阵/滑块联动、相关系数预设切换、梯度下降自动收敛、打靶图四象限、
//       交叉验证 5 轮出平均分、数据类型练习判分、PCA 投影动画、四个页签全部可打开、console 无报错
// 连 Kimi Work 管理的 dev 预览 http://localhost:7100/（不自起服务器；不通则临时起 3100 --strictPort 并 kill）
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return res.ok || res.status === 304
  } catch {
    return false
  }
}

let BASE = 'http://localhost:7100/'
let devProc = null
if (!(await reachable(BASE))) {
  console.log('ℹ️  7100 不通，临时启动 dev 服务器（3100 --strictPort）…')
  devProc = spawn('npm', ['run', 'dev', '--', '--port', '3100', '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' })
  BASE = 'http://localhost:3100/'
  let ok = false
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    if (await reachable(BASE)) {
      ok = true
      break
    }
  }
  if (!ok) {
    console.error('❌ 临时 dev 服务器也起不来')
    devProc?.kill()
    process.exit(1)
  }
}
console.log(`ℹ️  目标：${BASE}`)

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

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ' —— ' + detail : ''}`)
  } else {
    fail++
    console.error(`  ❌ ${name}${detail ? ' —— ' + detail : ''}`)
  }
}
const text = () => page.evaluate(() => document.body.innerText)
const clickButtonByText = async (txt) => {
  await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))?.click(), txt)
}
const shotAt = async (testid, path) => {
  await page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.scrollIntoView({ block: 'center' }), testid)
  await sleep(400)
  await page.screenshot({ path })
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 })
  await sleep(800)

  // 进入「理论基础」
  await page.evaluate(() => {
    ;[...document.querySelectorAll('header nav button')].find((b) => b.textContent.includes('理论基础'))?.click()
  })
  await sleep(600)

  // ---- 四个子页签全部存在 ----
  const tabText = await text()
  check(
    '四个理论子页签全部渲染',
    ['数学基础急救包', '信息论全家桶', 'GINI 与不纯度家族', '模型思维实验室'].every((t) => tabText.includes(t)),
  )

  // ================= 数学急救包：贝叶斯 =================
  check('贝叶斯小节出现', tabText.includes('贝叶斯定理：体检阳性'))
  check('贝叶斯点阵渲染（1000 个点）', (await page.evaluate(() => document.querySelectorAll('[data-testid="bayes-grid"] > span').length)) === 1000)
  const post0 = await page.$eval('[data-testid="bayes-posterior"]', (el) => el.textContent)
  check('默认参数后验 ≈ 16.7%', post0.trim() === '16.7%', post0)
  // 拖患病率滑块（聚焦 Radix slider thumb + 方向键）
  await page.focus('[data-testid="bayes-prev"] [role="slider"]')
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp')
  await sleep(400)
  const post1 = await page.$eval('[data-testid="bayes-posterior"]', (el) => el.textContent)
  check('拖患病率滑块后后验概率变化（16.7% → 更高）', post1.trim() !== post0.trim() && parseFloat(post1) > parseFloat(post0), `${post0} → ${post1}`)
  await shotAt('bayes-grid', '/tmp/smoke9-bayes.png')

  // ================= 数学急救包：协方差 =================
  check('协方差小节出现', (await text()).includes('协方差与相关系数'))
  check('相关系数画布 40 个点渲染', (await page.evaluate(() => document.querySelectorAll('[data-testid="cov-canvas"] circle').length)) === 40)
  const r0 = parseFloat(await page.$eval('[data-testid="cov-r"]', (el) => el.textContent))
  check('默认正相关预设 r > 0.9', r0 > 0.9, `r = ${r0}`)
  await page.click('[data-testid="cov-preset-negative"]')
  await sleep(300)
  const rNeg = parseFloat(await page.$eval('[data-testid="cov-r"]', (el) => el.textContent))
  check('切到负相关预设 r < −0.9', rNeg < -0.9, `r = ${rNeg}`)
  await page.click('[data-testid="cov-preset-nonlinear"]')
  await sleep(300)
  const rNl = parseFloat(await page.$eval('[data-testid="cov-r"]', (el) => el.textContent))
  check('切到非线性预设 |r| < 0.15（r≈0 但有关系）', Math.abs(rNl) < 0.15, `r = ${rNl}`)
  await shotAt('cov-canvas', '/tmp/smoke9-corr.png')

  // ================= 模型思维实验室 =================
  await clickButtonByText('模型思维实验室')
  await sleep(700)

  // ---- 1. 数据类型 ----
  const mtText = await text()
  check('数据类型四张卡渲染', ['定类（名义）', '定序（有序）', '定距（区间）', '定比（比率）'].every((t) => mtText.includes(t)) && mtText.includes('判断小练习'))
  // 答对一题：邮政编码 → 定类
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="quiz-row-0"]')
    ;[...row.querySelectorAll('button')].find((b) => b.textContent.trim() === '定类')?.click()
  })
  await sleep(200)
  // 答错一题：气温 → 定比（应为定距）
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="quiz-row-2"]')
    ;[...row.querySelectorAll('button')].find((b) => b.textContent.trim() === '定比')?.click()
  })
  await sleep(200)
  const score = await page.$eval('[data-testid="quiz-score"]', (el) => el.textContent)
  check('练习可作答判分（答对 1 / 6）', score.includes('答对') && score.includes('1'), score.replace(/\s+/g, ' '))
  const row2Text = await page.$eval('[data-testid="quiz-row-2"]', (el) => el.textContent)
  check('答错显示解析与正确答案', row2Text.includes('应为「定距」') && row2Text.includes('0℃'))
  await shotAt('quiz-list', '/tmp/smoke9-datatypes.png')

  // ---- 2. 梯度下降 ----
  await page.click('[data-testid="gd-auto"]')
  let gdOk = false
  for (let i = 0; i < 40; i++) {
    await sleep(300)
    const s = await page.$eval('[data-testid="gd-status"]', (el) => el.textContent)
    if (s.includes('已收敛')) {
      gdOk = true
      break
    }
  }
  check('梯度下降自动下降到谷底（12s 内收敛）', gdOk)
  const wFinal = await page.$eval('[data-testid="gd-w"]', (el) => el.textContent)
  check('收敛后 w ≈ 2', Math.abs(parseFloat(wFinal) - 2) < 0.01, `w = ${wFinal}`)
  await shotAt('gd-canvas', '/tmp/smoke9-gd.png')

  // ---- 3. 偏差与方差 ----
  const targetCount = await page.evaluate(() => document.querySelectorAll('[data-testid="bv-target"]').length)
  check('打靶图四象限渲染', targetCount === 4, `${targetCount} 个靶子`)
  const shotCount = await page.evaluate(() => document.querySelectorAll('[data-testid="bv-targets"] svg circle').length)
  check('弹着点云渲染（≥ 4×8 个弹孔）', shotCount >= 32, `${shotCount} 个圆`)
  await page.click('[data-testid="bv-reroll"]')
  await sleep(300)
  check('重新打一轮可点击', true)
  await shotAt('bv-targets', '/tmp/smoke9-bv.png')

  // ---- 4. 交叉验证 ----
  check('交叉验证 5 折数据条渲染', (await page.evaluate(() => document.querySelectorAll('[data-testid="cv-bar"] > div').length)) === 5)
  for (let i = 0; i < 5; i++) {
    await page.click('[data-testid="cv-next"]')
    await sleep(250)
  }
  const cvSummary = await page.evaluate(() => document.querySelector('[data-testid="cv-summary"]')?.textContent ?? '')
  check('走满 5 轮出现平均分 ± 波动', cvSummary.includes('平均准确率') && cvSummary.includes('±'), cvSummary.replace(/\s+/g, ' ').slice(0, 60))
  await shotAt('cv-bar', '/tmp/smoke9-cv.png')

  // ---- 5. PCA ----
  check('PCA 点云渲染（120 个点）', (await page.evaluate(() => document.querySelectorAll('[data-testid="pca-canvas"] circle').length)) >= 120)
  await page.click('[data-testid="pca-step1"]')
  await sleep(300)
  const ratio = await page.$eval('[data-testid="pca-ratio"]', (el) => el.textContent)
  check('① 找出主轴：方差保留率显示（>90%）', parseFloat(ratio) > 90, ratio)
  await page.click('[data-testid="pca-step2"]')
  await sleep(2000)
  check('② 投影动画播放完成（1D 投影带出现）', (await page.$('[data-testid="pca-1d"]')) !== null)
  await shotAt('pca-canvas', '/tmp/smoke9-pca.png')

  // ================= 其余两个旧页签不受影响 =================
  await clickButtonByText('信息论全家桶')
  await sleep(600)
  check('信息论页签正常打开', (await text()).includes('熵'))
  await clickButtonByText('GINI 与不纯度家族')
  await sleep(600)
  check('GINI 页签正常打开', /基尼|Gini/i.test(await text()))
  await clickButtonByText('数学基础急救包')
  await sleep(400)
  check('数学页签可切回（旧小节完好）', (await text()).includes('掷硬币') && (await text()).includes('一张表就是一个矩阵'))

  // console 报错
  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('DevTools'))
  check('全程 console 无报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || '无报错')
} catch (e) {
  fail++
  console.error('❌ 冒烟测试异常：', e)
  await page.screenshot({ path: '/tmp/smoke9-error.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  devProc?.kill()
}

console.log(`\n========================================`)
console.log(`冒烟结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
