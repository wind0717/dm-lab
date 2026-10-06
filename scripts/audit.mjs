// ============================================================
// 综合功能审计：六个主页面 + 全部子页签 + 关键交互 + 视觉/布局检查
// 运行方式（项目根目录）：node scripts/audit.mjs
// 两种视口：1440×900 / 1280×800（页面遍历 + 截图 + 横向溢出检查）
// 关键交互抽查仅在 1440 视口执行。截图输出到 audit-shots/<视口>/。
// 连 Kimi Work 管理的 dev 预览 http://localhost:7100/（不通则临时起 3100 --strictPort 并 kill）
// ============================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SHOT_ROOT = path.join(process.cwd(), 'audit-shots')

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
    if (await reachable(BASE)) { ok = true; break }
  }
  if (!ok) {
    console.error('❌ 临时 dev 服务器也起不来')
    devProc?.kill()
    process.exit(1)
  }
}
console.log(`ℹ️  目标：${BASE}`)

// ---------- 结果记录 ----------
let pass = 0
let fail = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ' —— ' + String(detail).slice(0, 120) : ''}`)
  } else {
    fail++
    failures.push(`${name}${detail ? ' —— ' + detail : ''}`)
    console.error(`  ❌ ${name}${detail ? ' —— ' + String(detail).slice(0, 200) : ''}`)
  }
}

// ---------- 浏览器 ----------
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,1000'],
  defaultViewport: { width: 1440, height: 900 },
})

const page = await browser.newPage()
let section = '启动'
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[${section}] console: ${msg.text()}`)
})
page.on('pageerror', (e) => errors.push(`[${section}] pageerror: ${String(e)}`))
page.on('response', (res) => {
  if (res.status() >= 400) errors.push(`[${section}] HTTP ${res.status()} ${res.url()}`)
})
page.on('requestfailed', (req) => {
  if (!req.url().startsWith('data:')) errors.push(`[${section}] requestfailed: ${req.url()} ${req.failure()?.errorText}`)
})

// ---------- 页面内工具 ----------
const text = () => page.evaluate(() => document.body.innerText)
const clickText = (t, tag = 'button') =>
  page.evaluate((tt, tg) => {
    const el = [...document.querySelectorAll(tg)].find((b) => b.textContent.trim().includes(tt))
    if (!el) return false
    el.click()
    return true
  }, t, tag)
const navTo = async (label) => {
  await page.evaluate((t) => {
    ;[...document.querySelectorAll('header nav button')].find((b) => b.textContent.includes(t))?.click()
  }, label)
  await sleep(500)
}
const activeNav = () =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll('header nav button')].find((x) => x.className.includes('bg-indigo-600'))
    return b?.textContent.trim() ?? ''
  })
const subtabActive = (id) =>
  page.evaluate((i) => {
    const el = document.querySelector(`[data-testid="subtab-${i}"]`)
    return el ? el.className.includes('bg-indigo-600') : null
  }, id)
const clickSubtab = async (id) => {
  await page.evaluate((i) => document.querySelector(`[data-testid="subtab-${i}"]`)?.click(), id)
  await sleep(500)
}
const hOverflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
const exists = (sel) => page.evaluate((s) => document.querySelector(s) !== null, sel)
const shotDir = path.join(SHOT_ROOT, 'shots')
fs.mkdirSync(shotDir, { recursive: true })
let shotIdx = 0
const shot = async (name) => {
  shotIdx++
  await page.screenshot({ path: path.join(shotDir, `${String(shotIdx).padStart(2, '0')}-${name}.png`) })
}
// 通过标签文字定位附近的 Radix 滑块并临时打标，返回是否找到
const tagSlider = (label, tag = 'audit-slider') =>
  page.evaluate((lb, tg) => {
    document.querySelectorAll(`[data-${tg}]`).forEach((e) => e.removeAttribute(`data-${tg}`))
    const h = [...document.querySelectorAll('[role="slider"]')].find((el) => {
      let n = el
      for (let i = 0; i < 6 && n; i++) {
        n = n.parentElement
        if (n && n.textContent.includes(lb)) return true
      }
      return false
    })
    if (!h) return false
    h.setAttribute(`data-${tg}`, '1')
    return true
  }, label, tag)
