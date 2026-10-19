// ============================================================
// 测验引擎 —— 各模块「随堂测」的通用组件
// ============================================================
//
// 设计目标：作为平时作业，学生做完能立刻知道对错与错在哪。
//
// 为什么自己写而不用现成库：
// 平台的定位是「零外部依赖的纯前端教学站」，而且判分逻辑需要
// 与实验页联动（比如答对时提示"去调整参数试试"），保持可控。
//
// 三种题型：
//   single   单选（只有一个正确答案）
//   multiple 多选（可能多个，必须全对才得分）
//   judge    判断（对/错）
//
// 计分：答对得 1 分；多选「少选但一个没错」给 0.5 分（鼓励但严格）。
// ============================================================

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, RotateCcw, Trophy, Lightbulb } from 'lucide-react'

export interface QuizOption {
  /** 选项文本 */
  text: string
  /** 是否为正确答案 */
  correct: boolean
  /** 选错时显示的解释（可选，比单纯判对错更有教学价值） */
  hint?: string
}

export interface QuizQuestion {
  id: string
  type: 'single' | 'multiple' | 'judge'
  question: string
  options: QuizOption[]
  /** 答错时展示的解析（必填 —— 测验的教学价值主要在这里） */
  explanation: string
  /** 答对后的延伸提示：去哪个实验验证什么（可选） */
  goFurther?: string
}

interface Props {
  /** 模块名，显示在标题上 */
  title: string
  /** 副标题，如「共 8 题 · 建议 10 分钟」 */
  subtitle?: string
  questions: QuizQuestion[]
  /** 完成后跳转到某个实验页 */
  onNavigate?: (page: string) => void
  /** 跳转到的页面 id */
  navigateTo?: string
}

/** qid -> 选中的选项下标数组（存数字下标，不是字符串） */
type AnswerState = Record<string, number[]>

