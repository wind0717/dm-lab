// 第三批功能冒烟测试：聚类实验大改版 + 关联分析
// 运行前先起 dev 服务器：npm run dev -- --port 3100
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.BASE || 'http://localhost:3100'

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })

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
// 点方法卡片：精确命中 cursor-pointer 的卡片 div（避免点到祖先容器）
const clickMethodCard = (name) =>
  page.evaluate((n) => {
    const el = [...document.querySelectorAll('div.cursor-pointer')].find((d) => d.textContent.includes(n))
    if (el) {
      el.click()
      return true
    }
    return false
  }, name)
const waitText = async (t, timeout = 60000) => {
  try {
    await page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t)
    return true
  } catch {
    return false
  }
}

await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 30000 })

// ---------- 首页 ----------
await check('首页加载（6 张模块卡：聚类实验 + 关联分析）', async () => (await hasText('K-Means · DBSCAN · 层次聚类')) && (await hasText('购物篮里的秘密')))

// ---------- 聚类实验 · K-Means 分步实验（原有内容保留） ----------
await clickByText('聚类实验')
await sleep(800)
await check('K-Means 分步实验页签保留（放置质心 / 分配点）', async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return t.includes('放置质心') && t.includes('分配点') && t.includes('聚类评估')
})

// ---------- 多方法聚类工作台 ----------
await clickByText('多方法聚类工作台')
await sleep(600)
await check('工作台加载（三种方法卡片 + 使用场景）', async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return ['DBSCAN', '层次聚类', '使用场景', '预设数据集', 'CSV 上传', '手绘点击'].every((s) => t.includes(s))
})

// DBSCAN 自动播放
await clickMethodCard('DBSCAN')
await sleep(300)
await clickByText('自动播放')
const dbDone = await waitText('运行完成', 60000)
await check('DBSCAN 自动播放完成（分出簇）', () => dbDone)
await check('DBSCAN 后画布出现簇色圆点', async () => {
  return await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="cluster-canvas"]')
    if (!svg) return false
    const colored = [...svg.querySelectorAll('circle')].filter((c) => ['#f97316', '#3b82f6', '#10b981'].includes(c.getAttribute('fill')))
    return colored.length > 10
  })
})
await check('评估面板出现轮廓系数数值', async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return t.includes('轮廓系数') && t.includes('Calinski-Harabasz') && t.includes('Davies-Bouldin')
})

// 层次聚类自动播放
await clickMethodCard('层次聚类')
await sleep(400)
await clickByText('自动播放')
const hierDone = await waitText('合并完成', 60000)
await check('层次聚类自动播放完成', () => hierDone)
await check('树状图渲染（dendrogram + 切一刀）', async () => {
  const d = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="dendrogram"]')
    return svg !== null && svg.querySelectorAll('line').length > 10
  })
  return d && (await hasText('切一刀'))
})

// ---------- 关联分析 ----------
await clickByText('关联分析')
await sleep(800)
await check('关联分析页加载（理论区：支持度/置信度/提升度/格图）', async () => {
  const t = await page.evaluate(() => document.body.innerText)
  return ['购物篮里的秘密', '支持度', '置信度', '提升度', '项集格'].every((s) => t.includes(s))
})

// 格图剪枝
const latticeOk = await page.evaluate(() => {
  const svg = document.querySelector('[data-testid="lattice"]')
  if (!svg) return false
  // 找一个非频繁的单项节点（有超集可剪）
  const nodes = [...svg.querySelectorAll('g[data-frequent="false"]')]
  const single = nodes.find((g) => (g.getAttribute('data-key') || '').split('|').length <= 2)
  if (!single) return false
  single.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return true
})
await sleep(600)
await check('格图可点击剪枝（点击非频繁节点 → 超集变灰）', async () => {
  if (!latticeOk) return false
  return await page.evaluate(() => document.querySelectorAll('[data-testid="lattice"] g[opacity="0.18"]').length > 0)
})

// Apriori 自动播放
await clickByText('自动播放')
const aprDone = await waitText('挖掘完成', 60000)
await check('Apriori 自动播放挖完', () => aprDone)
await check('规则表非空（含支持度/置信度/提升度数值）', async () => {
  const n = await page.evaluate(() => document.querySelectorAll('[data-testid="rules-table"] tbody tr').length)
  return n > 0 && (await hasText('最强规则'))
})
await check('动态结论文案生成（提升度倍数解释）', () => hasText('可能性是平均水平的'))

console.log(`\n冒烟结果：${pass} 通过 / ${fail} 失败`)
console.log(errors.length ? `页面报错 ${errors.length} 条：\n${errors.join('\n')}` : '无页面报错')
await browser.close()
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
