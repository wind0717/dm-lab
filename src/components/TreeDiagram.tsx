// 决策树结构图（SVG 分层布局）
// 节点内画类别分布小条形；当前步骤刚展开的节点高亮；叶节点用类别颜色描边
import type { ReactElement } from 'react'
import type { TreeNode } from '@/lib/cart'
import { CLASS_COLORS } from '@/lib/cart'

interface Props {
  root: TreeNode | null
  step: number // 当前已展开的步数
}

const NODE_W = 88
const NODE_H = 44
const LEVEL_H = 86
const LEAF_W = 52

interface Layout {
  node: TreeNode
  x: number
  y: number
  children: Layout[]
}

/** 判断节点在当前 step 下是否已展开 */
function isExpanded(n: TreeNode, step: number): boolean {
  return !n.isLeaf && n.expandOrder >= 0 && n.expandOrder < step
}

function layoutTree(root: TreeNode, step: number): { layout: Layout; width: number } {
  let cursor = 0
  function build(n: TreeNode): Layout {
    const y = n.depth * LEVEL_H + 20
    const expanded = isExpanded(n, step)
    if (!expanded || !n.left || !n.right) {
      const x = cursor
      cursor += LEAF_W + 24
      return { node: n, x, y, children: [] }
    }
    const lc = build(n.left)
    const rc = build(n.right)
    return { node: n, x: (lc.x + rc.x) / 2, y, children: [lc, rc] }
  }
  const layout = build(root)
  return { layout, width: cursor }
}

export default function TreeDiagram({ root, step }: Props) {
  if (!root) return null
  const { layout, width } = layoutTree(root, step)
  const height = (rootDepth(layout) + 1) * LEVEL_H + 30

  function rootDepth(l: Layout): number {
    if (l.children.length === 0) return l.node.depth
    return Math.max(...l.children.map(rootDepth))
  }

  const boxes: ReactElement[] = []
  const edges: ReactElement[] = []

  function render(l: Layout) {
    const n = l.node
    const expanded = isExpanded(n, step)
    const justExpanded = n.expandOrder === step - 1
    const total = n.counts[0] + n.counts[1] || 1
    const ratioA = n.counts[0] / total

    for (const c of l.children) {
      // 边上标注分裂条件
      const isLeft = c.node === n.left
      edges.push(
        <g key={`e-${n.id}-${c.node.id}`}>
          <line x1={l.x} y1={l.y + NODE_H} x2={c.x} y2={c.y} stroke="#a8a29e" strokeWidth={1.4} />
          {n.split && (
            <text
              x={(l.x + c.x) / 2}
              y={(l.y + NODE_H + c.y) / 2 - 3}
              textAnchor="middle"
              fontSize={10}
              fill="#57534e"
              className="select-none"
            >
              {isLeft ? `x${n.split.feature + 1} ≤ ${n.split.threshold.toFixed(1)}` : `x${n.split.feature + 1} > ${n.split.threshold.toFixed(1)}`}
            </text>
          )}
        </g>,
      )
      render(c)
    }

    const w = expanded ? NODE_W : LEAF_W + 16
    const leafColor = CLASS_COLORS[n.prediction]
    boxes.push(
      <g key={`n-${n.id}`} className="transition-all duration-300">
        <rect
          x={l.x - w / 2}
          y={l.y}
          width={w}
          height={NODE_H}
          rx={8}
          fill={justExpanded ? '#eef2ff' : '#fff'}
          stroke={justExpanded ? '#4f46e5' : expanded ? '#a5b4fc' : leafColor}
          strokeWidth={justExpanded ? 2.4 : 1.8}
        />
        {/* 类别分布小条形 */}
        <rect x={l.x - w / 2 + 8} y={l.y + 8} width={(w - 16) * ratioA} height={7} fill={CLASS_COLORS[0]} rx={2} />
        <rect
          x={l.x - w / 2 + 8 + (w - 16) * ratioA}
          y={l.y + 8}
          width={(w - 16) * (1 - ratioA)}
          height={7}
          fill={CLASS_COLORS[1]}
          rx={2}
        />
        <text x={l.x} y={l.y + 27} textAnchor="middle" fontSize={10.5} fill="#44403c" className="select-none">
          {n.counts[0]} : {n.counts[1]}
        </text>
        <text x={l.x} y={l.y + 39} textAnchor="middle" fontSize={9.5} fill="#a8a29e" className="select-none">
          {expanded ? `增益 ${n.split?.gain.toFixed(3)}` : n.isLeaf ? `叶 · ${n.prediction === 0 ? 'A' : 'B'}` : '待展开'}
        </text>
      </g>,
    )
  }
  render(layout)

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <svg width={Math.max(width, 320)} height={height} className="mx-auto block">
        {edges}
        {boxes}
      </svg>
    </div>
  )
}
