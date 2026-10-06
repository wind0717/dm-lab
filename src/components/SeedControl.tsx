// 随机种子控制条 —— 让实验数据可复现、可对照
//
// 教学价值：
//   ① 学生之间看到同一份数据，可以直接讨论"为什么你的准确率是 88% 我的是 81%"
//   ② 同一 seed 下反复调参，指标变化只来自参数，不来自随机波动
//   ③ 老师演示用的 seed 写在黑板上，学生课后输同一个数就能原样复现
import { Dices, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEFAULT_DATA_SEED } from '@/lib/datasets'

interface Props {
  seed: number
  onChange: (seed: number) => void
  /** 点击"换一批"时的回调（通常会自增 seed 或取随机数） */
  onReroll?: () => void
  /** 换一批按钮文案，默认「换一批数据」 */
  rerollLabel?: string
  className?: string
}

export default function SeedControl({ seed, onChange, onReroll, rerollLabel = '换一批数据', className = '' }: Props) {
  return (
    <div className={`rounded-lg border border-stone-200 bg-white px-3 py-2.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="seed-input" className="shrink-0 text-sm font-medium text-stone-700">
          随机种子
        </label>
        <Input
          id="seed-input"
          type="number"
          value={seed}
          onChange={(e) => {
            const v = Number(e.target.value)
            // 只接受有限整数，避免 NaN 污染数据集生成
            if (Number.isFinite(v)) onChange(Math.round(v))
          }}
          className="h-8 w-20 font-mono text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange(DEFAULT_DATA_SEED)}
          title={`恢复默认种子 ${DEFAULT_DATA_SEED}（与 classmates 看到的数据一致）`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          默认
        </Button>
        {onReroll && (
          <Button size="sm" variant="outline" onClick={onReroll}>
            <Dices className="h-3.5 w-3.5" />
            {rerollLabel}
          </Button>
        )}
        <span className="text-xs text-stone-500">
          相同种子生成完全相同的数据 · 换种子可看另一批样本
        </span>
      </div>
    </div>
  )
}