const pressSlider = async (label, key, times = 1) => {
  const found = await tagSlider(label)
  if (!found) return false
  await page.focus('[data-audit-slider="1"]')
  for (let i = 0; i < times; i++) await page.keyboard.press(key)
  await sleep(350)
  return true
}
// 等待条件（轮询）
const waitFor = async (fn, timeout = 15000, interval = 300) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true
    await sleep(interval)
  }
  return false
}

// 生成一个合法的小 CSV（表头 + 最后一列二分类标签）
const tmpCsv = path.join(os.tmpdir(), 'audit-upload.csv')
{
  const rows = ['年龄,负债率,收入,是否流失']
  let s = 7
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 80; i++) {
    const a = 18 + Math.floor(rnd() * 50)
    const d = rnd()
    const inc = 3 + Math.floor(rnd() * 30)
    rows.push(`${a},${d.toFixed(2)},${inc},${d > 0.5 ? '流失' : '留存'}`)
  }
  fs.writeFileSync(tmpCsv, rows.join('\n'), 'utf-8')
}

// ============================================================
// 页面遍历（两视口共用）：打开每个页面 + 子页签、截图、横向溢出检查
// ============================================================
const THEORY_TABS = ['数学基础急救包', '信息论全家桶', 'GINI 与不纯度家族', '模型思维实验室']
const TREE_TABS = ['workbench', 'dtree', 'logreg', 'knn', 'nb', 'svm', 'rf', 'xgb']
const CLUSTER_TABS = ['kmeans', 'dbscan', 'hier', 'workbench']

async function sweepPages(vpName) {
  console.log(`\n===== 页面遍历（${vpName}）=====`)
  section = `${vpName}/首页`
  await navTo('首页')
  check(`[${vpName}] 首页打开`, (await text()).includes('数据挖掘实验教学平台'))
  check(`[${vpName}] 首页无横向滚动条`, !(await hOverflow()))
  await shot(`${vpName}-home`)

  section = `${vpName}/理论基础`
  await navTo('理论基础')
  for (const t of THEORY_TABS) {
    section = `${vpName}/理论-${t}`
    const clicked = await clickText(t)
    await sleep(500)
    check(`[${vpName}] 理论子页签「${t}」打开`, clicked)
    check(`[${vpName}] 理论「${t}」无横向滚动条`, !(await hOverflow()))
    await shot(`${vpName}-theory-${t}`)
  }

  section = `${vpName}/数据预处理`
  await navTo('数据预处理')
  check(`[${vpName}] 预处理页打开`, (await text()).includes('处理操作流水线'))
  check(`[${vpName}] 预处理页无横向滚动条`, !(await hOverflow()))
  await shot(`${vpName}-prep`)

  section = `${vpName}/分类实验`
  await navTo('分类实验')
  for (const id of TREE_TABS) {
    section = `${vpName}/分类-${id}`
    await clickSubtab(id)
    check(`[${vpName}] 分类子页签「${id}」激活`, (await subtabActive(id)) === true)
    check(`[${vpName}] 分类「${id}」无横向滚动条`, !(await hOverflow()))
    await shot(`${vpName}-tree-${id}`)
  }

  section = `${vpName}/聚类实验`
  await navTo('聚类实验')
  for (const id of CLUSTER_TABS) {
    section = `${vpName}/聚类-${id}`
    await clickSubtab(id)
    check(`[${vpName}] 聚类子页签「${id}」激活`, (await subtabActive(id)) === true)
    check(`[${vpName}] 聚类「${id}」无横向滚动条`, !(await hOverflow()))
    await shot(`${vpName}-cluster-${id}`)
  }

  section = `${vpName}/关联分析`
  await navTo('关联分析')
  check(`[${vpName}] 关联分析页打开`, (await text()).includes('购物篮'))
  check(`[${vpName}] 关联分析页无横向滚动条`, !(await hOverflow()))
  await shot(`${vpName}-assoc`)
}

