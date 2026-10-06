// 首页：平台介绍 + 六个模块入口 + 「三分钟看懂数据挖掘」概念导览
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, GitBranch, ScatterChart, MousePointerClick, StepForward, FlaskConical, BookOpen, Wrench, GitCompareArrows, ShoppingBasket, ChevronDown, ChevronUp, Table2, SplitSquareHorizontal, GraduationCap, BrainCircuit, Scale, ArrowRight } from 'lucide-react'
import type { PageId } from '@/App'

interface Props {
  onNavigate: (p: PageId, subTab?: string) => void
}

const MODULES: Array<{
  id: PageId
  subTab?: string
  icon: typeof Sparkles
  title: string
  subtitle: string
  desc: string
  accent: string
}> = [
  {
    id: 'theory',
    icon: BookOpen,
    title: '模块一 · 理论基础',
    subtitle: '数学基础 + 信息论全家桶',
    desc: '概率统计直觉、向量与距离、矩阵与表格，再加熵、信息增益、互信息、KL 散度、增益率——先生活类比，再直觉图形，最后才是公式。',
    accent: 'text-indigo-600 bg-indigo-50',
  },
  {
    id: 'prep',
    icon: Wrench,
    title: '模块二 · 数据预处理',
    subtitle: '垃圾进，垃圾出',
    desc: '缺失值、异常值、标准化、离散化、类别编码、SMOTE 过采样，搭流水线一样叠加操作，直方图和统计量实时前后对比，处理完一键送去分类。',
    accent: 'text-amber-600 bg-amber-50',
  },
  {
    id: 'tree',
    icon: GitCompareArrows,
    title: '模块三 · 分类实验',
    subtitle: '七种方法对比工作台',
    desc: '上传自己的数据，决策树、kNN、逻辑回归、朴素贝叶斯、SVM、随机森林、XGBoost 七种分类方法同场竞技，ROC 曲线与混淆矩阵自动解读。',
    accent: 'text-orange-600 bg-orange-50',
  },
  {
    id: 'tree',
    subTab: 'dtree',
    icon: GitBranch,
    title: '模块四 · 决策树逐步推演',
    subtitle: '看 CART 一刀刀长出来',
    desc: '四种预设数据集，逐步展开每个节点的分裂计算：候选分裂、不纯度下降、叶子成因，全部画出来。支持切换 gini / entropy 对比。',
    accent: 'text-violet-600 bg-violet-50',
  },
  {
    id: 'cluster',
    icon: ScatterChart,
    title: '模块五 · 聚类实验',
    subtitle: 'K-Means · DBSCAN · 层次聚类',
    desc: 'K-Means · DBSCAN · 层次聚类，三种方法各有逐步推演 + 多方法对比工作台，轮廓系数等评估指标实时解读。',
    accent: 'text-emerald-600 bg-emerald-50',
  },
  {
    id: 'assoc',
    icon: ShoppingBasket,
    title: '模块六 · 关联分析',
    subtitle: '购物篮里的秘密 · Apriori 动画推演',
    desc: '从"啤酒与尿布"讲起：项集格上看剪枝动画，Apriori 逐层挖掘频繁项集，支持度 / 置信度 / 提升度三项指标拆穿"热门假象"。',
    accent: 'text-rose-600 bg-rose-50',
  },
]

// ------------------------------------------------------------
// 「三分钟看懂数据挖掘」概念卡：先生活类比 → 一句话定义 → 最小例子
// ------------------------------------------------------------
interface Concept {
  icon: typeof Table2
  term: string
  analogy: string // 生活类比
  core: string // 一句话定义 + 最小例子（≤80 字）
  more: string // 展开内容：与实验的联动引导
  link?: { page: PageId; subTab?: string; label: string }
  accent: string
}

const CONCEPTS: Concept[] = [
  {
    icon: Table2,
    term: '样本 / 特征 / 标签',
    analogy: '就像一张花名册',
    core: '表格里一行 = 一个样本，一列 = 一个特征，"想预测的那列" = 标签。例：一个客户是一行，"活跃天数"是特征，"是否流失"是标签。',
    more: '全平台所有算法处理的都是这样的表格。想弄明白"表格为什么在算法眼里是个矩阵 X"，去理论基础第 7 节亲手悬停对照一下。',
    link: { page: 'theory', subTab: 'math', label: '去数学基础急救包看表格 = 矩阵' },
    accent: 'text-sky-600 bg-sky-50',
  },
  {
    icon: SplitSquareHorizontal,
    term: '分类 vs 聚类 vs 关联',
    analogy: '考试 · 分组 · 购物篮',
    core: '分类 = 有标准答案的考试（有标签，学规律预测新样本）；聚类 = 没人给答案的分组（无标签，自己发现结构）；关联分析 = 找"经常一起出现"的组合。',
    more: '三大任务对应本平台三个核心模块：想预测"会不会违约"用分类，想给客户分群用聚类，想挖"啤酒与尿布"用关联分析。',
    link: { page: 'tree', subTab: 'workbench', label: '先去分类实验感受"有答案的学习"' },
    accent: 'text-violet-600 bg-violet-50',
  },
  {
    icon: GraduationCap,
    term: '训练集 / 测试集',
    analogy: '平时作业 vs 期末考试',
    core: '模型在"作业"（训练集）上学规律，再到没见过的"考卷"（测试集）上评分——用做过的题考自己，高分不算本事。',
    more: '去分类实验把"测试集占比"滑块从默认的 70%:30% 拖到 50%:50%，看测试准确率怎么忽上忽下地"飘"。',
    link: { page: 'tree', subTab: 'workbench', label: '去分类实验拖划分比例' },
    accent: 'text-emerald-600 bg-emerald-50',
  },
  {
    icon: BrainCircuit,
    term: '过拟合 / 欠拟合',
    analogy: '死记硬背 vs 没复习',
    core: '树太深 = 连噪声都背下来的"死记硬背"（过拟合），换个班就考砸；太浅 = 没复习（欠拟合），作业都做不对。',
    more: '去决策树逐步推演：把最大深度从 1 调到 6、噪声拉到 30，亲眼看训练准确率涨、真实边界却越来越"神经质"。',
    link: { page: 'tree', subTab: 'dtree', label: '去决策树实验调深度、调噪声' },
    accent: 'text-orange-600 bg-orange-50',
  },
  {
    icon: Scale,
    term: '模型评估',
    analogy: '准确率会"骗人"',
    core: '100 人里 95 个健康，模型全猜"健康"也有 95% 准确率——类别不均时，准确率会掩盖"少数派全被漏掉"的事实。',
    more: '去分类实验训练任意模型，混淆矩阵下方会用真实数字现场演示"全猜多数类"的准确率，并教你看召回率和 F1。',
    link: { page: 'tree', subTab: 'workbench', label: '去分类实验看混淆矩阵' },
    accent: 'text-rose-600 bg-rose-50',
  },
]

