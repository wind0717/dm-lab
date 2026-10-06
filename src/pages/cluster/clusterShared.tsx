// 聚类推演页（DBSCAN / 层次聚类）共用的数据面板：预设数据集按钮 + 每组点数 / 噪声滑块 + 随机种子
import { Button } from '@/components/ui/button'
import SliderRow from '@/components/SliderRow'
import SeedControl from '@/components/SeedControl'
import { genKMPreset, KM_PRESET_NAMES, type KMPreset, type RawPt } from '@/lib/datasets'

interface Props {
  preset: KMPreset
  perGroup: number
  noise: number
  seed: number
  onPreset: (p: KMPreset) => void
  onPerGroup: (n: number) => void
  onNoise: (n: number) => void
  onSeed: (n: number) => void
  onRegen: () => void
  hint?: string
}

export function ClusterWalkDataPanel({
  preset,
  perGroup,
  noise,
  seed,
  onPreset,
  onPerGroup,
  onNoise,
  onSeed,
  onRegen,
  hint,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(KM_PRESET_NAMES) as KMPreset[]).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={preset === p ? 'default' : 'outline'}
            className={preset === p ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
            onClick={() => onPreset(p)}
            data-testid={`cluster-preset-${p}`}
          >
            {KM_PRESET_NAMES[p]}
          </Button>
        ))}
      </div>
      <SliderRow label="每组点数" value={perGroup} min={15} max={60} step={5} onChange={onPerGroup} />
      <SliderRow label="噪声强度" value={noise} min={0} max={20} step={1} onChange={onNoise} />
      <SeedControl seed={seed} onChange={onSeed} onReroll={() => onSeed(seed + 1)} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onRegen} data-testid="cluster-regen">
          按当前设置生成
        </Button>
        {hint && <span className="text-xs text-stone-400">{hint}</span>}
      </div>
    </div>
  )
}

export function genClusterPts(preset: KMPreset, perGroup: number, noise: number, seed?: number): RawPt[] {
  return seed === undefined
    ? genKMPreset(preset, perGroup, noise)
    : genKMPreset(preset, perGroup, noise, seed)
}
