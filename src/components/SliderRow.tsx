// 通用滑块行：标签 + 滑块 + 当前值
import { Slider } from '@/components/ui/slider'

interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}

export default function SliderRow({ label, value, min, max, step = 1, onChange, format }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-stone-700">{label}</span>
        <span className="font-mono text-indigo-700 font-medium">{format ? format(value) : value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  )
}
