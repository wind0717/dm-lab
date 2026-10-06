// "想一想" 引导问题卡片
import { Lightbulb } from 'lucide-react'

export default function ThinkBox({ questions }: { questions: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
        <Lightbulb className="h-4 w-4" />
        想一想
      </div>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-amber-900/90">
        {questions.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ul>
    </div>
  )
}
