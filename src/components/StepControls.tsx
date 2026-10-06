// 通用逐步推演控制条：上一步 / 下一步 / 自动播放 / 重置 + 步数进度
// 从「决策树逐步推演」页抽取的交互范式，三个新推演页共用
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw } from 'lucide-react'

interface Props {
  step: number // 当前步（0 起）
  totalSteps: number // 总步数
  playing: boolean
  onStep: (s: number) => void
  onPlaying: (p: boolean) => void
  intervalMs?: number // 自动播放间隔
  title?: string
  /** 进度右侧的附加说明（如"已收敛"） */
  extra?: React.ReactNode
  children?: React.ReactNode // 控制条下方的当前步骤详情
}

export default function StepControls({
  step,
  totalSteps,
  playing,
  onStep,
  onPlaying,
  intervalMs = 700,
  title = '逐步推演',
  extra,
  children,
}: Props) {
  const curStep = Math.min(step, totalSteps)

  // 自动播放
  useEffect(() => {
    if (!playing) return
    if (curStep >= totalSteps) {
      onPlaying(false)
      return
    }
    const timer = setTimeout(() => onStep(curStep + 1), intervalMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, curStep, totalSteps, intervalMs])

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base text-stone-800">
          <span>{title}</span>
          <span className="flex items-center gap-2 font-mono text-sm font-normal text-stone-500">
            {extra}
            <span data-testid="step-progress">
              {curStep} / {totalSteps} 步
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={curStep === 0}
            onClick={() => {
              onPlaying(false)
              onStep(curStep - 1)
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            上一步
          </Button>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={curStep >= totalSteps}
            onClick={() => onStep(curStep + 1)}
            data-testid="step-next"
          >
            下一步
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="step-play"
            onClick={() => {
              if (curStep >= totalSteps) onStep(0)
              onPlaying(!playing)
            }}
          >
            {playing ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
            {playing ? '暂停' : '自动播放'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="step-reset"
            onClick={() => {
              onPlaying(false)
              onStep(0)
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
