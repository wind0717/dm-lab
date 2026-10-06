// 冒烟测试：打开工作台 → 训练 → 横向对比 → 切决策树子页签
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

const clickByText = async (text, tag = 'button') => {
  const ok = await page.evaluate(
    (t, tg) => {
      const el = [...document.querySelectorAll(tg)].find((b) => b.textContent.includes(t))
      if (el) { el.click(); return true }
      return false
    },
    text,
    tag,
  )
  console.log(`${ok ? '✅ 点击' : '❌ 未找到'} "${text}"`)
  return ok
}

await page.goto('http://localhost:7100/', { waitUntil: 'networkidle0', timeout: 30000 })
console.log('首页标题：', await page.evaluate(() => document.body.innerText.slice(0, 40)))

await clickByText('② 分类实验')
await new Promise((r) => setTimeout(r, 600))
console.log('包含"多方法对比工作台"：', await page.evaluate(() => document.body.innerText.includes('多方法对比工作台')))

await clickByText('开始训练')
await new Promise((r) => setTimeout(r, 1500))
console.log('包含"混淆矩阵"：', await page.evaluate(() => document.body.innerText.includes('混淆矩阵')))
console.log('包含"AUC"：', await page.evaluate(() => document.body.innerText.includes('AUC')))

await clickByText('全部方法横向对比')
await new Promise((r) => setTimeout(r, 3000))
console.log('包含"训练耗时"：', await page.evaluate(() => document.body.innerText.includes('训练耗时')))

await clickByText('决策树逐步推演')
await new Promise((r) => setTimeout(r, 800))
console.log('包含"逐步推演"：', await page.evaluate(() => document.body.innerText.includes('逐步推演')))

await clickByText('多方法对比工作台')
await clickByText('商品质检判定')
await clickByText('开始训练')
await new Promise((r) => setTimeout(r, 1500))
console.log('包含"决策区域"：', await page.evaluate(() => document.body.innerText.includes('决策区域')))

console.log(errors.length ? `\n❌ 页面错误：\n${errors.join('\n')}` : '\n✅ 无控制台/运行时错误')
await browser.close()
process.exit(errors.length ? 1 : 0)
