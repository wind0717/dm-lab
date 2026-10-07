// 模块一：理论基础 —— 四个子页签：数学基础急救包 / 信息论全家桶 / GINI 与不纯度家族 / 模型思维实验室
// 子页签由 URL 驱动（#/theory/info），保证链接可直达、刷新不丢
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import MathBasics from '@/pages/theory/MathBasics'
import InfoTheory from '@/pages/theory/InfoTheory'
import GiniFamily from '@/pages/theory/GiniFamily'
import ModelThinking from '@/pages/theory/ModelThinking'
import type { PageId, TheoryTab } from '@/App'

type TabId = TheoryTab

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'math', label: '数学基础急救包' },
  { id: 'info', label: '信息论全家桶' },
  { id: 'gini', label: 'GINI 与不纯度家族' },
  { id: 'model', label: '模型思维实验室' },
]

const VALID: TabId[] = TABS.map((t) => t.id)

export default function TheoryLab({
  onNavigate,
  routeTab = 'math',
}: {
  onNavigate?: (p: PageId, subTab?: string) => void
  routeTab?: TabId
}) {
  const routerNavigate = useNavigate()
  // 兜底非法子页签（如手输 #/theory/xxx）
  const tab: TabId = VALID.includes(routeTab) ? routeTab : 'math'

  // 切换子页签时回到顶部，避免从长页签底部切过来后落在半中腰
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  return (
    <div>
      {/* 子页签 */}
      <div className="mx-auto max-w-5xl px-6 pt-6">
        <div className="inline-flex flex-wrap rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => routerNavigate(`/theory/${t.id}`)}
              className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                tab === t.id ? 'bg-indigo-600 font-medium text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {tab === 'math' && <MathBasics onNavigate={onNavigate} />}
        {tab === 'info' && <InfoTheory onNavigate={onNavigate} />}
        {tab === 'gini' && <GiniFamily onNavigate={onNavigate} />}
        {tab === 'model' && <ModelThinking onNavigate={onNavigate} />}
      </div>
    </div>
  )
}
