// ============================================================
// 关联分析实验 —— 购物篮里的秘密（Apriori 动画推演）
// 上部：理论区（可折叠卡片组：基本概念 + 项集格剪枝演示）
// 下部：演示实验区（数据 / Apriori 逐步动画 / 规则生成表）
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import ThinkBox from '@/components/ThinkBox'
import {
  apriori,
  genRules,
  genCampusBasket,
  parseBasketCsv,
  sampleBasketCsv,
  buildLattice,
  supersetKeys,
  itemsetKey,
  type AprioriResult,
  type Transaction,
} from '@/lib/apriori'
import { AlertTriangle, ChevronDown, ChevronUp, Download, Pause, Play, Plus, RotateCcw, ShoppingBasket, StepForward, Upload, X } from 'lucide-react'

const LATTICE_ITEMS = ['牛奶', '面包', '啤酒', '尿布']

export default function AssociationLab() {
  // ---- 数据 ----
  // 动画进度依赖 transactions / minSupport，任何一项变化都要从头播。
  // 原先放在 useEffect 里监听，但那样会先渲染一帧旧进度再纠正（肉眼可见闪一下），
  // 改为在数据变更入口就重置。React 18+ 的推荐做法。
  const [rawTx, setRawTx] = useState<Transaction[]>(() => genCampusBasket(200, 42))
  const [dataTab, setDataTab] = useState<'builtin' | 'editor' | 'csv'>('builtin')
  const [csvError, setCsvError] = useState<string | null>(null)
  const [csvName, setCsvName] = useState('')

  // ---- Apriori 动画 ----
  const [rawSupport, setRawSupport] = useState(0.15)
  const [stepIdx, setStepIdx] = useState(-1) // -1 未开始；每层 2 步：计数 / 剪枝
  const [auto, setAuto] = useState(false)

  // ---- 规则 ----
  const [minConf, setMinConf] = useState(0.5)
  const [sortBy, setSortBy] = useState<'support' | 'confidence' | 'lift'>('lift')
  const [sortDesc, setSortDesc] = useState(true)
  const [highlightKey, setHighlightKey] = useState<string | null>(null)

  /** 动画归零：换数据或换阈值时调用 */
  const resetAnim = () => {
    setStepIdx(-1)
    setAuto(false)
    setHighlightKey(null)
  }

  /** 写数据即重置动画 */
  function setTransactions(next: Transaction[] | ((prev: Transaction[]) => Transaction[])) {
    setRawTx(next)
    resetAnim()
  }

  /** 改阈值即重置动画 */
  function setMinSupport(v: number) {
    setRawSupport(v)
    resetAnim()
  }

  const transactions = rawTx
  const minSupport = rawSupport

  // ---- 格理论演示 ----
  const [latticeThreshold, setLatticeThreshold] = useState(0.4)
  const [prunedFrom, setPrunedFrom] = useState<string | null>(null)

  const result: AprioriResult = useMemo(() => apriori(transactions, minSupport), [transactions, minSupport])
  const totalSteps = result.levels.length * 2
  const done = stepIdx >= totalSteps - 1 && totalSteps > 0

  // 自动播放
  useEffect(() => {
    if (!auto) return
    if (stepIdx >= totalSteps - 1) {
    // 自动播放到末尾就该停：这是对定时器这一外部系统的同步，
    // 属于 useEffect 的正当用途（不是把 props 同步成 state）。
    // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuto(false)
      return
    }
    const t = setTimeout(() => setStepIdx((s) => s + 1), 950)
    return () => clearTimeout(t)
  }, [auto, stepIdx, totalSteps])

  const rules = useMemo(() => (done ? genRules(result, minConf) : []), [done, result, minConf])
  const sortedRules = useMemo(() => {
    const r = [...rules]
    r.sort((a, b) => (sortDesc ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]))
    return r
  }, [rules, sortBy, sortDesc])
  const topRule = useMemo(() => (rules.length > 0 ? rules.reduce((a, b) => (b.lift > a.lift ? b : a)) : null), [rules])

  // 格数据（随交易数据 + 格阈值实时计算）
  const lattice = useMemo(() => buildLattice(LATTICE_ITEMS, transactions, latticeThreshold), [transactions, latticeThreshold])
  const maxSup = Math.max(0.001, ...lattice.map((n) => n.support))
  const prunedSet = useMemo(() => {
    if (!prunedFrom) return new Set<string>()
    const node = lattice.find((n) => n.key === prunedFrom)
    return node ? supersetKeys(node, LATTICE_ITEMS) : new Set<string>()
  }, [prunedFrom, lattice])

  // ---- 编辑器 ----
  const editorItems = useMemo(() => {
    const cnt = new Map<string, number>()
    for (const t of transactions) for (const it of t.items) cnt.set(it, (cnt.get(it) ?? 0) + 1)
    return Array.from(cnt.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([it]) => it)
  }, [transactions])

  const toggleItem = (tid: number, item: string) => {
    setTransactions((ts) =>
      ts.map((t) => {
        if (t.id !== tid) return t
        const has = t.items.includes(item)
        const items = has ? t.items.filter((x) => x !== item) : [...t.items, item].sort()
        return { ...t, items }
      }),
    )
  }

  // ---- CSV ----
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const handleFile = (file: File) => {
    setCsvError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const tx = parseBasketCsv(String(reader.result))
        setTransactions(tx)
        setCsvName(file.name)
      } catch (e) {
        setCsvError(e instanceof Error ? e.message : '解析失败')
      }
    }
    reader.readAsText(file, 'utf-8')
  }
  const downloadSample = () => {
    const blob = new Blob(['﻿' + sampleBasketCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '示例数据-购物篮.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const itemStats = useMemo(() => {
    const cnt = new Map<string, number>()
    for (const t of transactions) for (const it of t.items) cnt.set(it, (cnt.get(it) ?? 0) + 1)
    return Array.from(cnt.entries()).sort((a, b) => b[1] - a[1])
  }, [transactions])

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">模块六 · 关联分析：购物篮里的秘密</h1>
        <p className="mt-1 text-sm leading-6 text-stone-500">
          沃尔玛的经典传说：把<b className="text-stone-700">尿布和啤酒</b>摆在一起卖，两边销量都涨了——因为数据分析发现年轻爸爸买尿布时常顺手带啤酒。
          关联分析要回答的就是：<b className="text-stone-700">哪些商品总被一起买？这种"一起"是真的关联，还是仅仅因为它们都热门？</b>
        </p>
      </div>

      {/* ================= 理论区 ================= */}
      <TheorySection
        lattice={lattice}
        maxSup={maxSup}
        latticeThreshold={latticeThreshold}
        setLatticeThreshold={setLatticeThreshold}
        prunedFrom={prunedFrom}
        setPrunedFrom={setPrunedFrom}
        prunedSet={prunedSet}
        nTrans={transactions.length}
      />

      {/* ================= 数据 ================= */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-stone-800">
            <ShoppingBasket className="h-4 w-4 text-indigo-500" />
            数据：校园超市购物篮
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['builtin', '内置购物篮（200 笔）'],
                ['editor', '交易编辑器'],
                ['csv', 'CSV 上传'],
              ] as const
            ).map(([t, name]) => (
              <Button
                key={t}
                size="sm"
                variant={dataTab === t ? 'default' : 'outline'}
                className={dataTab === t ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                onClick={() => setDataTab(t)}
              >
                {name}
              </Button>
            ))}
          </div>

          {dataTab === 'builtin' && (
            <div className="space-y-2">
              <p className="text-sm leading-6 text-stone-600">
                共 <b className="font-mono text-indigo-700">{transactions.length}</b> 笔交易、{itemStats.length} 种商品。
                商品被一起买的频次里藏着几条"隐藏规律"——用下面的 Apriori 把它们挖出来。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {itemStats.map(([it, c]) => (
                  <span key={it} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
                    {it} <b className="font-mono text-indigo-600">{c}</b>
                  </span>
                ))}
                <Button size="sm" variant="outline" onClick={() => setTransactions(genCampusBasket(200, Math.floor(Math.random() * 100000)))}>
                  换一批随机数据
                </Button>
              </div>
            </div>
          )}

          {dataTab === 'editor' && (
            <div className="space-y-2">
              <p className="text-xs leading-5 text-stone-500">
                每一行是一笔交易，点格子勾选/取消商品（改动后动画自动重置）。共 {transactions.length} 笔，可增删。
              </p>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-stone-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-stone-50">
                    <tr className="border-b border-stone-200">
                      <th className="px-2 py-1.5 text-left font-medium text-stone-500">#</th>
                      {editorItems.map((it) => (
                        <th key={it} className="px-1 py-1.5 text-center font-medium text-stone-500">
                          {it}
                        </th>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b border-stone-100">
                        <td className="px-2 py-0.5 font-mono text-stone-400">{t.id + 1}</td>
                        {editorItems.map((it) => {
                          const has = t.items.includes(it)
                          return (
                            <td key={it} className="px-1 py-0.5 text-center">
                              <button
                                className={`inline-block h-4 w-4 rounded border transition-colors ${
                                  has ? 'border-indigo-600 bg-indigo-500' : 'border-stone-300 bg-white hover:border-indigo-300'
                                }`}
                                onClick={() => toggleItem(t.id, it)}
                                aria-label={`${t.id + 1}-${it}`}
                              />
                            </td>
                          )
                        })}
                        <td className="px-1 text-center">
                          <button
                            className="text-stone-300 hover:text-red-500"
                            onClick={() => setTransactions((ts) => ts.filter((x) => x.id !== t.id))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTransactions((ts) => [...ts, { id: Math.max(-1, ...ts.map((t) => t.id)) + 1, items: [] }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加一笔空交易
              </Button>
            </div>
          )}

          {dataTab === 'csv' && (
            <div className="space-y-2">
              <div
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  dragging ? 'border-indigo-400 bg-indigo-50' : 'border-stone-300 bg-stone-50 hover:border-indigo-300'
                }`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
              >
                <Upload className="h-5 w-5 text-stone-400" />
                <p className="text-sm text-stone-600">
                  拖拽 CSV 到这里，或 <span className="font-medium text-indigo-600">点击选择文件</span>
                </p>
                <p className="text-xs text-stone-400">每行一笔交易，逗号分隔商品名（无表头），如「牛奶,面包,鸡蛋」 · ≤5000 笔 · ≤12 种商品（种类受限是因为 Apriori 要枚举 2^k 个子集，指数复杂度）</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ''
                  }}
                />
              </div>
              <Button size="sm" variant="outline" onClick={downloadSample}>
                <Download className="mr-1 h-3.5 w-3.5" />
                下载示例 CSV（购物篮 25 笔）
              </Button>
              {csvError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{csvError}</p>}
              {csvName && !csvError && (
                <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                  已载入 {csvName}：{transactions.length} 笔交易、{itemStats.length} 种商品
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================= Apriori 动画 ================= */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-stone-800">Apriori 逐步挖掘</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-64">
              <SliderRow
                label="支持度阈值"
                value={minSupport}
                min={0.05}
                max={0.5}
                step={0.01}
                onChange={setMinSupport}
                format={(v) => `${(v * 100).toFixed(0)}%（≥ ${result.minCount} 笔）`}
              />
            </div>
            <div className="flex gap-1.5 pb-0.5">
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={transactions.length === 0 || done}
                onClick={() => setStepIdx((s) => s + 1)}
              >
                <StepForward className="mr-1 h-3.5 w-3.5" />
                下一步
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={transactions.length === 0 || done}
                onClick={() => setAuto(!auto)}
              >
                {auto ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                自动播放
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setStepIdx(-1)
                  setAuto(false)
                }}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                重置
              </Button>
            </div>
            <p className="pb-1 text-xs text-stone-500">
              每层两步：先统计所有候选项集的支持度（条形生长），再把低于阈值的剪掉（变灰）——被剪掉的项集，它的超集连候选资格都没有。
            </p>
          </div>

          {stepIdx < 0 && (
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-500">
              点「下一步」开始：第 1 层先数每个单品的支持度。当前阈值下，一笔组合至少要出现 {result.minCount} 次才算"频繁"。
            </p>
          )}

          {/* 层级展示 */}
          {result.levels.map((lv, li) => {
            const levelVisible = stepIdx >= li * 2
            if (!levelVisible) return null
            const pruned = stepIdx >= li * 2 + 1 // 是否已剪枝
            const candN = lv.candidates.length
            const aliveN = lv.frequent.filter(Boolean).length
            const maxC = Math.max(1, ...lv.counts)
            return (
              <div key={li} className="rounded-lg border border-stone-200 bg-stone-50/50 p-3">
                <p className="mb-2 text-sm font-medium text-stone-700">
                  第 {lv.level} 层 · {lv.level} 项集
                  <span className="ml-2 text-xs font-normal text-stone-500">
                    候选 {candN} 个{pruned && <> → 存活 <b className="text-emerald-600">{aliveN}</b> 个，剪掉 <b className="text-red-500">{candN - aliveN}</b> 个</>}
                    {!pruned && ' → 计数中…'}
                  </span>
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {lv.candidates.map((cand, ci) => {
                    const freq = lv.frequent[ci]
                    const key = itemsetKey(cand)
                    const pct = (lv.counts[ci] / maxC) * 100
                    return (
                      <div
                        key={key}
                        className={`rounded-md border px-2 py-1.5 transition-all duration-500 ${
                          pruned && !freq
                            ? 'border-stone-200 bg-white opacity-40 grayscale'
                            : highlightKey === key
                              ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-300'
                              : 'border-stone-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-medium ${pruned && !freq ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                            {cand.join(' + ')}
                            {pruned && !freq && <span className="ml-1 no-underline">✂</span>}
                          </span>
                          <span className="font-mono text-stone-500">
                            {lv.counts[ci]}/{result.nTrans}
                          </span>
                        </div>
                        <GrowBar pct={pct} color={pruned && !freq ? '#d6d3d1' : freq ? '#4f46e5' : '#f97316'} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {done && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              挖掘完成 ✓ 共找到 {result.frequentItemsets.length} 个频繁项集（最高 {result.levels[result.levels.length - 1]?.level ?? 0} 项集）。下面生成关联规则。
            </p>
          )}
        </CardContent>
      </Card>

      {/* ================= 规则生成 ================= */}
      {done && (
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-stone-800">关联规则生成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-64">
                <SliderRow
                  label="置信度阈值"
                  value={minConf}
                  min={0.3}
                  max={1}
                  step={0.05}
                  onChange={setMinConf}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
              </div>
              <p className="text-xs text-stone-500">点表头可排序；点某条规则可以高亮它来自哪个项集。</p>
            </div>

            {topRule && (
              <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm leading-6 text-orange-900">
                本数据中最强规则：<b>{topRule.antecedent.join(' + ')} → {topRule.consequent.join(' + ')}</b>，
                置信度 {topRule.confidence.toFixed(2)}，提升度 {topRule.lift.toFixed(2)}——
                买「{topRule.antecedent.join(' + ')}」的人买「{topRule.consequent.join(' + ')}」的可能性是平均水平的 {topRule.lift.toFixed(1)} 倍。
              </p>
            )}
            {rules.length === 0 && (
              <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-500">
                当前置信度阈值下没有规则剩下——试试把阈值调低一点。
              </p>
            )}

            {rules.length > 0 && (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-stone-200">
                <table className="w-full text-sm" data-testid="rules-table">
                  <thead className="sticky top-0 bg-stone-50">
                    <tr className="border-b border-stone-200 text-xs text-stone-500">
                      <th className="px-3 py-2 text-left font-medium">规则</th>
                      {(
                        [
                          ['support', '支持度'],
                          ['confidence', '置信度'],
                          ['lift', '提升度'],
                        ] as const
                      ).map(([col, name]) => (
                        <th
                          key={col}
                          className="cursor-pointer px-3 py-2 text-right font-medium hover:text-indigo-600"
                          onClick={() => {
                            if (sortBy === col) setSortDesc(!sortDesc)
                            else {
                              setSortBy(col)
                              setSortDesc(true)
                            }
                          }}
                        >
                          {name} {sortBy === col ? (sortDesc ? '↓' : '↑') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRules.map((r, i) => (
                      <tr
                        key={i}
                        className={`cursor-pointer border-b border-stone-100 transition-colors ${
                          highlightKey === r.itemsetKey ? 'bg-orange-50' : 'hover:bg-stone-50'
                        }`}
                        onClick={() => setHighlightKey(highlightKey === r.itemsetKey ? null : r.itemsetKey)}
                      >
                        <td className="px-3 py-1.5">
                          <span className="font-medium text-stone-700">{r.antecedent.join(' + ')}</span>
                          <span className="mx-1.5 text-indigo-500">→</span>
                          <span className="font-medium text-stone-700">{r.consequent.join(' + ')}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-stone-600">{(r.support * 100).toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right font-mono text-stone-600">{r.confidence.toFixed(2)}</td>
                        <td className={`px-3 py-1.5 text-right font-mono font-semibold ${r.lift > 1 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {r.lift.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs leading-5 text-stone-500">
              提升度 &gt; 1 才是真关联（绿色）；&lt; 1（红色）说明两者一起买反而比随机还少——置信度再高也可能只是"后件太热门"的假象。
            </p>
          </CardContent>
        </Card>
      )}

      <ThinkBox
        questions={[
          '把支持度阈值调到 0.5，还剩几条规则？为什么越往高层（3 项集、4 项集）存活越少？',
          '找一条提升度 < 1 的规则：它的置信度可能并不低，为什么说它是"热门商品的假象"？',
          '在交易编辑器里手工造 5 笔「牛奶 + 卫生巾」，再重跑动画——支持度和规则有什么变化？',
          '为什么 Apriori 不用枚举所有可能的商品组合？（提示：回想上面格图里的剪枝动画）',
        ]}
      />
    </div>
  )
}

// ------------------------------------------------------------
// 理论区（可折叠卡片组）
// ------------------------------------------------------------
function TheorySection({
  lattice,
  maxSup,
  latticeThreshold,
  setLatticeThreshold,
  prunedFrom,
  setPrunedFrom,
  prunedSet,
  nTrans,
}: {
  lattice: ReturnType<typeof buildLattice>
  maxSup: number
  latticeThreshold: number
  setLatticeThreshold: (v: number) => void
  prunedFrom: string | null
  setPrunedFrom: (v: string | null) => void
  prunedSet: Set<string>
  nTrans: number
}) {
  const [openConcept, setOpenConcept] = useState(true)
  const [openLattice, setOpenLattice] = useState(true)

  return (
    <div className="space-y-4">
      {/* ---- 基本概念 ---- */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader
          className="cursor-pointer select-none pb-2"
          onClick={() => setOpenConcept(!openConcept)}
        >
          <CardTitle className="flex items-center justify-between text-base text-stone-800">
            <span>基本概念：三个度量，一个都不能少</span>
            {openConcept ? <ChevronUp className="h-4 w-4 text-stone-400" /> : <ChevronDown className="h-4 w-4 text-stone-400" />}
          </CardTitle>
        </CardHeader>
        {openConcept && (
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm font-semibold text-indigo-700">支持度 support：有多常见</p>
                <p className="mt-1 rounded bg-stone-50 px-2 py-1 font-mono text-xs text-stone-600">
                  support({'{牛奶}'}) = 含牛奶的交易数 ÷ 总交易数
                </p>
                <p className="mt-1.5 text-xs leading-5 text-stone-500">
                  <b>项</b>就是商品，<b>项集</b>是一组商品，所有小票构成<b>交易数据库</b>。支持度低的组合是"冷门"，先砍掉。
                </p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm font-semibold text-indigo-700">置信度 conf：有多靠谱</p>
                <p className="mt-1 rounded bg-stone-50 px-2 py-1 font-mono text-xs text-stone-600">
                  conf(牛奶→面包) = support(牛奶+面包) ÷ support(牛奶)
                </p>
                <p className="mt-1.5 text-xs leading-5 text-stone-500">
                  买了牛奶的人里，多大比例也买了面包。但注意：如果面包人人都买，这条规则置信度天然就高。
                </p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm font-semibold text-orange-600">提升度 lift：是不是真关联</p>
                <p className="mt-1 rounded bg-stone-50 px-2 py-1 font-mono text-xs text-stone-600">
                  lift(A→B) = conf(A→B) ÷ support(B)
                </p>
                <p className="mt-1.5 text-xs leading-5 text-stone-500">
                  "买了 A"让"买 B"的可能性翻了几倍。<b>lift &gt; 1 才说明真关联</b>。
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <b>警示：</b>只买热门的组合，置信度高往往是假象——比如"牛奶→面包"置信度 0.9，可能只是面包人人都买（support 0.9），提升度 ≈ 1 露馅。
                看规则一定要三项一起看：<b>支持度</b>管常见、<b>置信度</b>管靠谱、<b>提升度</b>管真假。
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ---- 格理论与剪枝 ---- */}
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="cursor-pointer select-none pb-2" onClick={() => setOpenLattice(!openLattice)}>
          <CardTitle className="flex items-center justify-between text-base text-stone-800">
            <span>项集格（Lattice）：Apriori 能少算一大半的秘密</span>
            {openLattice ? <ChevronUp className="h-4 w-4 text-stone-400" /> : <ChevronDown className="h-4 w-4 text-stone-400" />}
          </CardTitle>
        </CardHeader>
        {openLattice && (
          <CardContent className="space-y-3">
            <p className="text-sm leading-6 text-stone-600">
              4 个商品能组成 2⁴ = 16 种项集（n 个商品就是 2ⁿ 种，指数爆炸）。把它们按大小分层画出来就是<b>项集格</b>。
              节点颜色越深支持度越高（基于下方当前购物篮数据实时计算，共 {nTrans} 笔）。
              <b className="text-stone-800">点一个非频繁（虚线边框）的节点试试</b>：它的所有超集都会被直接剪掉——因为"子集都不频繁，超集不可能频繁"。
            </p>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
              <LatticeSvg lattice={lattice} maxSup={maxSup} prunedSet={prunedSet} onNodeClick={(key, freq) => (freq ? setPrunedFrom(null) : setPrunedFrom(key))} />
              <div className="space-y-3">
                <SliderRow
                  label="频繁阈值"
                  value={latticeThreshold}
                  min={0.1}
                  max={0.7}
                  step={0.05}
                  onChange={(v) => {
                    setLatticeThreshold(v)
                    setPrunedFrom(null)
                  }}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">
                  {prunedFrom === null ? (
                    <>
                      <p className="font-medium text-stone-700">怎么玩：</p>
                      <p>① 拖阈值滑块，看哪些节点变虚线（非频繁）；② 点一个虚线节点，它的全部超集瞬间变灰被剪掉。</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-red-600">「{prunedFrom.replaceAll('|', ' + ') || '∅'}」支持度不足</p>
                      <p className="mt-1">
                        → 它的 {prunedSet.size} 个超集<b>都不用数了</b>，直接剪掉！换个更大的项集点，能剪掉一整片。
                      </p>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setPrunedFrom(null)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    恢复格图
                  </Button>
                </div>
                <p className="text-xs leading-5 text-stone-500">
                  实线边框 = 频繁项集；虚线 = 非频繁。频繁项集的所有子集必然也频繁——从下往上看，一路都是实线。
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

// ------------------------------------------------------------
// 项集格 SVG：分层布局 ∅ → 单项 → 2 项 → 3 项 → 4 项
// ------------------------------------------------------------
function LatticeSvg({
  lattice,
  maxSup,
  prunedSet,
  onNodeClick,
}: {
  lattice: ReturnType<typeof buildLattice>
  maxSup: number
  prunedSet: Set<string>
  onNodeClick: (key: string, frequent: boolean) => void
}) {
  const LW = 660
  const LH = 330
  const levels = 5 // 0..4
  const byLevel: Array<typeof lattice> = Array.from({ length: levels }, () => [])
  for (const node of lattice) byLevel[node.level].push(node)
  // 每层内部按项集字典序排序，保证布局稳定
  for (const arr of byLevel) arr.sort((a, b) => a.key.localeCompare(b.key))

  const pos = new Map<string, { x: number; y: number }>()
  byLevel.forEach((arr, lv) => {
    const y = LH - 44 - (lv * (LH - 88)) / (levels - 1)
    arr.forEach((node, i) => {
      const x = LW / 2 + (i - (arr.length - 1) / 2) * Math.min(96, (LW - 80) / Math.max(1, arr.length - 1 || 1))
      pos.set(node.key, { x, y })
    })
  })

  // 边：level l 节点 → level l-1 中差一个商品的子集
  const edges: Array<[string, string]> = []
  for (const node of lattice) {
    if (node.level === 0) continue
    for (let i = 0; i < node.items.length; i++) {
      const sub = node.items.filter((_, j) => j !== i)
      edges.push([itemsetKey(sub), node.key])
    }
  }

  return (
    <svg width="100%" viewBox={`0 0 ${LW} ${LH}`} className="rounded-lg border border-stone-200 bg-white" data-testid="lattice">
      {edges.map(([a, b], i) => {
        const pa = pos.get(a)!
        const pb = pos.get(b)!
        const dim = prunedSet.has(b)
        return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={dim ? '#e7e5e4' : '#c7d2fe'} strokeWidth={1} className="transition-all duration-500" />
      })}
      {lattice.map((node) => {
        const p = pos.get(node.key)!
        const pruned = prunedSet.has(node.key)
        const depth = node.support / maxSup
        return (
          <g
            key={node.key}
            className="cursor-pointer transition-opacity duration-500"
            opacity={pruned ? 0.18 : 1}
            onClick={() => onNodeClick(node.key, node.frequent)}
            data-key={node.key}
            data-frequent={node.frequent}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r={17}
              fill={`rgba(249, 115, 22, ${0.08 + depth * 0.75})`}
              stroke={node.frequent ? '#4f46e5' : '#dc2626'}
              strokeWidth={node.frequent ? 1.6 : 1.4}
              strokeDasharray={node.frequent ? undefined : '4 3'}
            />
            <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={depth > 0.45 ? '#fff' : '#57534e'}>
              {(node.support * 100).toFixed(0)}%
            </text>
            <text x={p.x} y={p.y + 29} textAnchor="middle" fontSize={10} fill="#44403c">
              {node.items.length === 0 ? '∅' : node.items.join('+')}
            </text>
            {pruned && (
              <text x={p.x + 14} y={p.y - 12} fontSize={11}>
                ✂
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ------------------------------------------------------------
// 支持度条形（挂载时从 0 生长到目标宽度）
// ------------------------------------------------------------
function GrowBar({ pct, color }: { pct: number; color: string }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setW(pct))
    return () => cancelAnimationFrame(t)
  }, [pct])
  return (
    <div className="mt-1 h-1.5 rounded bg-stone-100">
      <div className="h-1.5 rounded transition-all duration-700" style={{ width: `${w}%`, backgroundColor: color }} />
    </div>
  )
}
