// 冒烟测试 7：聚类实验「每种方法一个推演页签」改造
// 覆盖：K-Means 推演解说条 / DBSCAN 推演自动播放+评估面板 / 层次推演树状图生长+切一刀 / 工作台回归
// 连 Kimi Work 管理的 dev 预览 http://localhost:7100/（不自起服务器；不通则临时起 3100 --strictPort 并 kill）
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- 探测 7100，不通再临时起 3100 --strictPort ----
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

const clickTestId = async (tid) => {
  await page.evaluate((t) => document.querySelector(`[data-testid="${t}"]`)?.click(), tid)
}
const clickButtonByText = async (txt) => {
  await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))?.click(), txt)
}
const clickNextTimes = async (n) => {
  await page.evaluate(async (k) => {
    for (let i = 0; i < k; i++) {
      const btn = document.querySelector('[data-testid="step-next"]')
      if (!btn || btn.disabled) break
      btn.click()
      await new Promise((r) => setTimeout(r, 0))
    }
  }, n)
}
const text = async () => page.evaluate(() => document.body.innerText)
const progress = async () => page.evaluate(() => document.querySelector('[data-testid="step-progress"]')?.textContent ?? '')

try {
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 })
  await sleep(800)
  check('首页聚类卡片文案已更新', (await text()).includes('三种方法各有逐步推演'))
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header nav button')].find((b) => b.textContent.includes('聚类实验'))
    btn?.click()
  })
  await sleep(600)
  check(
    '子页签栏共 4 个页签',
    await page.evaluate(() => ['kmeans', 'dbscan', 'hier', 'workbench'].every((id) => !!document.querySelector(`[data-testid="subtab-${id}"]`))),
  )

  // ========== 1. K-Means 推演 ==========
  console.log('\n【K-Means 推演】')
  await clickTestId('subtab-kmeans')
  await sleep(800)
  check('页面打开（原理详解卡 + 解说条）', (await text()).includes('原理详解') && (await page.evaluate(() => !!document.querySelector('[data-testid="kmeans-narration"]'))))
  const narr0 = await page.evaluate(() => document.querySelector('[data-testid="kmeans-narration"]')?.textContent ?? '')
  check('初始解说提示先放质心', narr0.includes('质心'), narr0.slice(0, 30) + '…')

  await clickButtonByText('随机放置 K 个质心')
  await sleep(300)
  await clickButtonByText('初始化')
  await sleep(400)
  const narr1 = await page.evaluate(() => document.querySelector('[data-testid="kmeans-narration"]')?.textContent ?? '')
  check('分配步解说出现（食堂类比 + SSE）', narr1.includes('分配步') && narr1.includes('SSE'), narr1.slice(0, 36) + '…')

  await clickButtonByText('更新质心')
  await sleep(400)
  const narr2 = await page.evaluate(() => document.querySelector('[data-testid="kmeans-narration"]')?.textContent ?? '')
  check('更新步解说出现（搬到平均位置）', narr2.includes('更新步'), narr2.slice(0, 36) + '…')

  await clickButtonByText('自动运行')
  await sleep(4000)
  await clickButtonByText('自动运行') // 暂停（若已收敛则按钮无操作）
  const narr3 = await page.evaluate(() => document.querySelector('[data-testid="kmeans-narration"]')?.textContent ?? '')
  check('自动运行后解说推进（SSE 变化或已收敛）', narr3 !== narr1, narr3.slice(0, 40) + '…')
  check('SSE 曲线区域仍在', (await text()).includes('SSE（簇内平方和）随迭代下降'))
  await page.screenshot({ path: '/tmp/smoke7-kmeans.png', fullPage: true })

  // ========== 2. DBSCAN 推演 ==========
  console.log('\n【DBSCAN 推演】')
  await clickTestId('subtab-dbscan')
  await sleep(900)
  check('页面打开（画布 + 原理详解卡）', await page.evaluate(() => !!document.querySelector('[data-testid="dbscan-walk-canvas"]')) && (await text()).includes('原理详解'))
  const dbNarr0 = await page.evaluate(() => document.querySelector('[data-testid="dbscan-narration"]')?.textContent ?? '')
  check('初始解说出现（准备好了）', dbNarr0.includes('准备好了'), dbNarr0.slice(0, 30) + '…')

  await clickNextTimes(3)
  await sleep(400)
  const dbNarr1 = await page.evaluate(() => document.querySelector('[data-testid="dbscan-narration"]')?.textContent ?? '')
  check('逐步解说出现（检查点/画圈/队列）', /检查点|队列里的点/.test(dbNarr1), dbNarr1.slice(0, 40) + '…')
  const dbP3 = await progress()

  await clickTestId('step-play')
  await sleep(2500)
  await clickTestId('step-play') // 暂停
  const dbPAuto = await progress()
  check('自动播放持续推进', dbPAuto !== dbP3, `${dbP3.trim()} → ${dbPAuto.trim()}`)

  // 切到「三个团簇」（分离良好、结果确定）再跑到终态，避免圆环偶发并簇带来的抖动
  await clickTestId('cluster-preset-blobs')
  await sleep(700)
  await clickTestId('walk-finish')
  await sleep(800)
  check('推演到终态（完成标记）', await page.evaluate(() => !!document.querySelector('[data-testid="dbscan-done"]')))
  check('结束解说出现（全部点处理完毕）', (await page.evaluate(() => document.querySelector('[data-testid="dbscan-narration"]')?.textContent ?? '')).includes('全部点处理完毕'))
  const dbStats = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="dbscan-stats"]')
    return el ? el.innerText : ''
  })
  check('结束态统计卡（簇数/核心/边界/噪声）', /簇数/.test(dbStats) && /核心点/.test(dbStats) && /边界点/.test(dbStats) && /噪声点/.test(dbStats), dbStats.replace(/\n/g, ' ').slice(0, 60))
  check('三个团簇分出 3 簇', await page.evaluate(() => document.querySelector('[data-testid="dbscan-stats"]')?.innerText.match(/簇数（自动长出）\s*(\d+)/)?.[1] === '3'))
  check('噪声点样式（灰色 ×）出现', await page.evaluate(() => document.querySelectorAll('[data-testid="dbscan-noise"]').length > 0))
  check('评估面板接入（轮廓条形图）', await page.evaluate(() => !!document.querySelector('[data-testid="silhouette-chart"]')))
  check('讲解卡：不用定 K + 异常检测', (await text()).includes('不用告诉它分几类') && (await text()).includes('异常检测'))
  await page.screenshot({ path: '/tmp/smoke7-dbscan.png', fullPage: true })

  // ========== 3. 层次聚类推演 ==========
  console.log('\n【层次聚类推演】')
  await clickTestId('subtab-hier')
  await sleep(900)
  check('页面打开（画布 + 树状图 + 原理详解卡）', await page.evaluate(() => !!document.querySelector('[data-testid="hier-walk-canvas"]') && !!document.querySelector('[data-testid="dendrogram"]')) && (await text()).includes('原理详解'))
  check('树状图初始无合并枝', (await page.evaluate(() => document.querySelectorAll('[data-testid="dendro-merge"]').length)) === 0)

  await clickNextTimes(5)
  await sleep(500)
  check('树状图随合并生长（5 根新枝）', (await page.evaluate(() => document.querySelectorAll('[data-testid="dendro-merge"]').length)) === 5)
  check('合并闪烁高亮出现', (await page.evaluate(() => document.querySelectorAll('[data-testid="hier-flash"]').length)) > 0)
  const hierNarr = await page.evaluate(() => document.querySelector('[data-testid="hier-narration"]')?.textContent ?? '')
  check('合并解说出现（最近的两个群体）', hierNarr.includes('最近的两个群体') && hierNarr.includes('合并'), hierNarr.slice(0, 44) + '…')

  // 切换 linkage → 重置
  await clickTestId('linkage-single')
  await sleep(600)
  const hierP0 = await progress()
  check('切换 linkage 后推演重置', hierP0.trim().startsWith('0'), hierP0.trim())

  await clickTestId('walk-finish')
  await sleep(800)
  check('推演到终态（树已建成）', await page.evaluate(() => !!document.querySelector('[data-testid="hier-done"]')))
  check('树状图长满 + 切割线出现', await page.evaluate(() => {
    const merges = document.querySelectorAll('[data-testid="dendro-merge"]').length
    return merges > 50 && !!document.querySelector('[data-testid="dendro-cutline"]')
  }))
  check('切一刀面板出现', await page.evaluate(() => !!document.querySelector('[data-testid="hier-cut-panel"]')))

  // 快捷切簇按钮改簇数
  await clickTestId('cut-k-2')
  await sleep(500)
  check('切成 2 簇生效', (await text()).includes('当前切成 2 个簇'))
  await clickTestId('cut-k-4')
  await sleep(500)
  check('切成 4 簇生效', (await text()).includes('当前切成 4 个簇'))
  await clickTestId('cut-k-3')
  await sleep(500)
  check('切成 3 簇生效（评估面板接入）', (await text()).includes('当前切成 3 个簇') && (await page.evaluate(() => !!document.querySelector('[data-testid="silhouette-chart"]'))))
  check('linkage 讲解卡出现', (await text()).includes('拉链条'))
  await page.screenshot({ path: '/tmp/smoke7-hier.png', fullPage: true })

  // ========== 4. 多方法对比工作台回归 ==========
  console.log('\n【多方法对比工作台 · 回归】')
  await clickTestId('subtab-workbench')
  await sleep(900)
  const wbText = await text()
  check('工作台标题与引导文案更新', wbText.includes('多方法对比工作台') && wbText.includes('单独逐步推演见前面三个页签'))
  check('概念卡仍在', wbText.includes('聚类没有标准答案'))
  // 切到层次聚类方法卡，跑一次（工作台内 Dendrogram 抽取后仍正常）
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('p')].find((el) => el.textContent === '层次聚类（凝聚式）')
    p?.closest('div[class*="cursor-pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await sleep(500)
  await clickButtonByText('直接出结果') // 第一次：建树
  await sleep(300)
  await clickButtonByText('直接出结果') // 第二次：跳到合并完成
  await sleep(1200)
  check('工作台层次聚类直接出结果（树状图渲染）', await page.evaluate(() => !!document.querySelector('[data-testid="dendrogram"]')))
  check('工作台评估面板仍在', (await text()).includes('聚类评估（随结果实时重算）'))
  await page.screenshot({ path: '/tmp/smoke7-workbench.png', fullPage: true })

  // ========== console 报错 ==========
  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('DevTools'))
  check('全程 console 无报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || '无报错')
} catch (e) {
  fail++
  console.error('❌ 冒烟测试异常：', e)
  await page.screenshot({ path: '/tmp/smoke7-error.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  devProc?.kill()
}

console.log(`\n========================================`)
console.log(`冒烟结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
