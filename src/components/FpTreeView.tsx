// ============================================================
// FP-tree 可视化 —— 把压缩后的树画出来
// ============================================================
// 教学目标：让学生**看见** FP-Growth 的核心洞察——
//「相同前缀的交易在树上共享路径，计数被合并了」。
//
// 画法：从根逐层展开，每个节点一个圆圈 + 商品名+ 计数，
// 边上标出这批交易共有多少笔。整棵树的高度就是最长交易的长度。
// ============================================================

import { useMemo } from 'react'
import { flattenFpTree, type FpTree } from '@/lib/fpgrowth'

interface FpTreeViewProps {
  tree: FpTree
  /** 高亮的商品（对应表头表指针） */
  highlight?: string | null
  maxNodes?: number
}

/** 单层节点的横向排布 + 纵坐标 */
interface Laid {
  id: string
  item: string
  count: number
  x: number
  y: number
  parentId: string | null
  parentX: number | null
}

const R = 21 // 节点半径
const GAP_X = 78 // 同层节点水平间距
const GAP_Y = 74 // 层间距

export default function FpTreeView({ tree, highlight = null, maxNodes = 80 }: FpTreeViewProps) {
  const laid = useMemo(() => {
    const flat = flattenFpTree(tree, maxNodes)
    if (flat.length === 0) return { nodes: [] as Laid[], width: 0, height: 0 }

    // 按深度分组，每组按插入顺序排列（保持父在子之前的视觉直觉）
    const byDepth = new Map<number, typeof flat>()
    for (const n of flat) {
      if (!byDepth.has(n.depth)) byDepth.set(n.depth, [])
      byDepth.get(n.depth)!.push(n)
    }
    const depths = [...byDepth.keys()].sort((a, b) => a - b)
    const widest = Math.max(...depths.map((d) => byDepth.get(d)!.length))

    const width = Math.max(320, widest * GAP_X + 80)
    const height = Math.max(160, (depths[depths.length - 1] + 1) * GAP_Y + 40)

    const pos = new Map<string, { x: number; y: number }>()
    const nodes: Laid[] = []

    for (const d of depths) {
      const row = byDepth.get(d)!
      const span = row.length * GAP_X
      row.forEach((n, i) => {
        // 居中：让子节点大致落在父节点附近
        const x = width / 2 - span / 2 + i * GAP_X + GAP_X / 2
        const y = 50 + d * GAP_Y
        pos.set(n.id, { x, y })
        const p = n.parentId ? pos.get(n.parentId) : null
        nodes.push({
          id: n.id,
          item: n.item,
          count: n.count,
          x,
          y,
          parentId: n.parentId,
          parentX: p ? p.x : null,
        })
      })
    }

    // 二次修正：把子节点向父节点靠拢，避免交叉线过多
    for (const n of nodes) {
      if (n.parentX !== null) {
        const drift = (n.parentX - n.x) * 0.25
        n.x += drift
      }
    }

    return { nodes, width, height }
  }, [tree, maxNodes])

  if (laid.nodes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center">
        <p className="text-sm text-stone-500">当前支持度下没有频繁商品，FP-tree 是空的</p>
        <p className="mt-1 text-xs text-stone-400">试试把支持度阈值调低一些</p>
      </div>
    )
  }

  const s = tree.stats
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
        <span className="rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
          {s.nTrans} 笔交易
        </span>
        <span className="rounded bg-stone-100 px-2 py-0.5">
          原始商品 {s.nodeCount > 0 ? `→ ` : ''}节点 {s.nodeCount} 个
        </span>
        <span className="rounded bg-stone-100 px-2 py-0.5">树深 {s.maxDepth}</span>
        <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
          压缩比 {(s.compressionRatio * 100).toFixed(0)}%
        </span>
        {s.prunedItems > 0 && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
            剪掉 {s.prunedItems} 个低频商品
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <svg
          width={laid.width}
          height={laid.height}
          className="min-w-full"
          role="img"
          aria-label={`FP-tree，含${laid.nodes.length} 个节点，最大深度 ${s.maxDepth}`}
        >
          <defs>
            <marker id="fp-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#cbd5e1" />
            </marker>
          </defs>

          {/* 连线 */}
          {laid.nodes.map((n) =>
            n.parentX === null ? null : (
              <g key={`e-${n.id}`}>
                <line
                  x1={n.parentX}
                  y1={n.y - R}
                  x2={n.x}
                  y2={n.y + R}
                  stroke="#cbd5e1"
                  strokeWidth={1.4}
                  markerEnd="url(#fp-arrow)"
                />
                {/* 边中点标注计数 */}
                <rect
                  x={(n.parentX + n.x) / 2 - 11}
                  y={(n.y - R + n.y + R) / 2 - 8}
                  width={22}
                  height={15}
                  rx={3}
                  fill="#ffffff"
                />
                <text
                  x={(n.parentX + n.x) / 2}
                  y={(n.y - R + n.y + R) / 2 + 3}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#94a3b8"
                  fontFamily="ui-monospace, monospace"
                >
                  {n.count}
                </text>
              </g>
            ),
          )}

          {/* 节点 */}
          {laid.nodes.map((n) => {
            const on = highlight === n.item
            return (
              <g key={n.id}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={R}
                  fill={on ? '#4f46e5' : '#ffffff'}
                  stroke={on ? '#4338ca' : '#94a3b8'}
                  strokeWidth={on ? 2.5 : 1.4}
                />
                <text
                  x={n.x}
                  y={n.y + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={on ? 600 : 400}
                  fill={on ? '#ffffff' : '#334155'}
                >
                  {n.item.length > 3 ? n.item.slice(0, 3) + '…' : n.item}
                </text>
              </g>
            )
          })}

          {/* 根 */}
          <g>
            <rect
              x={laid.width / 2 - 20}
              y={50 - R - 34}
              width={40}
              height={22}
              rx={5}
              fill="#f1f5f9"
              stroke="#cbd5e1"
            />
            <text
              x={laid.width / 2}
              y={50 - R - 19}
              textAnchor="middle"
              fontSize="11"
              fill="#64748b"
            >
              根
            </text>
            <line
              x1={laid.width / 2}
              y1={50 - R - 12}
              x2={laid.width / 2}
              y2={50 - R - 1}
              stroke="#cbd5e1"
              strokeWidth={1.4}
            />
          </g>
        </svg>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-stone-500">
        节点里的数字是<strong className="text-stone-700">经过这条路径的交易笔数</strong>。
        多笔交易若前缀相同会合并成一个节点、计数累加 —— 这就是 FP-tree 的压缩之处，
        也是它之后不必再扫数据库的原因。
      </p>
    </div>
  )
}