// ============================================================
// 动画演示面板 —— 按需展开的 Manim 视频播放器
// ============================================================
//
// 设计目标：**不喧宾夺主**。
//
// 平台的其余部分都是可交互的实验（拖滑块看实时变化），
// Manim 视频是「原理讲解」——两者是互补关系，不是替代关系。
// 所以：
//   · 默认折叠，只显示一行「动画演示」入口
//   · 展开后播放器才开始加载（用 preload="none"，不占首屏流量）
//   · 不自动播放，学生点了才播
//   · 看完给一个「去动手验证」的出口，接回交互实验
//
// 视频由 manim/build_all.py 离线渲染，产物在 public/media/ 下，
// Vite 会原样拷进 dist/，因此这里是普通 <video> 标签。
// ============================================================

import { useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Film, Play, ChevronDown, ChevronUp, Sparkles, ArrowRight } from 'lucide-react'

export interface DemoClip {
  /** 与 public/media/<id>.mp4 对应 */
  id: string
  /** 一句话说明这个动画讲什么 */
  desc: string
  /** 时长（秒），仅用于展示 */
  duration?: number
}

interface Props {
  title?: string
  clips: DemoClip[]
  /** 看完动画后可以去哪验证 */
  goFurther?: { label: string; onClick: () => void }
  /** 紧凑模式：用于页面内嵌而非独立区块 */
  compact?: boolean
}

export default function ManimDemo({ title = '动画演示', clips, goFurther, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const active = clips.find((c) => c.id === activeId) ?? null

  const handleOpen = () => {
    setOpen(!open)
    // 展开时自动选中第一个，但不自动播放
    if (!open && !activeId && clips.length > 0) {
      setActiveId(clips[0].id)
    }
  }

  const select = (id: string) => {
    setActiveId(id)
    // 切换后从头播
    requestAnimationFrame(() => {
      const v = videoRef.current
      if (v) {
        v.currentTime = 0
        void v.play().catch(() => {
          /* 浏览器可能阻止自动播放，忽略即可 */
        })
      }
    })
  }

  return (
    <Card
      className={`border-stone-200 ${compact ? 'shadow-none' : 'shadow-sm'} ${open ? '' : 'bg-stone-50/60'}`}
    >
      {/* ---- 折叠态：只一行入口 ---- */}
      {!open && (
        <button
          onClick={handleOpen}
          data-testid="manim-demo-toggle"
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Film className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-stone-700">{title}</span>
            <span className="block truncate text-xs text-stone-400">
              {clips.length} 段动画 · {clips[0]?.desc}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />
        </button>
      )}

      {/* ---- 展开态 ---- */}
      {open && (
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-indigo-500" />
              <p className="truncate text-sm font-medium text-stone-700">{title}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpen}
              className="shrink-0 text-stone-400"
              aria-label="收起动画演示"
            >
              <ChevronUp className="mr-1 h-3.5 w-3.5" />
              收起
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            {/* ---- 播放器 ---- */}
            <div className="overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
              {active ? (
                <>
                  <video
                    ref={videoRef}
                    key={active.id}
                    src={`./media/${active.id}.mp4`}
                    controls
                    preload="metadata"
                    playsInline
                    className="aspect-video w-full bg-white object-contain"
                  />
                  <p className="border-t border-stone-200 px-3 py-2 text-xs leading-relaxed text-stone-500">
                    {active.desc}
                  </p>
                </>
              ) : (
                <div className="flex aspect-video items-center justify-center px-4 text-center">
                  <p className="text-sm text-stone-400">从右侧选一段动画</p>
                </div>
              )}
            </div>

            {/* ---- 片段列表 ---- */}
            <div className="space-y-1.5">
              {clips.map((c) => {
                const on = activeId === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => select(c.id)}
                    data-testid={`manim-clip-${c.id}`}
                    className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      on
                        ? 'border-indigo-300 bg-indigo-50/70'
                        : 'border-stone-200 bg-white hover:border-stone-300'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        on ? 'bg-indigo-600 text-white' : 'bg-stone-200 text-stone-500'
                      }`}
                    >
                      {on ? <Play className="h-2 w-2 fill-current" /> : ''}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-stone-700">{c.desc}</span>
                      {c.duration && (
                        <span className="mt-0.5 block text-[10px] text-stone-400">{c.duration}s</span>
                      )}
                    </span>
                  </button>
                )
              })}

              {goFurther && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goFurther.onClick}
                  className="w-full justify-between border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  {goFurther.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-stone-400">
            动画是用 Manim 离线渲染的，作用是把「原理」讲清楚；
            真正理解还要动手调参数 —— 看完动画后建议回到上面的交互实验试一遍。
          </p>
        </CardContent>
      )}
    </Card>
  )
}
