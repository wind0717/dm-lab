// 冒烟测试 8：放宽上传限制后的分类工作台大数据流程
// 覆盖：3000 行 × 8 特征 CSV 上传解析 → 训练出评估面板 → kNN 大数据降级提示 → 七方法横向对比
// 连 Kimi Work 管理的 dev 预览 http://localhost:7100/（不自起服务器；不通则临时起 3100 --strictPort 并 kill）
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- 生成 3000 行 × 8 特征二分类 CSV ----
{
  let seed = 20260930
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const lines = [Array.from({ length: 8 }, (_, j) => `特征${j + 1}`).join(',') + ',是否流失']
  for (let i = 0; i < 3000; i++) {
    const vals = []
    let s = 0
    for (let j = 0; j < 8; j++) {
      const v = rand() * 20 - 10
      vals.push(v.toFixed(4))
      s += (j % 2 === 0 ? v : -v) * (j < 4 ? 1 : 0.2)
    }
    lines.push([...vals, s + (rand() - 0.5) * 18 > 2 ? '流失' : '未流失'].join(','))
  }
  fs.writeFileSync('/tmp/smoke8-upload.csv', lines.join('\n'))
  console.log(`ℹ️  已生成 /tmp/smoke8-upload.csv（${(fs.statSync('/tmp/smoke8-upload.csv').size / 1024).toFixed(0)}KB，3000 行 × 8 特征）`)
}

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
const text = async () => page.evaluate(() => document.body.innerText)
const clickButtonByText = async (txt) => {
  await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))?.click(), txt)
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 })
  await sleep(800)

  // 进入「分类实验」
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header nav button')].find((b) => b.textContent.includes('分类实验'))
    btn?.click()
  })
  await sleep(600)
  check('分类工作台打开', (await text()).includes('七种方法对比工作台'))

  // 切到「上传 CSV」数据源
  await clickButtonByText('上传 CSV')
  await sleep(400)
  check('上传组件格式说明已是新限制', (await text()).includes('≤5MB') && (await text()).includes('≤5000 行') && (await text()).includes('≤20 个特征列'))
  check('浏览器本地计算提示出现', (await text()).includes('所有计算都在你的浏览器里完成'))

  // setInputFiles 上传 3000 行 CSV
  const fileInput = await page.$('input[type="file"]')
  await fileInput.uploadFile('/tmp/smoke8-upload.csv')
  await sleep(1500)
  const bodyText = await text()
  check('3000 行 CSV 解析成功（概览出现）', bodyText.includes('3000 行') && bodyText.includes('8 列特征'), bodyText.match(/\d+ 行 × \d+ 列特征/)?.[0] ?? '')
  check('散点预览抽样提示出现（>2000 点）', bodyText.includes('仅展示固定种子随机抽样的 2000 / 3000 个点'))

  // 训练（默认决策树）
  await clickButtonByText('开始训练')
  await sleep(2500)
  check('训练后评估面板出现（测试集准确率 / ROC / 混淆矩阵）', (await text()).includes('测试集准确率') && (await text()).includes('ROC 曲线') && (await text()).includes('混淆矩阵'))
  await page.screenshot({ path: '/tmp/smoke8-tree-eval.png', fullPage: true })

  // 切到 kNN：3000 行 → 训练集 2100 > 2000，应触发大数据降级提示
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('p')].find((el) => el.textContent === 'kNN 近邻')
    p?.closest('button')?.click()
  })
  await sleep(400)
  await clickButtonByText('开始训练')
  await sleep(6000)
  const knnText = await text()
  check('kNN 大数据自动加速提示出现', knnText.includes('kNN 对大数据自动加速') && knnText.includes('2000 个代表点'))
  check('kNN 评估面板正常（准确率指标在）', knnText.includes('测试集准确率'))
  await page.screenshot({ path: '/tmp/smoke8-knn-degraded.png', fullPage: true })

  // 全部方法横向对比
  await clickButtonByText('全部方法横向对比')
  let cmpOk = false
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    if ((await text()).includes('七种方法横向对比')) {
      cmpOk = true
      break
    }
  }
  check('七方法横向对比在 30s 内完成', cmpOk)
  const cmpText = await text()
  check('对比表含全部七种方法', ['决策树', 'kNN 近邻', '逻辑回归', '朴素贝叶斯', 'SVM 支持向量机', '随机森林', 'XGBoost 教学版'].every((m) => cmpText.includes(m)))
  await page.screenshot({ path: '/tmp/smoke8-compare.png', fullPage: true })

  // console 报错
  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('DevTools'))
  check('全程 console 无报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || '无报错')
} catch (e) {
  fail++
  console.error('❌ 冒烟测试异常：', e)
  await page.screenshot({ path: '/tmp/smoke8-error.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  devProc?.kill()
}

console.log(`\n========================================`)
console.log(`冒烟结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