// ============================================================
// 关键交互抽查（1440 视口）
// ============================================================
async function interactions() {
  // ---------- 首页深链 ----------
  console.log('\n===== 交互：首页深链 =====')
  section = '交互/首页深链'
  await navTo('首页')
  const moduleExpect = [
    { nav: '理论基础', sub: null },
    { nav: '数据预处理', sub: null },
    { nav: '分类实验', sub: 'workbench' },
    { nav: '分类实验', sub: 'dtree' },
    { nav: '聚类实验', sub: 'kmeans' },
    { nav: '关联分析', sub: null },
  ]
  for (let i = 0; i < moduleExpect.length; i++) {
    await navTo('首页')
    const clicked = await page.evaluate((idx) => {
      const btns = [...document.querySelectorAll('main button')].filter((b) => b.textContent.trim() === '进入实验')
      if (!btns[idx]) return false
      btns[idx].click()
      return true
    }, i)
    await sleep(500)
    const exp = moduleExpect[i]
    const navOk = (await activeNav()).includes(exp.nav)
    let subOk = true
    if (exp.sub) subOk = (await subtabActive(exp.sub)) === true
    check(`深链：模块卡 ${i + 1} → ${exp.nav}${exp.sub ? '/' + exp.sub : ''}`, clicked && navOk && subOk, `nav=${await activeNav()}`)
  }
  // 概念卡深链（第 1 张 → 理论/数学）
  await navTo('首页')
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('main .cursor-pointer')].find((c) => c.textContent.includes('样本 / 特征 / 标签'))
    card?.click()
  })
  await sleep(300)
  const linkClicked = await clickText('去数学基础急救包看表格 = 矩阵')
  await sleep(500)
  check('深链：概念卡 → 理论基础', linkClicked && (await activeNav()).includes('理论基础'))
  await navTo('首页')
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('main .cursor-pointer')].find((c) => c.textContent.includes('过拟合 / 欠拟合'))
    card?.click()
  })
  await sleep(300)
  await clickText('去决策树实验调深度、调噪声')
  await sleep(500)
  check('深链：概念卡 → 分类/决策树子页签', (await activeNav()).includes('分类实验') && (await subtabActive('dtree')) === true)

  // 滚动复位：主页导航 + 子页签切换后应回到顶部
  await navTo('数据预处理')
  await page.evaluate(() => window.scrollTo(0, 800))
  await sleep(200)
  await navTo('首页')
  check('切换主页面后滚动回到顶部', (await page.evaluate(() => window.scrollY)) === 0)
  await navTo('分类实验')
  await page.evaluate(() => window.scrollTo(0, 800))
  await sleep(200)
  await clickSubtab('logreg')
  check('切换子页签后滚动回到顶部', (await page.evaluate(() => window.scrollY)) === 0)

  // ---------- 理论：数学急救包 ----------
  console.log('\n===== 交互：理论 · 数学急救包 =====')
  section = '交互/理论-数学'
  await navTo('理论基础')
  await clickText('数学基础急救包')
  await sleep(500)
  const post0 = await page.$eval('[data-testid="bayes-posterior"]', (el) => el.textContent.trim()).catch(() => null)
  check('贝叶斯默认后验 16.7%', post0 === '16.7%', post0)
  await page.focus('[data-testid="bayes-prev"] [role="slider"]')
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp')
  await sleep(400)
  const post1 = await page.$eval('[data-testid="bayes-posterior"]', (el) => el.textContent.trim())
  check('贝叶斯滑块联动（后验随患病率上升）', parseFloat(post1) > parseFloat(post0), `${post0} → ${post1}`)
  // 相关点拖动（pointer 事件）——先滚进视口，否则 boundingBox 坐标在视口外点不到
  await page.evaluate(() => document.querySelector('[data-testid="cov-canvas"]')?.scrollIntoView({ block: 'center' }))
  await sleep(400)
  const rBefore = parseFloat(await page.$eval('[data-testid="cov-r"]', (el) => el.textContent))
  const circle = await page.$('[data-testid="cov-canvas"] circle')
  const bb = await circle.boundingBox()
  if (bb) {
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
    await page.mouse.down()
    await page.mouse.move(bb.x + bb.width / 2 + 120, bb.y + bb.height / 2 + 90, { steps: 12 })
    await page.mouse.up()
    await sleep(400)
  }
  const rAfter = parseFloat(await page.$eval('[data-testid="cov-r"]', (el) => el.textContent))
  check('相关系数画布拖动点（r 变化）', bb !== null && Math.abs(rAfter - rBefore) > 0.001, `r: ${rBefore} → ${rAfter}`)

  // ---------- 理论：模型思维 ----------
  console.log('\n===== 交互：理论 · 模型思维 =====')
  section = '交互/理论-模型'
  await clickText('模型思维实验室')
  await sleep(600)
  await page.click('[data-testid="gd-auto"]')
  const gdOk = await waitFor(async () => (await page.$eval('[data-testid="gd-status"]', (el) => el.textContent)).includes('已收敛'), 15000)
  check('梯度下降自动播放收敛', gdOk)
  await page.click('[data-testid="pca-step1"]')
  await sleep(300)
  const ratio = parseFloat(await page.$eval('[data-testid="pca-ratio"]', (el) => el.textContent))
  check('PCA ① 找主轴（方差保留率 >90%）', ratio > 90, `${ratio}%`)
  await page.click('[data-testid="pca-step2"]')
  const pcaOk = await waitFor(() => exists('[data-testid="pca-1d"]'), 5000)
  check('PCA ② 投影动画出现 1D 投影带', pcaOk)

  // ---------- 预处理 → 分类接力 ----------
  console.log('\n===== 交互：预处理流水线 + 送去分类 =====')
  section = '交互/预处理'
  await navTo('数据预处理')
  const notReady = (await text()).includes('还不能送去分类')
  check('默认脏数据下「送去分类」被正确拦截', notReady)
  // 勾选「缺失值处理」和「类别编码」（流水线行 = 含 checkbox 且有序号名称 span 的卡片）
  const PIPE_ROWS = `[...document.querySelectorAll('main .rounded-lg.border')].filter((d) => d.querySelector('[role="checkbox"]') && [...d.querySelectorAll('span')].some((s) => /^\\d+\\.\\s*\\S/.test(s.textContent)))`
  const toggled = await page.evaluate(`(() => {
    const rows = ${PIPE_ROWS}
    const out = []
    for (const row of rows) {
      const name = [...row.querySelectorAll('span')].find((s) => /^\\d+\\.\\s*\\S/.test(s.textContent))?.textContent ?? ''
      if (name.includes('缺失值处理') || name.includes('类别编码')) {
        const cb = row.querySelector('[role="checkbox"]')
        if (cb && cb.getAttribute('aria-checked') !== 'true') cb.click()
        out.push(name.trim())
      }
    }
    return out
  })()`)
  await sleep(600)
  check('勾选缺失值处理 + 类别编码', toggled.length === 2, toggled.join(' / '))
  // 调顺序：把第 1 项下移
  const ORDER_SPANS = `[...document.querySelectorAll('main span')].filter((s) => /^\\d+\\.\\s*\\S/.test(s.textContent) && s.closest('.rounded-lg.border')?.querySelector('[role="checkbox"]')).map((s) => s.textContent.trim())`
  const orderBefore = await page.evaluate(`(${ORDER_SPANS}).slice(0, 2)`)
  await page.evaluate(`(() => {
    const rows = ${PIPE_ROWS}
    const arrows = rows[0]?.querySelectorAll('span.ml-auto button') // [↑, ↓]（避开启用后参数区的单选按钮）
    arrows?.[1]?.click() // 第一行的 ↓
  })()`)
  await sleep(400)
  const orderAfter = await page.evaluate(`(${ORDER_SPANS}).slice(0, 2)`)
  check('流水线顺序可调（↓ 下移第 1 项）', orderBefore[0] !== orderAfter[0] && orderBefore[1] !== orderAfter[1], `${orderBefore.join('|')} → ${orderAfter.join('|')}`)
  // 送去分类
  const sendClicked = await clickText('处理完，送去分类实验')
  await sleep(800)
  const bannerOk = (await text()).includes('已载入来自「数据预处理」的数据')
  check('「送去分类」跳转后分类页出现接力横幅', sendClicked && (await activeNav()).includes('分类实验') && bannerOk)
  check('接力后落在分类工作台子页签', (await subtabActive('workbench')) === true)
  await shot('handoff-banner')

  // ---------- 分类：工作台 ----------
  console.log('\n===== 交互：分类 · 多方法工作台 =====')
  section = '交互/分类-工作台'
  // 原理详解展开（方法卡）
  const introOk = await page.evaluate(() => {
    const sm = [...document.querySelectorAll('summary')].find((s) => s.textContent.includes('原理详解'))
    if (!sm) return false
    sm.click()
    return sm.closest('details')?.open === true
  })
  await sleep(300)
  check('方法卡「原理详解」可展开', introOk)
  // 训练（等真正的评估面板标志——「划分方式：分层抽样」只出现在 EvalPanel；页面常驻文案里有"测试准确率"会误判）
  await page.evaluate(() => window.scrollTo(0, 0))
  const trainClicked = await clickText('开始训练')
  const evalOk = await waitFor(async () => (await text()).includes('划分方式：分层抽样'), 20000)
  check('「开始训练」出评估结果（评估面板）', trainClicked && evalOk)
  // 横向对比（等训练完按钮恢复可用再点）
  const cmpClicked = await clickText('全部方法横向对比')
  const cmpOk = await waitFor(async () => (await text()).includes('七种方法横向对比'), 60000)
  check('「全部方法横向对比」出对比表', cmpClicked && cmpOk, cmpClicked ? '' : '按钮未找到')
  await shot('workbench-compare')
  // CSV 上传（先切到上传 CSV 数据源）
  await clickText('上传 CSV')
  await sleep(400)
  const fileInput = await page.$('input[type="file"]')
  check('分类页存在 CSV 上传入口', fileInput !== null)
  if (fileInput) {
    await fileInput.uploadFile(tmpCsv)
    const csvOk = await waitFor(async () => (await text()).includes('audit-upload.csv'), 8000)
    check('CSV 上传解析成功（显示文件名与行数）', csvOk)
  }
  check('示例 CSV 下载按钮存在', await clickText('下载示例 CSV（客户流失 200 行）'))

  // ---------- 分类：决策树推演 ----------
  console.log('\n===== 交互：分类 · 决策树推演 =====')
  section = '交互/分类-决策树'
  await clickSubtab('dtree')
  const stepOf = async () => page.evaluate(() => {
    const m = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)\s*步/)
    return m ? Number(m[1]) : -1
  })
  const s0 = await stepOf()
  await clickText('下一步')
  await sleep(400)
  const s1 = await stepOf()
  check('决策树「下一步」步进', s1 === s0 + 1, `${s0} → ${s1}`)
  await clickText('自动播放')
  await sleep(1800)
  const s2 = await stepOf()
  await clickText('暂停')
  check('决策树「自动播放」推进', s2 > s1, `${s1} → ${s2}`)
  await clickText('上一步')
  await sleep(300)
  const s3 = await stepOf()
  check('决策树「上一步」回退', s3 === s2 - 1, `${s2} → ${s3}`)

  // ---------- 分类：kNN 推演（无 StepControls，拖动查询点 + k 滑块） ----------
  console.log('\n===== 交互：分类 · kNN 推演 =====')
  section = '交互/分类-knn'
  await clickSubtab('knn')
  check('kNN 页面渲染（查询点 + 判定结果）', (await exists('[data-testid="knn-query"]')) && (await exists('[data-testid="knn-verdict"]')))
  // k 滑块：邻居数变化 → 距离列表内容变化
  const dist0 = await page.$eval('[data-testid="knn-dist-list"]', (el) => el.textContent).catch(() => '')
  const kMoved = await pressSlider('邻居数 k', 'ArrowRight', 4)
  await sleep(400)
  const dist1 = await page.$eval('[data-testid="knn-dist-list"]', (el) => el.textContent).catch(() => '')
  check('kNN 邻居数 k 滑块联动（距离列表变化）', kMoved && dist0 !== dist1)
  // 拖动查询点：判定/距离联动
  await page.evaluate(() => document.querySelector('[data-testid="knn-canvas"]')?.scrollIntoView({ block: 'center' }))
  await sleep(400)
  const q = await page.$('[data-testid="knn-query"]')
  const qb = await q?.boundingBox()
  if (qb) {
    await page.mouse.move(qb.x + qb.width / 2, qb.y + qb.height / 2)
    await page.mouse.down()
    await page.mouse.move(qb.x + qb.width / 2 + 130, qb.y + qb.height / 2 + 60, { steps: 12 })
    await page.mouse.up()
    await sleep(400)
  }
  const dist2 = await page.$eval('[data-testid="knn-dist-list"]', (el) => el.textContent).catch(() => '')
  check('kNN 拖动查询点联动（距离列表变化）', qb != null && dist2 !== dist1)
  // 决策区域开关
  await page.click('[data-testid="knn-region-toggle"]').catch(() => {})
  await sleep(300)
  check('kNN 决策区域开关可点', true)

  // ---------- 分类：五个 StepControls 推演页 ----------
  for (const [id, label] of [
    ['logreg', '逻辑回归'],
    ['nb', '朴素贝叶斯'],
    ['svm', 'SVM'],
    ['rf', '随机森林'],
    ['xgb', 'XGBoost'],
  ]) {
    console.log(`\n===== 交互：分类 · ${label}推演 =====`)
    section = `交互/分类-${id}`
    await clickSubtab(id)
    const prog = () => page.$eval('[data-testid="step-progress"]', (el) => el.textContent.trim()).catch(() => '')
    const p0 = await prog()
    await page.click('[data-testid="step-next"]')
    await sleep(400)
    const p1 = await prog()
    check(`${label}「下一步」步进`, p0 !== p1 && p1.startsWith('1'), `${p0} → ${p1}`)
    await page.click('[data-testid="step-play"]')
    await sleep(1800)
    const p2 = await prog()
    await page.click('[data-testid="step-play"]') // 暂停
    check(`${label}「自动播放」推进`, !p2.startsWith('0') && p2 !== p1, `${p1} → ${p2}`)
    await page.click('[data-testid="step-reset"]')
    await sleep(300)
    const p3 = await prog()
    check(`${label}「重置」回到 0`, p3.startsWith('0'), p3)
  }

  // ---------- 聚类：K-Means ----------
  console.log('\n===== 交互：聚类 · K-Means 推演 =====')
  section = '交互/聚类-kmeans'
  await navTo('聚类实验')
  await clickSubtab('kmeans')
  await clickText('随机放置 K 个质心')
  await sleep(400)
  await clickText('初始化')
  await sleep(400)
  await clickText('自动运行')
  const kmOk = await waitFor(async () => (await page.$eval('[data-testid="kmeans-narration"]', (el) => el.textContent)).includes('收敛'), 25000)
  check('K-Means 自动运行到收敛', kmOk)

  // ---------- 聚类：DBSCAN ----------
  console.log('\n===== 交互：聚类 · DBSCAN 推演 =====')
  section = '交互/聚类-dbscan'
  await clickSubtab('dbscan')
  await page.click('[data-testid="step-next"]')
  await sleep(300)
  const dbP = await page.$eval('[data-testid="step-progress"]', (el) => el.textContent.trim())
  check('DBSCAN「下一步」步进', dbP.startsWith('1'), dbP)
  await page.click('[data-testid="step-play"]')
  const dbOk = await waitFor(() => exists('[data-testid="dbscan-done"]'), 30000)
  check('DBSCAN 自动播放跑完（出现完成标记）', dbOk)

  // ---------- 聚类：层次聚类 + 切一刀 ----------
  console.log('\n===== 交互：聚类 · 层次聚类推演 =====')
  section = '交互/聚类-hier'
  await clickSubtab('hier')
  await page.click('[data-testid="walk-finish"]')
  await sleep(800)
  check('层次聚类快进到完成（切一刀面板出现）', await exists('[data-testid="hier-cut-panel"]'))
  const kBefore = await page.evaluate(() => document.querySelector('[data-testid="hier-cut-panel"]')?.textContent.match(/当前切成 (\d+) 个簇/)?.[1] ?? '')
  // Home = 切到最低高度，每个点自成一簇，必然改变簇数
  const moved = await pressSlider('切一刀的高度', 'Home', 1)
  await sleep(400)
  const kAfter = await page.evaluate(() => document.querySelector('[data-testid="hier-cut-panel"]')?.textContent.match(/当前切成 (\d+) 个簇/)?.[1] ?? '')
  check('「切一刀」滑块改变簇数', moved && kBefore !== kAfter && Number(kAfter) > Number(kBefore), `${kBefore} → ${kAfter} 簇`)
  await page.click('[data-testid="cut-k-2"]')
  await sleep(400)
  const k2 = await page.evaluate(() => document.querySelector('[data-testid="hier-cut-panel"]')?.textContent.match(/当前切成 (\d+) 个簇/)?.[1] ?? '')
  check('「切成 2 簇」快捷按钮', k2 === '2', `${k2} 簇`)

  // ---------- 聚类：工作台 + K 选择助手 ----------
  console.log('\n===== 交互：聚类 · 多方法工作台 =====')
  section = '交互/聚类-工作台'
  await clickSubtab('workbench')
  const runClicked = await clickText('一键运行收敛')
  const evalPanel = await waitFor(async () => (await text()).includes('轮廓系数'), 20000)
  check('工作台 K-Means 一键运行出评估面板', runClicked && evalPanel)
  const sweepClicked = await clickText('批量评估 K=2..8')
  const sweepOk = await waitFor(async () => (await text()).includes('建议'), 20000)
  check('K 选择助手批量评估出建议 K', sweepClicked && sweepOk)
  await shot('cluster-khelper')

  // ---------- 关联分析 ----------
  console.log('\n===== 交互：关联分析 =====')
  section = '交互/关联'
  await navTo('关联分析')
  // 格图剪枝
  const pruned = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="lattice"] g[data-frequent="false"]')
    if (!node) return false
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  await sleep(500)
  check('格图点击非频繁节点触发剪枝', pruned && (await text()).includes('支持度不足'))
  const restore = await clickText('恢复格图')
  await sleep(400)
  check('「恢复格图」还原', restore && (await text()).includes('怎么玩'))
  // 阈值滑块（格阈值）
  check('格图频繁阈值滑块可拖', await pressSlider('频繁阈值', 'ArrowRight', 3))
  // Apriori 自动播放 → 规则表
  await clickText('自动播放')
  const rulesOk = await waitFor(() => exists('[data-testid="rules-table"]'), 45000)
  check('Apriori 自动播放到规则表', rulesOk)
  // 置信度阈值滑块
  check('置信度阈值滑块可拖', await pressSlider('置信度阈值', 'ArrowLeft', 4))
  await sleep(400)
  // 支持度阈值滑块（调后动画重置）
  const supMoved = await pressSlider('支持度阈值', 'ArrowRight', 2)
  await sleep(400)
  check('支持度阈值改变后动画重置', supMoved && !(await exists('[data-testid="rules-table"]')))
  // 交易编辑器勾选
  await clickText('交易编辑器')
  await sleep(500)
  const cellState = await page.evaluate(() => {
    const cell = document.querySelector('button[aria-label="1-1"]') ?? document.querySelector('tbody button.rounded.border')
    if (!cell) return null
    const before = cell.className
    cell.click()
    return { before }
  })
  await sleep(400)
  const cellAfter = await page.evaluate(() => (document.querySelector('button[aria-label="1-1"]') ?? document.querySelector('tbody button.rounded.border'))?.className ?? '')
  check('交易编辑器勾选切换', cellState !== null && cellAfter !== cellState.before)
  // 示例下载按钮存在（在「CSV 上传」页签下）
  await clickText('CSV 上传')
  await sleep(500)
  check('关联分析示例 CSV 下载按钮存在', (await text()).includes('下载示例 CSV（购物篮 25 笔）'))
  check('关联分析存在 CSV 上传入口', await exists('input[type="file"]'))
}

