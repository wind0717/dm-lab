// ============================================================
// 原理屏：把 Apriori 与 FP-Growth 讲透
// ============================================================
// 每一屏的结构固定为四段（这个顺序是刻意的）：
//   ① 生活类比 —— 先有直觉
//   ② 形式化定义 —— 再有精确语言
//   ③ 核心洞察 —— 说清「凭什么行」
//   ④ 常见误区 —— 主动堵住学生最容易想错的地方
//
// 这样安排的原因：学生最常见的失败不是看不懂公式，
// 而是「公式背下来了但不知道每一步在干什么」。
// ============================================================

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Lightbulb, AlertTriangle, Key } from 'lucide-react'

interface Props {
  minCount: number
  nTrans: number
  onGoDemo: () => void
}

type AlgId = 'apriori' | 'fpgrowth'

export default function AlgPrinciple({ minCount, nTrans, onGoDemo }: Props) {
  const [alg, setAlg] = useState<AlgId>('apriori')

  return (
    <div className="space-y-5">
      {/* 顶部再分一层：选讲哪个算法 */}
      <div className="flex gap-2">
        {(
          [
            ['apriori', 'Apriori', '逐层扫描，教科书式的基础算法'],
            ['fpgrowth', 'FP-Growth', '只扫一遍，工业界主流'],
          ] as const
        ).map(([id, name, hint]) => (
          <button
            key={id}
            onClick={() => setAlg(id)}
            className={`flex-1 rounded-lg border px-4 py-3 text-left transition-all ${
              alg === id
                ? 'border-indigo-300 bg-indigo-50/70 ring-1 ring-indigo-200'
                : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <p className={`text-sm font-medium ${alg === id ? 'text-indigo-700' : 'text-stone-700'}`}>
              {name}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">{hint}</p>
          </button>
        ))}
      </div>

      {alg === 'apriori' ? <AprioriPrinciple minCount={minCount} nTrans={nTrans} /> : <FpGrowthPrinciple minCount={minCount} nTrans={nTrans} />}

      {/* 两者关系：这是学生最常混淆的点 */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-amber-800">
            <Key className="h-4 w-4" />
            两者是什么关系？
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-stone-700">
          <p>
            <strong className="text-stone-900">不是两种思想，是同一个思想的两代实现。</strong>
          </p>
          <p>
            两个算法的目标完全相同：找出所有支持度 ≥ 阈值的项集。
            而且剪枝依据也<strong className="text-stone-900">完全相同</strong>——
            都靠「频繁项集的所有子集必然频繁」这条反单调性。
          </p>
          <p>
            差别只在<strong className="text-stone-900">怎么高效地找到它们</strong>：
            Apriori 靠「一层层扫数据库」，FP-Growth 靠「把数据库压成一棵树」。
          </p>
          <div className="rounded-lg bg-white p-3 font-mono text-xs text-stone-600">
            同一剪枝原理 + 不同执行方式 = 两代算法
          </div>
          <p className="text-xs text-stone-500">
            所以在考试里，如果问「FP-Growth 的剪枝原理是什么」，
            答案和 Apriori 是同一句话。换个问法考执行效率，才是两者的区别。
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onGoDemo}>
          原理看完了，去看逐步演示
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Apriori 原理
// ============================================================
function AprioriPrinciple({ minCount, nTrans }: { minCount: number; nTrans: number }) {
  return (
    <div className="space-y-4">
      {/* ① 生活类比 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-stone-800">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            ① 生活类比：超市收银小票
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-stone-700">
          <p>
            你有一沓购物小票，想找出「哪些商品总是一起被买」。
            你是怎么做的？
          </p>
          <ul className="ml-4 list-disc space-y-1 text-stone-600">
            <li>先看<b>单品</b>：牛奶出现在很多小票上 → 记下（频繁）</li>
            <li>再看<b>两件套</b>：每张同时买了牛奶和面包的小票，凑成「｛牛奶, 面包｝」→ 数它出现几次</li>
            <li>如果「｛牛奶, 面包｝」只出现在 2 张小票上，数量太少 → <b>丢弃</b>，而且连三件套都不用数了</li>
          </ul>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>最后那句「连三件套都不用数了」就是 Apriori 的全部灵魂。</strong>
            因为如果「｛牛奶, 面包｝」本身都不频繁，
            那么任何包含它的大项集｛牛奶, 面包, X｝只会更少，绝不可能频繁。
          </p>
        </CardContent>
      </Card>

      {/* ② 形式化定义 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-stone-800">② 形式化定义</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 p-3">
              <p className="text-xs font-medium text-stone-600">支持度 support</p>
              <p className="mt-1 font-mono text-sm text-stone-800">
                sup(A) = 含 A 的交易数 / 总交易数
              </p>
              <p className="mt-1 text-xs text-stone-500">
                「{nTrans} 笔交易里，有多少比例买了这套货」
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 p-3">
              <p className="text-xs font-medium text-stone-600">置信度 confidence</p>
              <p className="mt-1 font-mono text-sm text-stone-800">conf(A→B) = sup(A∪B) / sup(A)</p>
              <p className="mt-1 text-xs text-stone-500">
                「买了 A 的人里有多大比例还买了 B」
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium text-stone-700">当前参数的含义</p>
            <p className="mt-1 font-mono text-sm text-stone-800">
              支持度 ≥ 某个阈值 ⟺ 出现次数 ≥ {minCount} 笔
            </p>
            <p className="mt-1 text-xs text-stone-500">
              代码里用的是 <strong>minCount（最小出现次数）</strong>而不是直接比小数 ——
              因为「次数」是整数，避免浮点误差。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ③ 核心洞察 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-stone-800">③ 核心洞察：一条性质撑起整个算法</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/60 p-3">
            <p className="text-sm font-medium text-indigo-900">
              频繁项集的反单调性（频繁性向下封闭）
            </p>
            <p className="mt-1.5 font-mono text-xs text-indigo-800">
              若 A 是频繁项集，则 A 的任何子集也是频繁项集
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-indigo-900/80">
              换个说法（学生更容易记）：<strong>如果 ｛牛奶, 面包｝ 不频繁，
              那么 ｛牛奶, 面包, 饼干｝、｛牛奶, 面包, 可乐｝… 全都不频繁，可以整片跳过。</strong>
            </p>
          </div>

          <p className="text-sm leading-relaxed text-stone-700">
            Apriori 的执行流程（去「逐步演示」页一帧帧看）：
          </p>
          <ol className="ml-5 list-decimal space-y-1.5 text-sm text-stone-600">
            <li>
              <strong>连接（生成候选）</strong>：把上一层的频繁项集两两拼接，前 k−1 项相同的连起来
            </li>
            <li>
              <strong>剪枝</strong>：把候选里「不是上一层频繁项集的子集」的删掉（这一步不碰数据库，纯逻辑）
            </li>
            <li>
              <strong>计数（扫数据库）</strong>：数每个候选出现多少次，保留够 {minCount} 笔的
            </li>
            <li>重复直到某层没有频繁项集为止</li>
          </ol>
        </CardContent>
      </Card>

      {/* ④ 常见误区 */}
      <Card className="border-rose-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            ④ 三个最容易踩的坑
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm">
          {[
            [
              '支持度高 ≠ 有推荐价值',
              '「尿布→啤酒」支持度可能很高，但这两样东西没有因果关系。真正要看的是提升度 lift：lift = conf / sup(B)。lift≈1 说明只是碰巧同时热。',
            ],
            [
              '置信度的方向不能反',
              'conf(A→B) 和 conf(B→A) 通常差很多。「买牛奶的人 80% 也买面包」不代表「买面包的人 80% 也买牛奶」——因为买面包的人可能更多。',
            ],
            [
              '频繁 ≠ 显著',
              '数据量大时，很小的关联也会显得频繁。阈值该定多少要结合业务，不能只看数字好看。',
            ],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg bg-rose-50/60 p-2.5">
              <p className="text-xs font-medium text-rose-800">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// FP-Growth 原理
// ============================================================
function FpGrowthPrinciple({ minCount, nTrans }: { minCount: number; nTrans: number }) {
  return (
    <div className="space-y-4">
      {/* ① 生活类比 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-stone-800">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            ① 生活类比：把一箱小票压缩成一棵文件夹树
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-stone-700">
          <p>同样一箱小票，换个整理方式：</p>
          <ul className="ml-4 list-disc space-y-1 text-stone-600">
            <li>
              <b>Apriori</b>：每次要查「牛奶+面包一起买」有几笔，就把整箱小票<b>重新翻一遍</b>。
              查 5 种组合就翻 5 遍。
            </li>
            <li>
              <b>FP-Growth</b>：<b>只翻一遍</b>，就把小票按「最常买的商品」分门别类整理成一棵文件夹树，
              然后只在树上翻找，再也不用碰原始小票。
            </li>
          </ul>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>关键洞察：</strong>如果两张小票开头都写了「牛奶、面包」，它们在树上就会走到
            同一个文件夹——这时只需记「这里有 2 张」，不必分开存。
            这就是<strong>压缩</strong>，也是 FP-Growth 快的原因。
          </p>
        </CardContent>
      </Card>

      {/* ② 形式化定义 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-stone-800">② FP-tree 的两个必要结构</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-lg border border-stone-200 p-3">
            <p className="text-xs font-medium text-stone-700">节点 = 商品，连线 = 前缀延伸</p>
            <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
              从根往下走出一条路径，代表一笔交易的商品按频次降序排列后的前缀。
              节点里的数字是<b>经过这条路径的交易笔数</b>。
            </p>
          </div>
          <div className="rounded-lg border border-stone-200 p-3">
            <p className="text-xs font-medium text-stone-700">表头表 = 商品的索引目录</p>
            <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
              一张表记录「商品 X 在树上出现了哪几个节点」。
              挖 X 时顺着这张表直接跳到所有 X 节点，不用逐层搜索。
            </p>
          </div>
          <div className="rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium text-stone-700">建树时的剪枝</p>
            <p className="mt-1 font-mono text-xs text-stone-800">
              出现次数 &lt; {minCount} 的商品，在建树第一步就整个丢掉
            </p>
            <p className="mt-1 text-xs text-stone-500">
              当前 {nTrans} 笔交易 → 出现不足 {minCount} 次的商品直接不入树。
              这是<strong>全局剪枝</strong>，一步到位，Apriori 做不到。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ③ 核心洞察 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-stone-800">③ 核心洞察：条件模式基</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-stone-700">
          <p>
            要挖「以 X 结尾的项集」时，只需问一个问题：
            <strong>「买过 X 的那些交易，去掉 X 之后还剩什么？」</strong>
          </p>
          <p>这就是「条件模式基」——一张被压缩过的小表：</p>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs">
            <p className="text-stone-500">// 原始交易（假设挖「饼干」）</p>
            <p className="mt-1 text-stone-700">
              {'{牛奶, 饼干}'} → 条件模式基：{'{牛奶}: 1'}
            </p>
            <p className="text-stone-700">
              {'{剃须刀, 牛奶, 饼干}'} → {'{剃须刀, 牛奶}: 1'}
            </p>
            <p className="text-stone-700">
              {'{牛奶, 饼干}'} → {'{牛奶}: 1'} ← 与第一行合并
            </p>
            <p className="mt-1 text-emerald-700">结果：{'{牛奶}: 2, {剃须刀, 牛奶}: 1'}</p>
          </div>
          <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/60 p-3">
            <p className="text-sm font-medium text-indigo-900">为什么这样就够了？</p>
            <p className="mt-1.5 text-xs leading-relaxed text-indigo-900/80">
              条件模式基里已经<strong>隐含了 X 的支持度</strong>（合并时加了计数），
              所以在这张小表上继续挖掘，不需要回头查原始数据库。
              <strong>这就是「只扫一遍」的真正含义。</strong>
            </p>
          </div>
          <p className="text-xs text-stone-500">
            自底向上：从最不频繁的商品开始挖，因为它最可能触发剪枝，
            早点失败能省掉大量无效搜索。
          </p>
        </CardContent>
      </Card>

      {/* ④ 常见误区 */}
      <Card className="border-rose-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            ④ FP-Growth 特有的坑
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm">
          {[
            [
              '节点计数不能随便加',
              '在条件树里，商品 X 的支持度是「根节点直接孩子中 X 的计数」，不是「树上所有 X 节点的计数之和」。后者会把同一笔交易重复计入。',
            ],
            [
              '交易必须先去重并排序',
              '同一笔交易里同一商品出现两次，FP-tree 会建出非法路径 {A, A}。插入前必须去重，且按频次降序排列。',
            ],
            [
              '「只扫一遍」是相对而言',
              '建树扫一遍，挖掘阶段在树上递归。若数据量极大，FP-tree 本身可能装不下内存，这时要改造算法而非盲目用 FP-Growth。',
            ],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg bg-rose-50/60 p-2.5">
              <p className="text-xs font-medium text-rose-800">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}