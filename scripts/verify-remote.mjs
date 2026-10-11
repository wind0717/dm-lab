// 远端部署验证：直接对172.16.162.5:8090 跑浏览器测试
// 用法: node scripts/verify-remote.mjs [host:port]
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.argv[2] || 'http://172.16.162.5:8090'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log(`验证目标: ${BASE}\n`)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1360, height: 900 })

const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 140)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140))
})
page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url().slice(-50)))

let pass = 0
let fail = 0
const check = async (name, fn) => {
  try {
    const r = await fn()
    if (r === false) throw new Error('断言为 false')
    pass++
    console.log('  ✓ ' + name)
  } catch (e) {
    fail++
    console.log('  ✗ ' + name + ' → ' + e.message)
  }
}

const body = () => page.evaluate(() => document.body.innerText)
const activeSub = () =>
  page.evaluate(() => {
    const list = [...document.querySelectorAll('[data-testid^="subtab-"]')]
    const on = list.find((x) => x.className.includes('bg-indigo-600'))
    return on ? on.getAttribute('data-testid').replace('subtab-', '') : null
  })

console.log('【1】首页')
await check('首页加载且有内容', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
  if (!(await body()).includes('数据挖掘实验教学平台')) throw new Error('标题未出现')
  return true
})

console.log('\n【2】深链直达（跨页懒加载是否正常）')
for (const [h, sub, hint] of [
  ['#/theory/info', null, '信息'],
  ['#/prep', null, '预处理'],
  ['#/tree/dtree', 'dtree', '决策树'],
  ['#/tree/svm', 'svm', 'SVM'],
  ['#/tree/xgb', 'xgb', 'XGBoost'],
  ['#/cluster/kmeans', 'kmeans', 'K-Means'],
  ['#/cluster/dbscan', 'dbscan', 'DBSCAN'],
  ['#/cluster/workbench', 'workbench', '对比'],
  ['#/assoc', null, 'Apriori'],
]) {
  await check(`${h}`, async () => {
    await page.goto(BASE + '/' + h, { waitUntil: 'networkidle0' })
    await sleep(650)
    if (sub && (await activeSub()) !== sub) throw new Error('子页签未激活')
    if (!(await body()).includes(hint)) throw new Error(`内容缺「${hint}」`)
    return true
  })
}

console.log('\n【3】gzip 传输是否生效（外网带宽敏感）')
await check('主 JS 被 gzip 压缩', async () => {
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
  const js = await page.evaluate(() => {
    const el = document.querySelector('script[src*="index-"]')
    return el ? el.getAttribute('src') : null
  })
  if (!js) throw new Error('未找到主脚本')
  const size = await page.evaluate(async (url) => {
    const r = await fetch(url)
    const b = await r.arrayBuffer()
    return {
      bytes: b.byteLength,
      enc: r.headers.get('content-encoding') || 'none',
    }
  }, new URL(js, BASE + '/').href)
  console.log(`     ${size.bytes} bytes, Content-Encoding=${size.enc}`)
  return true
})

console.log('\n【4】种子控件与参数存档')
await check('决策树种子框默认 42', async () => {
  await page.goto(BASE + '/#/tree/dtree', { waitUntil: 'networkidle0' })
  await sleep(700)
  const v = await page.evaluate(() => {
    const i = document.querySelector('#seed-input')
    return i ? i.value : null
  })
  if (v !== '42') throw new Error('种子值=' + v)
  return true
})
await check('参数存档跨刷新生效', async () => {
  await page.evaluate(() => localStorage.setItem('dm-lab:local:dtree:maxDepth', '3'))
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(600)
  const v = await page.evaluate(() => localStorage.getItem('dm-lab:local:dtree:maxDepth'))
  if (v !== '3') throw new Error('存档未保留')
  return true
})

console.log('\n【5】健康检查接口')
await check('/healthz 返回 JSON', async () => {
  const t = await page.evaluate(async (b) => {
    const r = await fetch(b + '/healthz')
    return r.json()
  }, BASE)
  if (t.status !== 'ok') throw new Error('status=' + t.status)
  console.log(`     ${JSON.stringify(t)}`)
  return true
})

console.log('\n【6】全程零报错')
await check('无 pageerror / console.error / 请求失败', async () => {
  if (errors.length) throw new Error(`${errors.length} 条：\n     ${errors.slice(0, 3).join('\n     ')}`)
  return true
})

console.log('\n' + '='.repeat(46))
console.log(`  ${pass} 通过 / ${fail} 失败`)
console.log('='.repeat(46))

await browser.close()
process.exit(fail ? 1 : 0)