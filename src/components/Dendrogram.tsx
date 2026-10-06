// 树状图 SVG（随合并步骤生长 + 切割线）—— 层次聚类推演页 与 多方法工作台 共用
import { useMemo } from 'react'
import { CLUSTER_COLORS } from '@/lib/kmeans'
import { dendrogramLayout, type HcResult } from '@/lib/hierarchical'

interface Props {
  result: HcResult
  step: number
  cutHeight: number
  cutLabels: number[] | null
  /** 画布宽度（默认 330，适配右栏窄卡；推演页可传更大的值） */
  width?: number
  height?: number
}

export default function Dendrogram({ result, step, cutHeight, cutLabels, width = 330, height = 230 }: Props) {
  const layout = useMemo(() => dendrogramLayout(result), [result])
  const n = result.n
  const DW = width
  const DH = height
  const PAD = { l: 34, r: 8, t: 10, b: 16 }
  const iw = DW - PAD.l - PAD.r
  const ih = DH - PAD.t - PAD.b
  const xPx = (x: number) => PAD.l + (n <= 1 ? iw / 2 : (x / (n - 1)) * iw)
  const yPx = (y: number) => PAD.t + ih - (result.maxDist <= 0 ? 0 : (y / result.maxDist) * ih)

  return (
    <svg width="100%" viewBox={`0 0 ${DW} ${DH}`} className="rounded-lg border border-stone-200 bg-white" data-testid="dendrogram">
      {/* 纵轴刻度 */}
      {[0, 0.5, 1].map((f) => {
        const v = result.maxDist * f
        return (
          <g key={f}>
            <line x1={PAD.l} x2={DW - PAD.r} y1={yPx(v)} y2={yPx(v)} stroke="#e7e5e4" strokeWidth={1} />
            <text x={PAD.l - 4} y={yPx(v) + 3.5} textAnchor="end" fontSize={9} fill="#78716c">
              {v.toFixed(0)}
            </text>
          </g>
        )
      })}
      {/* 已完成的合并 */}
      {result.merges.slice(0, step).map((m, i) => {
        const xa = xPx(layout.xs[m.a])
        const xb = xPx(layout.xs[m.b])
        const ya = yPx(layout.ys[m.a])
        const yb = yPx(layout.ys[m.b])
        const y = yPx(m.distance)
        return (
          <g key={i} stroke="#4f46e5" strokeWidth={1.4} opacity={0.85} data-testid="dendro-merge">
            <line x1={xa} y1={ya} x2={xa} y2={y} />
            <line x1={xb} y1={yb} x2={xb} y2={y} />
            <line x1={xa} y1={y} x2={xb} y2={y} />
          </g>
        )
      })}
      {/* 叶子小圆点（完成后按切割结果上色） */}
      {Array.from({ length: n }, (_, i) => (
        <circle
          key={`leaf-${i}`}
          cx={xPx(layout.xs[i])}
          cy={yPx(0) + 6}
          r={Math.max(1, Math.min(2.5, iw / n / 2.2))}
          fill={cutLabels ? CLUSTER_COLORS[cutLabels[i] % CLUSTER_COLORS.length] : '#a8a29e'}
        />
      ))}
      {/* 切割线 */}
      {step >= result.merges.length && result.merges.length > 0 && (
        <>
          <line x1={PAD.l} x2={DW - PAD.r} y1={yPx(cutHeight)} y2={yPx(cutHeight)} stroke="#f97316" strokeWidth={1.6} strokeDasharray="6 3" data-testid="dendro-cutline" />
          <text x={DW - PAD.r} y={yPx(cutHeight) - 4} textAnchor="end" fontSize={10} fontWeight={600} fill="#f97316">
            切一刀
          </text>
        </>
      )}
    </svg>
  )
}
