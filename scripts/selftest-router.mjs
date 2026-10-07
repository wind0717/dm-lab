// 路由深链自测 —— 验证 HashRouter 改造后 URL 可直达、刷新不丢、前进后退有效
// 运行方式（项目根目录）：node scripts/selftest-router.mjs
//
// 背景：改造前 App 用 useState 切页，刷新必回首页、无法把某个实验分享给学生。
// 改造后应为 /#/tree/svm 这样的深链可直接打开、刷新保持在同一页签。
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 4178
const BASE = `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
const check = async (name, fn) => {
  try {
    const r = await fn()
    if (r === false) throw new Error('断言为false')
    pass++
    console.log('  ✓ ' + name)
  } catch (e) {
    fail++
    console.log('  ✗ ' + name + ' → ' + e.message)
  }
}

// ---- 起一个静态服务托管 dist ----
let server = null
async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return res.ok || res.status === 304
  } catch {
    return false
  }
}

if (!(await reachable(BASE))) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  })
  let ok = false
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    if (await reachable(BASE)) {
      ok = true
      break
    }
  }
  if (!ok) {
    console.error('❌ 静态服务起不来（是否忘了先 npm run build？）')
    server?.kill()
    process.exit(1)
  }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

// 当前激活的子页签（data-testid）
const activeSub = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid^="subtab-"].bg-indigo-600, [data-testid^="subtab-"]')
    const list = [...document.querySelectorAll('[data-testid^="subtab-"]')]
    const on = list.find((x) => x.className.includes('bg-indigo-600'))
    return on ? on.getAttribute('data-testid').replace('subtab-', '') : null
  })

// 高亮的主导航
const activeNav = () =>
  page.evaluate(() => {
    const btns = [...document.querySelectorAll('header nav button')]
    const on = btns.find((b) => b.className.includes('bg-indigo-600'))
    return on ? on.textContent.trim() : null
  })

const hash = () => page.evaluate(() => window.location.hash)

console.log('【1】深链直达：直接打开某个具体实验')
const DEEP = [
  ['#/tree/svm', 'subtab-svm', '分类实验', 'SVM 推演'],
  ['#/tree/xgb', 'subtab-xgb', '分类实验', 'XGBoost 推演'],
  ['#/cluster/dbscan', 'subtab-dbscan', '聚类实验', 'DBSCAN 推演'],
  ['#/cluster/hier', 'subtab-hier', '聚类实验', '层次聚类推演'],
  ['#/theory/info', null, '理论基础', '信息论'],
  ['#/theory/model', null, '理论基础', '模型思维'],
]
for (const [h, sub, navLabel, textHint] of DEEP) {
  await check(`打开 ${h} 直达目标页`, async () => {
    await page.goto(BASE + h, { waitUntil: 'networkidle0' })
    await sleep(600)
    const nav = await activeNav()
    if (nav !== navLabel) throw new Error(`主导航=${nav}，期望 ${navLabel}`)
    if (sub && (await activeSub()) !== sub) throw new Error(`子页签=${await activeSub()}，期望 ${sub}`)
    const body = await page.evaluate(() => document.body.innerText)
    if (!body.includes(textHint)) throw new Error(`页面内容未出现「${textHint}」`)
    return true
  })
}

console.log('')
console.log('【2】刷新不丢：深链打开后 reload 仍停在同一页')
for (const [h, sub] of [
  ['#/tree/svm', 'svm'],
  ['#/cluster/dbscan', 'dbscan'],
  ['#/theory/gini', null],
]) {
  await check(`刷新 ${h} 保持不变`, async () => {
    await page.goto(BASE + h, { waitUntil: 'networkidle0' })
    await sleep(500)
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(600)
    const after = await hash()
    if (after !== h) throw new Error(`刷新后 hash=${after}，期望 ${h}`)
    if (sub && (await activeSub()) !== sub) throw new Error(`刷新后子页签=${await activeSub()}`)
    return true
  })
}

console.log('')
console.log('【3】前进/后退：浏览器历史可用（改造前完全失效）')
await check('后退能回到上一个页面', async () => {
  await page.goto(BASE + '#/tree/knn', { waitUntil: 'networkidle0' })
  await sleep(400)
  await page.goto(BASE + '#/tree/svm', { waitUntil: 'networkidle0' })
  await sleep(400)
  await page.goBack({ waitUntil: 'networkidle0' })
  await sleep(600)
  const h = await hash()
  if (h !== '#/tree/knn') throw new Error(`后退到 ${h}，期望 #/tree/knn`)
  if ((await activeSub()) !== 'knn') throw new Error('后退后子页签未同步')
  return true
})
await check('前进能回到后一页', async () => {
  await page.goForward({ waitUntil: 'networkidle0' })
  await sleep(600)
  const h = await hash()
  if (h !== '#/tree/svm') throw new Error(`前进到 ${h}，期望 #/tree/svm`)
  return true
})

