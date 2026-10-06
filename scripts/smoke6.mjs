// 冒烟测试 6：三个新推演页签（SVM / 随机森林 / XGBoost）
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
/** 连点 n 次"下一步"（每次点击后让出事件循环，等 React 重新渲染再点下一次） */
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
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header nav button')].find((b) => b.textContent.includes('分类实验'))
    btn?.click()
  })
  await sleep(600)
  // 页签栏应有 8 个子页签
  check(
    '子页签栏共 8 个页签',
    await page.evaluate(() => [...document.querySelectorAll('[data-testid^="subtab-"]')].length === 8),
  )

  // ========== 1. SVM 推演 ==========
  console.log('\n【SVM 推演】')
  await clickTestId('subtab-svm')
  await sleep(900)
  check('页面打开（画布 + 原理详解卡）', await page.evaluate(() => !!document.querySelector('[data-testid="svm-canvas"]') && document.body.innerText.includes('原理详解')))
  check('决策边界 + 两条间隔虚线已渲染', await page.evaluate(() => !!document.querySelector('[data-testid="svm-boundary"]') && document.querySelectorAll('[data-testid="svm-margin"]').length === 2))

  const svmP0 = await progress()
  await clickNextTimes(5)
  await sleep(400)
  const svmP5 = await progress()
  check('下一步推进迭代', svmP5 !== svmP0, `${svmP0.trim()} → ${svmP5.trim()}`)
  check('间隔带底色出现', await page.evaluate(() => document.querySelectorAll('[data-testid="svm-band"]').length > 50))

  await clickTestId('step-play')
  await sleep(1500)
  await clickTestId('step-play') // 暂停
  const svmPAuto = await progress()
  check('自动播放持续推进', svmPAuto !== svmP5, `→ ${svmPAuto.trim()}`)

  // 跳到最后：支持向量 + 收敛状态
  await clickNextTimes(300)
  await sleep(600)
  check('推演到终态（已收敛/达上限标记）', await page.evaluate(() => !!document.querySelector('[data-testid="svm-done"]')))
  const svCount = await page.evaluate(() => document.querySelectorAll('[data-testid="svm-sv"]').length)
  check('支持向量用大圆圈标出（少数派）', svCount > 0 && svCount < 60, `${svCount} 个大圆圈`)
  check('支持向量讲解文字出现', (await text()).includes('支持向量机"名字的由来'))
  const svmInfo = await page.evaluate(() => {
    const t = document.body.innerText
    return { margin: t.match(/间隔宽度 = ([\d.]+)/)?.[1], viol: t.match(/违反间隔样本 = (\d+)/)?.[1] }
  })
  check('右侧面板间隔宽度/违反数正常', svmInfo.margin !== null && svmInfo.viol !== null, `间隔 ${svmInfo.margin}，违反 ${svmInfo.viol} 个`)
  await page.screenshot({ path: '/tmp/smoke6-svm.png', fullPage: true })

  // ========== 2. 随机森林推演 ==========
  console.log('\n【随机森林推演】')
  await clickTestId('subtab-rf')
  await sleep(1200)
  check('页面打开（3×3 小图网格）', await page.evaluate(() => !!document.querySelector('[data-testid="forest-grid"]') && document.querySelectorAll('[data-testid^="forest-mini-"]').length === 9))
  check('初始 9 张小图均"等待训练"', (await text()).match(/等待训练/g)?.length === 9)

  await clickNextTimes(1)
  await sleep(700)
  check('第 1 棵小图渲染出决策区域', await page.evaluate(() => document.querySelectorAll('[data-testid="forest-mini-0"] rect').length > 100))
  check('投票大图出现背景着色', await page.evaluate(() => document.querySelectorAll('[data-testid="forest-region"] rect').length > 500))

  await clickTestId('step-play')
  await sleep(2500)
  await clickTestId('step-play')
  const rfPAuto = await progress()
  check('自动播放持续推进', !rfPAuto.startsWith('1'), `→ ${rfPAuto.trim()}`)

  await clickNextTimes(9)
  await sleep(800)
  check('9 棵树全部长成（完成标记）', await page.evaluate(() => !!document.querySelector('[data-testid="forest-done"]')))
  check('所有小图都有决策区域', await page.evaluate(() => {
    for (let k = 0; k < 9; k++) {
      if (document.querySelectorAll(`[data-testid="forest-mini-${k}"] rect`).length < 50) return false
    }
    return true
  }))
  const rfInfo = await page.evaluate(() => {
    const t = document.body.innerText
    return { m: t.match(/单树测试 ([\d.]+)%，森林 ([\d.]+)%/) }
  })
  check('结束态"单树 vs 森林"对比文案出现', rfInfo.m !== null, rfInfo.m ? `单树 ${rfInfo.m[1]}% → 森林 ${rfInfo.m[2]}%` : '未找到')
  check('准确率曲线已画出', await page.evaluate(() => !!document.querySelector('svg path[stroke="#f97316"]')))
  await page.screenshot({ path: '/tmp/smoke6-forest.png', fullPage: true })

  // ========== 3. XGBoost 推演 ==========
  console.log('\n【XGBoost 推演】')
  await clickTestId('subtab-xgb')
  await sleep(1200)
  check('页面打开（画布 + 对比开关）', await page.evaluate(() => !!document.querySelector('[data-testid="xgb-canvas"]') && !!document.querySelector('[data-testid="xgb-mode-all"]') && !!document.querySelector('[data-testid="xgb-mode-first"]')))

  await clickNextTimes(1)
  await sleep(700)
  const residCount1 = await page.evaluate(() => document.querySelectorAll('[data-testid="xgb-resid"]').length)
  check('第 1 轮后残差高亮出现（圈住猜错/没把握的点）', residCount1 > 20, `${residCount1} 个残差圈`)
  check('本轮"重点关照"文案出现', await page.evaluate(() => !!document.querySelector('[data-testid="xgb-focus"]') && document.querySelector('[data-testid="xgb-focus"]').textContent.includes('重点修正')))

  // 对比开关
  await clickTestId('xgb-mode-first')
  await sleep(700)
  check('切换到"只看第 1 棵树"不报错且仍渲染', await page.evaluate(() => document.querySelectorAll('[data-testid="xgb-canvas"] rect').length > 500))
  await clickTestId('xgb-mode-all')
  await sleep(500)

  await clickTestId('step-play')
  await sleep(2000)
  await clickTestId('step-play')
  const xgbPAuto = await progress()
  check('自动播放持续推进', !xgbPAuto.startsWith('1'), `→ ${xgbPAuto.trim()}`)

  await clickNextTimes(40)
  await sleep(800)
  const xgbEnd = await page.evaluate(() => {
    const t = document.body.innerText
    return {
      done: !!document.querySelector('[data-testid="xgb-done"]'),
      resid: document.querySelectorAll('[data-testid="xgb-resid"]').length,
      loss: t.match(/对数损失 = ([\d.]+)/)?.[1],
      acc: t.match(/训练准确率 = ([\d.]+)%/)?.[1],
    }
  })
  check('推演到终态（轮数完成标记）', xgbEnd.done)
  check('收敛后残差圈大幅减少', xgbEnd.resid < residCount1, `${residCount1} → ${xgbEnd.resid}`)
  check('最终损失低、准确率高', xgbEnd.loss !== null && +xgbEnd.loss < 0.4 && xgbEnd.acc !== null && +xgbEnd.acc > 90, `loss ${xgbEnd.loss}，acc ${xgbEnd.acc}%`)
  await page.screenshot({ path: '/tmp/smoke6-xgb.png', fullPage: true })

  // ========== 4. 回归检查：前 5 个页签没坏 ==========
  console.log('\n【回归检查 · 前 5 个页签】')
  await clickTestId('subtab-dtree')
  await sleep(700)
  check('决策树逐步推演页仍正常', (await text()).includes('树结构图'))
  await clickTestId('subtab-logreg')
  await sleep(700)
  check('逻辑回归推演页仍正常', await page.evaluate(() => !!document.querySelector('[data-testid="logreg-canvas"]')))
  await clickTestId('subtab-knn')
  await sleep(900)
  check('kNN 推演页仍正常', await page.evaluate(() => !!document.querySelector('[data-testid="knn-canvas"]')))
  await clickTestId('subtab-nb')
  await sleep(700)
  check('朴素贝叶斯推演页仍正常', await page.evaluate(() => !!document.querySelector('[data-testid="nb-canvas"]')))
  await clickTestId('subtab-workbench')
  await sleep(700)
  const introOk = await page.evaluate(() => [...document.querySelectorAll('summary')].filter((s) => s.textContent.includes('原理详解')).length)
  check('工作台 7 个方法的「原理详解」仍在', introOk === 7, `找到 ${introOk} 个`)
  await page.screenshot({ path: '/tmp/smoke6-workbench.png', fullPage: true })

  // ========== console 报错 ==========
  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('DevTools'))
  check('全程 console 无报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || '无报错')
} catch (e) {
  fail++
  console.error('❌ 冒烟测试异常：', e)
  await page.screenshot({ path: '/tmp/smoke6-error.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  devProc?.kill()
}

console.log(`\n========================================`)
console.log(`冒烟结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
