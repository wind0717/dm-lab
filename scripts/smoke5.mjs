// 冒烟测试 5：三个新推演页签（逻辑回归 / kNN / 朴素贝叶斯）
// 连 Kimi Work 管理的 dev 预览 http://localhost:7100/（不自起服务器；若不通可 BASE_URL=http://localhost:3100/）
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

const clickTestId = async (tid) => {
  await page.evaluate((t) => document.querySelector(`[data-testid="${t}"]`)?.click(), tid)
}
const text = async () => page.evaluate(() => document.body.innerText)

try {
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 })
  await sleep(800)
  // 导航到分类实验
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header nav button')].find((b) => b.textContent.includes('分类实验'))
    btn?.click()
  })
  await sleep(600)

  // ========== 1. 逻辑回归推演 ==========
  console.log('\n【逻辑回归推演】')
  await clickTestId('subtab-logreg')
  await sleep(800)
  check('页面打开（画布 + 原理详解卡）', await page.evaluate(() => !!document.querySelector('[data-testid="logreg-canvas"]') && document.body.innerText.includes('原理详解')))
  check('sigmoid 讲解卡存在', await page.evaluate(() => !!document.querySelector('[data-testid="sigmoid-chart"]')))

  const progress0 = await page.evaluate(() => document.querySelector('[data-testid="step-progress"]')?.textContent ?? '')
  // 点 5 次下一步
  for (let i = 0; i < 5; i++) {
    await clickTestId('step-next')
    await sleep(120)
  }
  const progress5 = await page.evaluate(() => document.querySelector('[data-testid="step-progress"]')?.textContent ?? '')
  check('下一步推进迭代', progress5 !== progress0, `${progress0.trim()} → ${progress5.trim()}`)
  check('决策边界直线已渲染', await page.evaluate(() => !!document.querySelector('[data-testid="logreg-boundary"]')))

  // 自动播放若干步
  await clickTestId('step-play')
  await sleep(1500)
  await clickTestId('step-play') // 暂停
  const progressAuto = await page.evaluate(() => document.querySelector('[data-testid="step-progress"]')?.textContent ?? '')
  check('自动播放持续推进', progressAuto !== progress5, `→ ${progressAuto.trim()}`)
  const lossInfo = await page.evaluate(() => {
    const t = document.body.innerText
    const m = t.match(/损失 = ([\d.]+)/)
    return { loss: m ? +m[1] : null, hasChart: !!document.querySelector('svg path[stroke="#4f46e5"]') }
  })
  check('损失数值更新且曲线存在', lossInfo.loss !== null && lossInfo.loss < 1.4 && lossInfo.hasChart, `当前损失 ${lossInfo.loss}`)
  await page.screenshot({ path: '/tmp/smoke5-logreg.png', fullPage: true })

  // ========== 2. kNN 推演 ==========
  console.log('\n【kNN 推演】')
  await clickTestId('subtab-knn')
  await sleep(900)
  check('页面打开（画布 + 投票面板）', await page.evaluate(() => !!document.querySelector('[data-testid="knn-canvas"]') && !!document.querySelector('[data-testid="knn-votes"]')))
  const linkCount = await page.evaluate(() => document.querySelectorAll('[data-testid="knn-link"]').length)
  check('默认 k=5 画出 5 条邻居连线', linkCount === 5, `连线 ${linkCount} 条`)
  check('全图决策区域已着色', await page.evaluate(() => document.querySelectorAll('[data-testid="knn-canvas"] rect').length > 500))

  // 拖动待分类点：把星标拖到左下方
  const before = await page.evaluate(() => document.querySelector('[data-testid="knn-verdict"]')?.textContent ?? '')
  const box = await (await page.$('[data-testid="knn-query"]')).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x - 120, box.y + 100, { steps: 12 })
  await page.mouse.up()
  await sleep(400)
  const after = await page.evaluate(() => ({
    verdict: document.querySelector('[data-testid="knn-verdict"]')?.textContent ?? '',
    dists: document.querySelectorAll('[data-testid="knn-dist-list"] > div').length,
    votes: document.querySelector('[data-testid="knn-votes"]')?.textContent ?? '',
  }))
  check('拖动后投票面板正常显示（距离列表 = k 条）', after.dists === 5, `${after.dists} 条；判定：${after.verdict.trim()}`)
  check('投票条形有票数文本', /票/.test(after.votes), after.votes.replace(/\s+/g, ' ').slice(0, 40))
  console.log(`  ℹ️  拖动前判定「${before.trim()}」→ 拖动后「${after.verdict.trim()}」`)
  await page.screenshot({ path: '/tmp/smoke5-knn.png', fullPage: true })

  // ========== 3. 朴素贝叶斯推演 ==========
  console.log('\n【朴素贝叶斯推演】')
  await clickTestId('subtab-nb')
  await sleep(800)
  check('页面打开（画布 + 先验条形）', await page.evaluate(() => !!document.querySelector('[data-testid="nb-canvas"]') && !!document.querySelector('[data-testid="nb-prior"]')))
  // 第 2 步：高斯曲线
  await clickTestId('step-next')
  await sleep(300)
  check('第 2 步出现两张钟形曲线小图', await page.evaluate(() => !!document.querySelector('[data-testid="nb-gauss-0"]') && !!document.querySelector('[data-testid="nb-gauss-1"]')))
  // 第 3 步：完整演算
  await clickTestId('step-next')
  await sleep(400)
  check('第 3 步演算面板出现（后验条形 + 判定）', await page.evaluate(() => !!document.querySelector('[data-testid="nb-calc"]') && !!document.querySelector('[data-testid="nb-posterior"]') && !!document.querySelector('[data-testid="nb-verdict"]')))
  const nb1 = await page.evaluate(() => document.querySelector('[data-testid="nb-calc"]')?.textContent ?? '')
  check('演算数值完整（先验/密度/分子/归一化）', /P\(A\) = [\d.]+/.test(nb1) && /P\(x₁\|A\) = [\d.]+/.test(nb1) && /分子 = /.test(nb1) && /归一化/.test(nb1))
  // 换一个点
  await clickTestId('nb-shuffle')
  await sleep(400)
  check('"换一个点"后演算面板仍正常', await page.evaluate(() => !!document.querySelector('[data-testid="nb-calc"]') && !!document.querySelector('[data-testid="nb-verdict"]')))
  await page.screenshot({ path: '/tmp/smoke5-nb.png', fullPage: true })

  // ========== 4. 回归检查：旧页签没坏 ==========
  console.log('\n【回归检查 · 旧页签】')
  await clickTestId('subtab-dtree')
  await sleep(700)
  check('决策树逐步推演页仍正常', (await text()).includes('树结构图'))
  await clickTestId('subtab-workbench')
  await sleep(700)
  const introOk = await page.evaluate(() => {
    const summaries = [...document.querySelectorAll('summary')].map((s) => s.textContent)
    return summaries.filter((t) => t.includes('原理详解')).length
  })
  check('工作台方法卡片已升级为「原理详解」（7 个方法）', introOk === 7, `找到 ${introOk} 个`)
  // 展开一个验证内容
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('summary')].find((x) => x.textContent.includes('原理详解'))
    s?.click()
  })
  await sleep(300)
  check('原理详解含核心思路/关键要点/公式直觉', (await text()).includes('核心思路') && (await text()).includes('关键要点') && (await text()).includes('公式直觉'))
  await page.screenshot({ path: '/tmp/smoke5-workbench.png', fullPage: true })

  // ========== console 报错 ==========
  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('DevTools'))
  check('全程 console 无报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || '无报错')
} catch (e) {
  fail++
  console.error('❌ 冒烟测试异常：', e)
  await page.screenshot({ path: '/tmp/smoke5-error.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

console.log(`\n========================================`)
console.log(`冒烟结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
