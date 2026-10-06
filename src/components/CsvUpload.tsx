// CSV 上传组件：拖拽/点击选择文件，解析预览 + 示例 CSV 下载
// 默认模式：最后一列必须是二分类标签（分类实验用）
// loose 模式（数据预处理用）：允许无标签列、允许空单元格（→ 缺失值），自动识别数值/类别列
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, Download, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { parseCsvText, sampleCsv, CSV_LIMITS, type CsvData } from '@/lib/csv'
import { parseCsvLoose, genDirtyDataset, getRow, rowCount, PREP_CSV_LIMITS, type PrepData } from '@/lib/preprocess'

interface Props {
  onData?: (d: CsvData) => void
  /** 宽松模式：全特征表（可无标签、可含缺失），解析结果走 onDataLoose */
  loose?: boolean
  onDataLoose?: (d: PrepData) => void
}

export default function CsvUpload({ onData, loose = false, onDataLoose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<CsvData | null>(null)
  const [parsedLoose, setParsedLoose] = useState<PrepData | null>(null)
  const [fileName, setFileName] = useState('')

  const handleFile = (file: File) => {
    setError(null)
    if (file.size > CSV_LIMITS.maxBytes) {
      setError(`文件过大：限制 ${CSV_LIMITS.maxBytes / 1024 / 1024}MB，当前 ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        if (loose) {
          const d = parseCsvLoose(String(reader.result))
          setParsedLoose(d)
          setParsed(null)
          setFileName(file.name)
          onDataLoose?.(d)
        } else {
          const d = parseCsvText(String(reader.result))
          setParsed(d)
          setParsedLoose(null)
          setFileName(file.name)
          onData?.(d)
        }
      } catch (e) {
        setParsed(null)
        setParsedLoose(null)
        setError(e instanceof Error ? e.message : '解析失败')
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const downloadSample = () => {
    let csv: string
    let name: string
    if (loose) {
      const d = genDirtyDataset({ seed: 7 })
      const lines = [d.headers.join(',')]
      for (let i = 0; i < rowCount(d); i++) {
        lines.push(getRow(d, i).map((c) => (c === null ? '' : c)).join(','))
      }
      csv = lines.join('\n')
      name = '示例数据-乡村电商（含缺失）.csv'
    } else {
      csv = sampleCsv()
      name = '示例数据-客户流失.csv'
    }
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  // 类别分布统计（默认模式）
  const dist = parsed
    ? [0, 1].map((c) => ({ name: parsed.classNames[c], n: parsed.y.filter((v) => v === c).length }))
    : []

  // loose 模式概览
  const looseSummary = parsedLoose
    ? {
        n: rowCount(parsedLoose),
        nNum: parsedLoose.kinds.filter((k) => k === 'numeric').length,
        nCat: parsedLoose.kinds.filter((k) => k === 'category').length,
        nMissing: parsedLoose.cols.reduce((s, c) => s + c.filter((v) => v === null).length, 0),
      }
    : null

  return (
    <div className="space-y-3">
      {/* 拖拽区 */}
      <div
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-stone-300 bg-stone-50 hover:border-indigo-300'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) handleFile(f)
        }}
      >
        <Upload className="h-6 w-6 text-stone-400" />
        <p className="text-sm text-stone-600">
          拖拽 CSV 到这里，或 <span className="font-medium text-indigo-600">点击选择文件</span>
        </p>
        <p className="text-xs text-stone-400">
          {loose
            ? `首行表头 · 可以没有标签列 · 空单元格按缺失处理 · ≤${PREP_CSV_LIMITS.maxBytes / 1024 / 1024}MB · ≤${PREP_CSV_LIMITS.maxRows} 行 · ≤${PREP_CSV_LIMITS.maxCols} 列`
            : `首行表头 · 最后一列是类别标签（二分类） · ≤${CSV_LIMITS.maxBytes / 1024 / 1024}MB · ≤${CSV_LIMITS.maxRows} 行 · ≤${CSV_LIMITS.maxFeatures} 个特征列`}
        </p>
        <p className="text-xs text-stone-400">
          所有计算都在你的浏览器里完成——数据越大动画越慢，教学演示建议 100~2000 行效果最佳。
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={downloadSample}>
          <Download className="mr-1 h-3.5 w-3.5" />
          {loose ? '下载示例 CSV（乡村电商脏数据 200 行）' : '下载示例 CSV（客户流失 200 行）'}
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 解析结果（默认模式） */}
      {parsed && !error && (
        <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-stone-700">
            <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
            {fileName}：{parsed.y.length} 行 × {parsed.featureNames.length} 列特征， 类别分布：
            {dist.map((d) => `${d.name} ${d.n} 个`).join(' / ')}
          </p>
          {parsed.encodings.length > 0 && (
            <p className="text-xs text-amber-700">
              以下非数值列已自动整数编码：
              {parsed.encodings.map((e) => `「${e.column}」${e.map.map(([v, c]) => `${v}→${c}`).join('，')}`).join('；')}
            </p>
          )}
          {/* 前 5 行预览 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200">
                  {parsed.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-medium text-stone-500">
                      {h}
                      {i === parsed.headers.length - 1 && <span className="ml-1 text-indigo-500">(标签)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.preview.map((row, i) => (
                  <tr key={i} className="border-b border-stone-100">
                    {row.map((c, j) => (
                      <td key={j} className="px-2 py-1 font-mono text-stone-600">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 解析结果（loose 模式） */}
      {parsedLoose && looseSummary && !error && (
        <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-stone-700">
            <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
            {fileName}：{looseSummary.n} 行 × {parsedLoose.headers.length} 列（数值 {looseSummary.nNum} 列 / 类别 {looseSummary.nCat} 列），
            缺失单元格 {looseSummary.nMissing} 个
          </p>
          {parsedLoose.labelCol !== null && (
            <p className="text-xs text-indigo-600">最后一列「{parsedLoose.headers[parsedLoose.labelCol]}」恰好 2 种取值，已识别为标签列（可在上方改选）</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200">
                  {parsedLoose.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-medium text-stone-500">
                      {h}
                      <span className="ml-1 text-stone-300">{parsedLoose.kinds[i] === 'numeric' ? '数' : '类'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.min(5, rowCount(parsedLoose)) }, (_, i) => (
                  <tr key={i} className="border-b border-stone-100">
                    {getRow(parsedLoose, i).map((c, j) => (
                      <td key={j} className={`px-2 py-1 font-mono ${c === null ? 'text-amber-600' : 'text-stone-600'}`}>
                        {c === null ? '—' : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
