// 应用根组件：顶部导航 + state 切换六个页面（单页，不用路由）
import { useEffect, useState } from 'react'
import { FlaskConical, Home, BookOpen, Wrench, GitBranch, ScatterChart, ShoppingBasket } from 'lucide-react'
import HomePage from '@/pages/HomePage'
import TheoryLab from '@/pages/TheoryLab'
import PreprocessingLab from '@/pages/PreprocessingLab'
import ClassificationLab, { type ClassSubTab } from '@/pages/ClassificationLab'
import ClusteringLab from '@/pages/ClusteringLab'
import AssociationLab from '@/pages/AssociationLab'
import type { CsvData } from '@/lib/csv'

export type PageId = 'home' | 'theory' | 'prep' | 'tree' | 'cluster' | 'assoc'
export type TheoryTab = 'math' | 'info' | 'gini' | 'model'

const NAV: Array<{ id: PageId; label: string; icon: typeof Home }> = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'theory', label: '理论基础', icon: BookOpen },
  { id: 'prep', label: '数据预处理', icon: Wrench },
  { id: 'tree', label: '分类实验', icon: GitBranch },
  { id: 'cluster', label: '聚类实验', icon: ScatterChart },
  { id: 'assoc', label: '关联分析', icon: ShoppingBasket },
]

export default function App() {
  const [page, setPage] = useState<PageId>('home')
  // 预处理 → 分类 的数据接力
  const [handoffCsv, setHandoffCsv] = useState<CsvData | null>(null)
  // 首页卡片可以直达分类实验的某个子页签
  const [treeInitTab, setTreeInitTab] = useState<ClassSubTab>('workbench')
  // 同样可以直达理论基础的某个子页签（数学 / 信息论 / GINI / 模型思维）
  const [theoryInitTab, setTheoryInitTab] = useState<TheoryTab>('math')

  // subTab：tree → ClassSubTab（workbench/dtree/logreg/knn/nb）；theory → 'math' | 'info' | 'gini' | 'model'
  const navigate = (p: PageId, subTab?: string) => {
    if (p === 'tree') setTreeInitTab((subTab as ClassSubTab) ?? 'workbench')
    if (p === 'theory') setTheoryInitTab((subTab as TheoryTab) ?? 'math')
    setPage(p)
  }

  // 切换主页面时回到顶部（SPA 无路由，浏览器不会自动复位滚动）
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  return (
    <div className="min-h-screen bg-[#faf8f5] text-stone-800">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-[#faf8f5]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <button
            onClick={() => setPage('home')}
            className="flex items-center gap-2 text-base font-bold text-stone-800"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <FlaskConical className="h-4 w-4" />
            </span>
            数据挖掘实验教学平台
          </button>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => navigate(n.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  page === n.id
                    ? 'bg-indigo-600 font-medium text-white'
                    : 'text-stone-600 hover:bg-stone-200/70'
                }`}
              >
                <n.icon className="h-3.5 w-3.5" />
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* 页面主体 */}
      <main>
        {page === 'home' && <HomePage onNavigate={navigate} />}
        {page === 'theory' && <TheoryLab onNavigate={navigate} initialTab={theoryInitTab} />}
        {page === 'prep' && (
          <PreprocessingLab
            onSendToClassification={(d) => {
              setHandoffCsv({
                X: d.X,
                y: d.y,
                featureNames: d.featureNames,
                classNames: d.classNames,
                encodings: [],
                preview: d.X.slice(0, 5).map((row, i) => [...row.map((v) => String(v)), d.classNames[d.y[i]]]),
                headers: [...d.featureNames, '标签'],
              })
              navigate('tree')
            }}
          />
        )}
        {page === 'tree' && (
          <ClassificationLab
            injectedCsv={handoffCsv}
            onInjectedConsumed={() => setHandoffCsv(null)}
            initialSubTab={treeInitTab}
            onNavigate={navigate}
          />
        )}
        {page === 'cluster' && <ClusteringLab />}
        {page === 'assoc' && <AssociationLab />}
      </main>

      <footer className="border-t border-stone-200 py-4 text-center text-xs text-stone-400">
        看得见的数据挖掘 —— 每个算法步骤都画出来
      </footer>
    </div>
  )
}
