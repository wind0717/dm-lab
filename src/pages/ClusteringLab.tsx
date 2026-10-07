// 聚类实验 —— 四个子页签：K-Means 推演 / DBSCAN 推演 / 层次聚类推演 / 多方法对比工作台
// 子页签由 URL 驱动（#/cluster/dbscan），保证链接可直达、刷新不丢
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import KMeansLab from '@/pages/KMeansLab'
import DbscanWalk from '@/pages/cluster/DbscanWalk'
import HierWalk from '@/pages/cluster/HierWalk'
import ClusterWorkbench from '@/pages/cluster/ClusterWorkbench'

export type ClusterTab = 'kmeans' | 'dbscan' | 'hier' | 'workbench'

const TABS: Array<{ id: ClusterTab; label: string }> = [
  { id: 'kmeans', label: 'K-Means 推演' },
  { id: 'dbscan', label: 'DBSCAN 推演' },
  { id: 'hier', label: '层次聚类推演' },
  { id: 'workbench', label: '多方法对比工作台' },
]

const VALID: ClusterTab[] = TABS.map((t) => t.id)

export default function ClusteringLab({ routeTab = 'kmeans' }: { routeTab?: ClusterTab }) {
  const routerNavigate = useNavigate()
  // 兜底非法子页签
  const tab: ClusterTab = VALID.includes(routeTab) ? routeTab : 'kmeans'

  // 切换子页签时回到顶部
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  return (
    <div>
      {/* 子页签 */}
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <div className="inline-flex flex-wrap rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => routerNavigate(`/cluster/${t.id}`)}
              data-testid={`subtab-${t.id}`}
              className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                tab === t.id ? 'bg-indigo-600 font-medium text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'kmeans' && <KMeansLab />}
      {tab === 'dbscan' && <DbscanWalk />}
      {tab === 'hier' && <HierWalk />}
      {tab === 'workbench' && (
        <div className="mx-auto max-w-6xl px-6 py-6">
          <ClusterWorkbench />
        </div>
      )}
    </div>
  )
}
