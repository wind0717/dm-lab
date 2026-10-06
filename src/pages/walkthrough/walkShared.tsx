// 三个推演页共用的 2D 数据集选择面板：预设按钮 + 样本数/噪声滑块 + 生成
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import { genDTPreset, DT_PRESET_NAMES, type DTPreset, type Pt } from '@/lib/datasets'

interface Props {
  preset: DTPreset
  perClass: number
  noise: number
  onPreset: (p: DTPreset) => void
  onPerClass: (n: number) => void
  onNoise: (n: number) => void
  onRegen: () => void
  hint?: string
}

export function WalkDataPanel({ preset, perClass, noise, onPreset, onPerClass, onNoise, onRegen, hint }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(DT_PRESET_NAMES) as DTPreset[]).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={preset === p ? 'default' : 'outline'}
            className={preset === p ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
            onClick={() => onPreset(p)}
          >
            {DT_PRESET_NAMES[p]}
          </Button>
        ))}
      </div>
      <SliderRow label="每类样本数" value={perClass} min={20} max={120} step={10} onChange={onPerClass} />
      <SliderRow label="噪声强度" value={noise} min={0} max={30} step={1} onChange={onNoise} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onRegen}>
          按当前设置生成
        </Button>
        {hint && <span className="text-xs text-stone-400">{hint}</span>}
      </div>
    </div>
  )
}

export function genPts(preset: DTPreset, perClass: number, noise: number): Pt[] {
  return genDTPreset(preset, perClass, noise)
}
