import puppeteer from 'puppeteer-core'
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const B='http://localhost:8097'
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']})
const p=await b.newPage()
await p.setViewport({width:1400,height:1000})
const errs=[]
p.on('pageerror',e=>errs.push('JS: '+String(e).slice(0,90)))
p.on('console',m=>{if(m.type()==='error')errs.push('CON: '+m.text().slice(0,90))})
let pass=0,fail=0
const chk=(o,m)=>{o?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m))}

console.log('【信息论页】')
await p.goto(B+'/#/theory/info',{waitUntil:'networkidle0'}); await sleep(1600)
const collapsed = await p.evaluate(()=>{
  const t=document.querySelector('[data-testid="manim-demo-toggle"]')
  return {has:!!t, noVideo:!document.querySelector('video')}
})
chk(collapsed.has && collapsed.noVideo,'默认折叠（无 video 元素，零噪音）')
await p.evaluate(()=>document.querySelector('[data-testid="manim-demo-toggle"]')?.click())
await sleep(900)
const exp = await p.evaluate(()=>{
  const v=document.querySelector('video')
  return {hasVideo:!!v, src:v?.getAttribute('src'), clips:document.querySelectorAll('[data-testid^="manim-clip-"]').length}
})
chk(exp.hasVideo,'展开后出现播放器')
chk(exp.src?.includes('/media/'),`视频路径 ${exp.src}`)
chk(exp.clips===4,`4 段动画可选（${exp.clips}）`)
await p.evaluate(()=>document.querySelector('[data-testid="manim-clip-info-mutual-information"]')?.click())
await sleep(800)
const sw = await p.evaluate(()=>document.querySelector('video')?.getAttribute('src'))
chk(sw?.includes('mutual-information'),`切换片段: ${sw?.split('/').pop()}`)
const vid = await p.evaluate(async()=>{
  const v=document.querySelector('video'); if(!v) return {ok:false}
  await new Promise(r=>{ if(v.readyState>=1) return r(); v.onloadedmetadata=r; setTimeout(r,5000) })
  return {ok:true, dur:v.duration, w:v.videoWidth, h:v.videoHeight}
})
chk(vid.ok && vid.dur>5,`视频已加载（${vid.dur?.toFixed(1)}s ${vid.w}x${vid.h}）`)
await p.screenshot({path:'audit-shots/manim-panel.png'})

console.log('')
console.log('【数学基础页】')
await p.goto(B+'/#/theory/math',{waitUntil:'networkidle0'}); await sleep(1500)
const m = await p.evaluate(()=>({has:!!document.querySelector('[data-testid="manim-demo-toggle"]'), noVideo:!document.querySelector('video')}))
chk(m.has && m.noVideo,'有入口且默认折叠')
await p.evaluate(()=>document.querySelector('[data-testid="manim-demo-toggle"]')?.click())
await sleep(800)
const m2 = await p.evaluate(()=>({clips:document.querySelectorAll('[data-testid^="manim-clip-"]').length, hasVideo:!!document.querySelector('video')}))
chk(m2.clips===4 && m2.hasVideo,`4 段 + 播放器（${m2.clips}）`)

console.log('')
console.log('【页面噪音】')
await p.goto(B+'/#/theory/info',{waitUntil:'networkidle0'}); await sleep(1300)
const n = await p.evaluate(()=>({vids:document.querySelectorAll('video').length, txt:document.body.innerText.length}))
chk(n.vids===0,'折叠态无 video 元素')
console.log('')
console.log(`===== ${pass} 通过 / ${fail} 失败 =====`)
console.log('控制台错误:', errs.length?[...new Set(errs)].slice(0,3):'无')
await b.close()
