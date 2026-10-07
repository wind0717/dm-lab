// 应用根组件：HashRouter + 顶部导航 + 六个主页面
//
// 为什么用 HashRouter（#/tree/svm）而不是 BrowserRouter（/tree/svm）：
//   本站部署为纯静态托管（dist/ 丢到任意静态平台），没有服务端重写规则。
//   History 模式的 /tree/svm 直接访问会 404，Hash 模式不需要任何服务端配置。
//   代价是 URL 多一个 #，但换来「任何静态托管零配置可用 + 可挂子目录」。
import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router'
import { FlaskConical, Home, BookOpen, Wrench, GitBranch, ScatterChart, ShoppingBasket } from 'lucide-react'
import HomePage from '@/pages/HomePage'
import TheoryLab from '@/pages/TheoryLab'
import PreprocessingLab from '@/pages/PreprocessingLab'
import ClassificationLab, { type ClassSubTab } from '@/pages/ClassificationLab'
import ClusteringLab, { type ClusterTab } from '@/pages/ClusteringLab'
import AssociationLab from '@/pages/AssociationLab'
import type { CsvData } from '@/lib/csv'

export type PageId = 'home' | 'theory' | 'prep' | 'tree' | 'cluster' | 'assoc'
export type TheoryTab = 'math' | 'info' | 'gini' | 'model'

/** 各主页面的默认落地路径（点顶部导航时用） */
const DEFAULT_PATH: Record<PageId, string> = {
  home: '/',
  theory: '/theory/math',
  prep: '/prep',
  tree: '/tree/workbench',
  cluster: '/cluster/kmeans',
  assoc: '/assoc',
}

const NAV: Array<{ id: PageId; label: string; icon: typeof Home }> = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'theory', label: '理论基础', icon: BookOpen },
  { id: 'prep', label: '数据预处理', icon: Wrench },
  { id: 'tree', label: '分类实验', icon: GitBranch },
  { id: 'cluster', label: '聚类实验', icon: ScatterChart },
  { id: 'assoc', label: '关联分析', icon: ShoppingBasket },
]

/** 当前 URL 属于哪个主页面（用于顶部导航高亮） */
function pageOfPath(pathname: string): PageId {
  if (pathname.startsWith('/theory')) return 'theory'
  if (pathname.startsWith('/prep')) return 'prep'
  if (pathname.startsWith('/tree')) return 'tree'
  if (pathname.startsWith('/cluster')) return 'cluster'
  if (pathname.startsWith('/assoc')) return 'assoc'
  return 'home'
}

/** 从 URL 里取出子页签段（'/tree/svm' → 'svm'，无则返回 undefined） */
function segOf(pathname: string, idx: number): string | undefined {
  const seg = pathname.split('/')[idx]
  return seg && seg.length > 0 ? seg : undefined
}

/** 跨页跳转回调签名：各 Lab 内部仍用语义调用 onNavigate('tree', 'svm') */
export type NavigateFn = (p: PageId, subTab?: string) => void

function Shell() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const currentPage = pageOfPath(location.pathname)

  // 预处理 → 分类的数据接力（跨路由传递，需提升到 Shell）
  const [handoffCsv, setHandoffCsv] = useState<CsvData | null>(null)

  // 换页时回到顶部（SPA 换页，浏览器不会自动复位滚动）
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  /** 把 (page, subTab) 翻译成路径后跳转 */
  const navigate: NavigateFn = (p, subTab) => {
    const base = DEFAULT_PATH[p]
    if (!base) return
    const path = subTab ? base.replace(/\/[^/]+$/, `/${subTab}`) : base
    // 已在目标路径则不重复跳转，避免同页滚动跳动
    if (location.pathname === path) return
    routerNavigate(path)
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-stone-800">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-[#faf8f5]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <button
            onClick={() => routerNavigate('/')}
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
                onClick={() => routerNavigate(DEFAULT_PATH[n.id])}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  currentPage === n.id
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

      {/* 页面主体：URL 段 → 各 Lab 的当前子页签 */}
      <main>
        <Routes>
          <Route path="/" element={<HomePage onNavigate={navigate} />} />
          <Route
            path="/theory/:tab"
            element={
              <TheoryLab
                onNavigate={navigate}
                routeTab={(segOf(location.pathname, 2) ?? 'math') as TheoryTab}
              />
            }
          />
          <Route
            path="/prep"
            element={
              <PreprocessingLab
                onSendToClassification={(d) => {
                  setHandoffCsv({
                    X: d.X,
                    y: d.y,
                    featureNames: d.featureNames,
                    classNames: d.classNames,
                    encodings: [],
                    preview: d.X
                      .slice(0, 5)
                      .map((row, i) => [...row.map((v) => String(v)), d.classNames[d.y[i]]]),
                    headers: [...d.featureNames, '标签'],
                  })
                  navigate('tree', 'workbench')
                }}
              />
            }
          />
          <Route
            path="/tree/:tab"
            element={
              <ClassificationLab
                onNavigate={navigate}
                routeTab={(segOf(location.pathname, 2) ?? 'workbench') as ClassSubTab}
                injectedCsv={handoffCsv}
                onInjectedConsumed={() => setHandoffCsv(null)}
              />
            }
          />
          <Route
            path="/cluster/:tab"
            element={<ClusteringLab routeTab={(segOf(location.pathname, 2) ?? 'kmeans') as ClusterTab} />}
          />
          <Route path="/assoc" element={<AssociationLab />} />
          {/* 未知路径回首页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="border-t border-stone-200 py-4 text-center text-xs text-stone-400">
        看得见的数据挖掘 —— 每个算法步骤都画出来
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