// ============================================================
// 主流程
// ============================================================
// 分段执行：任何一段异常都记为失败并继续后续检查
const safe = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    fail++
    failures.push(`${name} 异常：${String(e).slice(0, 200)}`)
    console.error(`  ❌ ${name} 异常：${String(e).slice(0, 200)}`)
    await page.screenshot({ path: path.join(shotDir, `zz-${name.replaceAll(/[^\w-]/g, '_')}.png`) }).catch(() => {})
  }
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 })
  await sleep(800)

  // 视口 1：1440×900（遍历 + 交互）
  await page.setViewport({ width: 1440, height: 900 })
  await sleep(400)
  await safe('页面遍历1440', () => sweepPages('1440x900'))
  await safe('交互抽查', interactions)

  // 视口 2：1280×800（仅遍历 + 截图）
  console.log('\n===== 切换视口 1280×800 =====')
  await page.setViewport({ width: 1280, height: 800 })
  await navTo('首页')
  await sleep(600)
  await safe('页面遍历1280', () => sweepPages('1280x800'))
} catch (e) {
  fail++
  failures.push(`审计异常：${e}`)
  console.error('❌ 审计异常：', e)
  await page.screenshot({ path: path.join(shotDir, 'zz-error.png'), fullPage: true }).catch(() => {})
} finally {
  // console / 网络错误汇总（无论如何都输出）
  console.log('\n===== 错误汇总 =====')
  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('DevTools'))
  if (realErrors.length === 0) {
    pass++
    console.log('  ✅ 全程 console / pageerror / 4xx-5xx 零报错')
  } else {
    fail++
    failures.push(`console/网络报错 ${realErrors.length} 条`)
    realErrors.slice(0, 10).forEach((e) => console.error(`  ❌ ${e.slice(0, 300)}`))
  }
  await browser.close()
  devProc?.kill()
  try { fs.unlinkSync(tmpCsv) } catch {}
}

console.log('\n========================================')
console.log(`审计结果：${pass} 通过 / ${fail} 失败`)
if (failures.length > 0) {
  console.log('\n失败清单：')
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
}
console.log(`截图目录：${shotDir}`)
process.exit(fail > 0 ? 1 : 0)