function ConceptCard({ c, onNavigate }: { c: Concept; onNavigate: Props['onNavigate'] }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${open ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-stone-200'}`}
      onClick={() => setOpen(!open)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.accent}`}>
            <c.icon className="h-4 w-4" />
          </span>
          <p className="text-sm font-bold text-stone-800">{c.term}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-stone-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />}
      </div>
      <p className="mt-1.5 text-xs font-medium text-indigo-600">类比：{c.analogy}</p>
      <p className="mt-1.5 text-sm leading-6 text-stone-600">{c.core}</p>
      {open && (
        <div className="mt-2 border-t border-stone-100 pt-2" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs leading-5 text-stone-500">{c.more}</p>
          {c.link && (
            <button
              className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              onClick={() => onNavigate(c.link!.page, c.link!.subTab)}
            >
              {c.link.label}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function HomePage({ onNavigate }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* 头部 */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800">数据挖掘实验教学平台</h1>
        <p className="mt-3 text-base text-stone-500">看得见的数据挖掘 —— 从直觉到算法</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-stone-500">
          不需要任何编程基础。这里的每一个算法都<b className="text-stone-700">把计算过程画出来</b>：
          你可以一步步执行、随手改数据、故意"搞破坏"，在动手中建立直觉。
        </p>
      </div>

      {/* 模块卡片（6 张：自适应网格） */}
      <div className="mt-10 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
        {MODULES.map((m, i) => (
          <Card key={i} className="flex flex-col border-stone-200 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader>
              <div className={`mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg ${m.accent}`}>
                <m.icon className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-stone-800">{m.title}</CardTitle>
              <p className="text-sm font-medium text-stone-500">{m.subtitle}</p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm leading-6 text-stone-600">{m.desc}</p>
              <Button onClick={() => onNavigate(m.id, m.subTab)} className="w-full bg-indigo-600 hover:bg-indigo-700">
                进入实验
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 概念导览：三分钟看懂数据挖掘 */}
      <div className="mt-12">
        <div className="text-center">
          <h2 className="text-xl font-bold text-stone-800">三分钟看懂数据挖掘</h2>
          <p className="mt-1.5 text-sm text-stone-500">五个最常被问到的概念，每张卡先给生活类比——点开还有"去哪里亲手验证"的引导。</p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONCEPTS.map((c) => (
            <ConceptCard key={c.term} c={c} onNavigate={onNavigate} />
          ))}
          {/* 收尾引导卡 */}
          <div className="flex flex-col justify-center rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-4">
            <p className="text-sm font-bold text-indigo-800">看完这 5 张卡，你已经入门了</p>
            <p className="mt-1.5 text-xs leading-5 text-indigo-900/70">
              剩下的交给动手：建议按「理论基础 → 数据预处理 → 分类 → 聚类 → 关联」的顺序，每个模块都拖一拖、改一改。
            </p>
            <button
              className="mt-2 flex items-center gap-1 self-start text-xs font-medium text-indigo-600 hover:text-indigo-800"
              onClick={() => onNavigate('theory', 'math')}
            >
              从理论基础开始
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 使用引导 */}
      <div className="mt-10 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-800">怎么用这个平台？</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="flex gap-3">
            <MousePointerClick className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
            <div>
              <p className="text-sm font-medium text-stone-700">① 先玩，再学</p>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                每个模块都按"生活化类比 → 交互推演 → 自由实验"三段设计，先拖一拖、点一点，再看公式。
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <StepForward className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
            <div>
              <p className="text-sm font-medium text-stone-700">② 一步步执行</p>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                所有算法都有"上一步 / 下一步"按钮，每一步做了什么、为什么这么做，都会同步展示。
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
            <div>
              <p className="text-sm font-medium text-stone-700">③ 大胆搞破坏</p>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                把缺失率拉满、把噪声调到最大、把质心全放进一个团簇……看看算法什么时候会"翻车"，比记住结论更重要。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
