// 轻量 SVG 折线图：画函数曲线 / SSE 曲线，支持多条序列和高亮标记点
interface Series {
  ys: number[] // 与 xs 等长的纵坐标
  color: string
  label?: string
  dashed?: boolean
}

interface Marker {
  x: number
  color: string
  label?: string
}

interface Props {
  xs: number[] // 公共横坐标
  series: Series[]
  markers?: Marker[]
  width?: number
  height?: number
  xLabel?: string
  yLabel?: string
  xFormat?: (v: number) => string
  yMax?: number // 不填则自动取数据最大值
  connectNulls?: boolean
}

const PAD = { l: 44, r: 12, t: 22, b: 28 }

export default function CurveChart({
  xs,
  series,
  markers = [],
  width = 520,
  height = 220,
  xLabel,
  yLabel,
  xFormat = (v) => v.toFixed(1),
  yMax,
}: Props) {
  const xmin = Math.min(...xs)
  const xmax = Math.max(...xs)
  const ymax = yMax ?? Math.max(0.001, ...series.flatMap((s) => s.ys))
  const iw = width - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const sx = (x: number) => PAD.l + ((x - xmin) / (xmax - xmin || 1)) * iw
  const sy = (y: number) => PAD.t + ih - (y / ymax) * ih

  const pathOf = (ys: number[]) =>
    ys.map((y, i) => `${i === 0 ? 'M' : 'L'}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')

  // 5 条横向网格线
  const gridYs = Array.from({ length: 5 }, (_, i) => (ymax * i) / 4)

  return (
    <svg width={width} height={height} className="max-w-full" role="img">
      {/* 网格与坐标轴 */}
      {gridYs.map((gy, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={width - PAD.r} y1={sy(gy)} y2={sy(gy)} stroke="#e7e5e4" strokeWidth={1} />
          <text x={PAD.l - 6} y={sy(gy) + 3.5} textAnchor="end" fontSize={10} fill="#78716c">
            {gy >= 10 ? gy.toFixed(0) : gy.toFixed(2)}
          </text>
        </g>
      ))}
      <line x1={PAD.l} x2={width - PAD.r} y1={sy(0)} y2={sy(0)} stroke="#a8a29e" strokeWidth={1.2} />
      {/* x 轴刻度 */}
      {[xmin, (xmin + xmax) / 2, xmax].map((xv, i) => (
        <text key={i} x={sx(xv)} y={height - PAD.b + 14} textAnchor="middle" fontSize={10} fill="#78716c">
          {xFormat(xv)}
        </text>
      ))}
      {xLabel && (
        <text x={PAD.l + iw / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="#57534e">
          {xLabel}
        </text>
      )}
      {yLabel && (
        // 轴标题放在绘图区左上角的上方，避免和 y 轴刻度数字重叠
        <text x={PAD.l} y={8} fontSize={11} fill="#57534e">
          {yLabel}
        </text>
      )}
      {/* 曲线 */}
      {series.map((s, i) => (
        <path
          key={i}
          d={pathOf(s.ys)}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          strokeDasharray={s.dashed ? '5 4' : undefined}
          strokeLinejoin="round"
        />
      ))}
      {/* 图例 */}
      {series.some((s) => s.label) && (
        <g>
          {series
            .filter((s) => s.label)
            .map((s, i) => (
              <g key={i} transform={`translate(${width - PAD.r - 120}, ${PAD.t + 4 + i * 16})`}>
                <line x1={0} x2={16} y1={0} y2={0} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} />
                <text x={20} y={3.5} fontSize={10.5} fill="#44403c">
                  {s.label}
                </text>
              </g>
            ))}
        </g>
      )}
      {/* 高亮标记 */}
      {markers.map((m, i) => {
        // 找离 m.x 最近的采样点来确定 y
        let bi = 0
        let bd = Infinity
        xs.forEach((x, j) => {
          const d = Math.abs(x - m.x)
          if (d < bd) {
            bd = d
            bi = j
          }
        })
        const y = series[0]?.ys[bi] ?? 0
        return (
          <g key={i}>
            <line x1={sx(m.x)} x2={sx(m.x)} y1={sy(y)} y2={sy(0)} stroke={m.color} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
            <circle cx={sx(m.x)} cy={sy(y)} r={5} fill={m.color} stroke="#fff" strokeWidth={1.5} />
            {m.label && (
              // 钳制在画布内，避免曲线顶点的标注（如 H=1.000）被顶部裁切
              <text x={sx(m.x)} y={Math.max(12, sy(y) - 9)} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={m.color}>
                {m.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