console.log('')
console.log('【4】子页签点击 → URL 同步更新（分享链接的前提）')
await page.goto(BASE + '#/tree/workbench', { waitUntil: 'networkidle0' })
await sleep(500)
for (const id of ['rf', 'nb', 'logreg']) {
  await check(`点击子页签 ${id} → URL 变为 /tree/${id}`, async () => {
    await page.evaluate((i) => document.querySelector(`[data-testid="subtab-${i}"]`)?.click(), id)
    await sleep(500)
    const h = await hash()
    if (h !== `#/tree/${id}`) throw new Error(`URL=${h}`)
    if ((await activeSub()) !== id) throw new Error('子页签未激活')
    return true
  })
}

console.log('')
console.log('【5】顶栏导航 → 默认落地路径')
for (const [label, h] of [
  ['首页', '#/'],
  ['理论基础', '#/theory/math'],
  ['数据预处理', '#/prep'],
  ['聚类实验', '#/cluster/kmeans'],
  ['关联分析', '#/assoc'],
]) {
  await check(`点「${label}」→ ${h}`, async () => {
    await page.evaluate((t) => {
      const b = [...document.querySelectorAll('header nav button')].find((x) => x.textContent.trim() === t)
      b?.click()
    }, label)
    await sleep(500)
    const got = await hash()
    if (got !== h) throw new Error(`落到 ${got}，期望 ${h}`)
    return true
  })
}

console.log('')
console.log('【6】非法路径兜底不崩')
for (const h of ['#/tree/不存在', '#/theory/xxx', '#/cluster/???']) {
  await check(`${h} 不白屏`, async () => {
    await page.goto(BASE + h, { waitUntil: 'networkidle0' })
    await sleep(500)
    const body = await page.evaluate(() => document.body.innerText)
    if (body.trim().length < 50) throw new Error('页面基本空白')
    return true
  })
}
await check('#/完全不存在的顶层路径 → 回首页', async () => {
  await page.goto(BASE + '#/nope/nope/nope', { waitUntil: 'networkidle0' })
  await sleep(600)
  const nav = await activeNav()
  if (nav !== '首页') throw new Error(`落到 ${nav}，应回首页`)
  return true
})

console.log('')
console.log('【7】跨页跳转回调（概念卡 / 想一想 里的小链接）')
await check('概念卡「去数学基础」→ /theory/math', async () => {
  await page.goto(BASE + '#/', { waitUntil: 'networkidle0' })
  await sleep(600)
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div.cursor-pointer')]
    const c = cards.find((x) => x.textContent.includes('样本 / 特征 / 标签'))
    c?.scrollIntoView({ block: 'center' })
    c?.click()
  })
  await sleep(300)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('去数学基础急救包'))
    b?.click()
  })
  await sleep(600)
  const h = await hash()
  if (h !== '#/theory/math') throw new Error(`跳到 ${h}`)
  return true
})
await check('决策树页「去看信息论」→ /theory/info', async () => {
  await page.goto(BASE + '#/tree/dtree', { waitUntil: 'networkidle0' })
  await sleep(600)
  const jumped = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('信息论'))
    if (!b) return false
    b.click()
    return true
  })
  if (!jumped) throw new Error('未找到跳转按钮')
  await sleep(700)
  const h = await hash()
  if (h !== '#/theory/info') throw new Error(`跳到 ${h}，期望 #/theory/info`)
  return true
})

console.log('')
console.log('【8】预处理 → 分类 数据接力（跨路由传 state）')
await check('接力后落在 /tree/workbench', async () => {
  await page.goto(BASE + '#/prep', { waitUntil: 'networkidle0' })
  await sleep(700)
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /送.*分类|分类实验|去分类/.test(x.textContent))
    if (!b) return false
    b.click()
    return true
  })
  if (!clicked) throw new Error('未找到接力按钮')
  await sleep(800)
  const h = await hash()
  if (h !== '#/tree/workbench') throw new Error(`落到 ${h}`)
  if ((await activeSub()) !== 'workbench') throw new Error('子页签不是 workbench')
  return true
})

console.log('')
console.log('【9】全程零 console / pageerror 报错')
await check('无错误日志', async () => {
  if (errors.length) throw new Error(`${errors.length} 条：${errors[0].slice(0, 120)}`)
  return true
})

console.log('')
console.log(`===== ${pass} 通过 / ${fail} 失败 =====`)

await browser.close()
server?.kill()
process.exit(fail ? 1 : 0)