export default function Quiz({ title, subtitle, questions, onNavigate, navigateTo }: Props) {
  const [answers, setAnswers] = useState<AnswerState>({})
  const [submitted, setSubmitted] = useState(false)

  const answeredCount = Object.keys(answers).filter((k) => (answers[k]?.length ?? 0) > 0).length
  const allAnswered = answeredCount === questions.length

  /** 判分 */
  const score = useMemo(() => {
    let got = 0
    for (const q of questions) {
      const sel = answers[q.id] ?? []
      if (sel.length === 0) continue
      const correctSet = new Set<number>(
        q.options.flatMap((o, i) => (o.correct ? [i] : [])),
      )
      const wrongPicked = sel.filter((i) => !correctSet.has(i))
      if (wrongPicked.length > 0) continue // 选错不得分
      if (sel.length === correctSet.size) got += 1
      else if (sel.length < correctSet.size) got += 0.5 // 少选但没错
    }
    return got
  }, [answers, questions])

  const toggle = (qid: string, idx: number, type: QuizQuestion['type']) => {
    if (submitted) return
    setAnswers((prev) => {
      const cur = prev[qid] ?? []
      if (type === 'multiple') {
        return {
          ...prev,
          [qid]: cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx],
        }
      }
      return { ...prev, [qid]: [idx] }
    })
  }

  const reset = () => {
    setAnswers({})
    setSubmitted(false)
  }

  const pct = questions.length > 0 ? (score / questions.length) * 100 : 0
  const level =
    pct >= 90 ? '优秀' : pct >= 70 ? '良好' : pct >= 60 ? '及格' : '需要再看看原理'

  return (
    <Card className="border-stone-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="text-stone-800">{title}</span>
            {subtitle && <span className="text-xs font-normal text-stone-400">{subtitle}</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            {submitted && (
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  pct >= 60 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {score} / {questions.length} 分 · {level}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={reset} className="text-stone-400">
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              重做
            </Button>
          </div>
        </div>
        {/* 进度条：未提交时显示答题进度 */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-100">
          <div
            className={`h-full transition-all ${submitted ? 'bg-indigo-500' : 'bg-stone-300'}`}
            style={{ width: `${submitted ? pct : (answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {questions.map((q, qi) => {
          const sel = answers[q.id] ?? []
          const answered = sel.length > 0
          const correctSet = new Set(q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0))
          const wrongPicked = sel.some((i) => !correctSet.has(i))
          const isRight = submitted && answered && !wrongPicked && sel.length === correctSet.size

          return (
            <div
              key={q.id}
              className={`rounded-lg border p-3 transition-colors ${
                submitted && answered
                  ? isRight
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-rose-200 bg-rose-50/30'
                  : 'border-stone-200'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-medium text-stone-600">
                  {qi + 1}
                </span>
                <p className="flex-1 text-sm leading-relaxed text-stone-800">
                  {q.question}
                  {q.type === 'multiple' && (
                    <span className="ml-1 text-xs text-stone-400">（多选）</span>
                  )}
                </p>
                {submitted && answered && (
                  <span className="shrink-0">
                    {isRight ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-500" />
                    )}
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-1 pl-7">
                {q.options.map((o, oi) => {
                  const picked = sel.includes(oi)
                  // 提交后：正确项标绿、选错的标红
                  let cls = 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                  if (submitted) {
                    if (o.correct) cls = 'border-emerald-300 bg-emerald-50/70'
                    else if (picked) cls = 'border-rose-300 bg-rose-50/60'
                  } else if (picked) {
                    cls = 'border-indigo-400 bg-indigo-50/70'
                  }
                  return (
                    <button
                      key={oi}
                      onClick={() => toggle(q.id, oi, q.type)}
                      disabled={submitted}
                      className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors disabled:cursor-default ${cls}`}
                    >
                      <span
                        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center border text-[9px] ${
                          q.type === 'multiple' ? 'rounded' : 'rounded-full'
                        } ${
                          picked
                            ? 'border-indigo-500 bg-indigo-500 text-white'
                            : 'border-stone-300 bg-white'
                        }`}
                      >
                        {picked ? '✓' : ''}
                      </span>
                      <span className="flex-1 text-stone-700">{o.text}</span>
                      {submitted && o.correct && (
                        <span className="shrink-0 text-xs text-emerald-600">正确答案</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 答错才显示解析 —— 这是测验的主要教学价值 */}
              {submitted && answered && !isRight && (
                <div className="mt-2 space-y-1.5 pl-7">
                  <div className="rounded-md bg-white p-2.5 text-xs leading-relaxed text-stone-600 ring-1 ring-stone-200">
                    <strong className="text-stone-800">解析：</strong>
                    {q.explanation}
                  </div>
                  {q.goFurther && (
                    <p className="flex items-start gap-1.5 rounded-md bg-indigo-50 px-2.5 py-2 text-xs text-indigo-800">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{q.goFurther}</span>
                    </p>
                  )}
                </div>
              )}

              {/* 答对也鼓励去看延伸 */}
              {submitted && isRight && q.goFurther && (
                <p className="mt-2 flex items-start gap-1.5 pl-7 text-xs text-stone-500">
                  <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{q.goFurther}</span>
                </p>
              )}
            </div>
          )
        })}

        {!submitted ? (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-stone-400">
              已作答 {answeredCount} / {questions.length}
              {!allAnswered && '（全部作答后可提交）'}
            </p>
            <Button onClick={() => setSubmitted(true)} disabled={!allAnswered}>
              提交并查看解析
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm text-stone-700">
              <Trophy className={`h-4 w-4 ${pct >= 60 ? 'text-amber-500' : 'text-stone-400'}`} />
              {pct >= 90
                ? '掌握得很扎实，可以直接做实验作业了'
                : pct >= 70
                  ? '基本掌握，建议看下答错题的解析再重做一遍'
                  : pct >= 60
                    ? '刚过线，建议回到「算法原理」标签再读一遍'
                    : '建议先看原理与演示，再回来重做'}
            </p>
            {onNavigate && navigateTo && (
              <Button variant="outline" size="sm" onClick={() => onNavigate(navigateTo)}>
                去动手实验
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}