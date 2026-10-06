// ============================================================
// CSV 上传解析 —— 纯函数
// 约定：首行表头，最后一列 = 类别标签，其余列 = 数值特征
// 非数值特征列自动做整数编码（并记录映射供 UI 提示）
// 限制：文件 ≤5MB，行数 ≤5000，特征列 ≤20，标签仅支持二分类
// ============================================================

export const CSV_LIMITS = {
  maxBytes: 5 * 1024 * 1024, // 5MB
  maxRows: 5000,
  maxFeatures: 20,
}

export interface CsvEncoding {
  column: string // 列名
  map: Array<[string, number]> // 原始值 → 编码整数
}

export interface CsvData {
  X: number[][]
  y: number[]
  featureNames: string[]
  classNames: [string, string] // [0 类名, 1 类名]
  encodings: CsvEncoding[] // 被整数编码的特征列
  preview: string[][] // 前 5 行原始文本（含表头之外的行）
  headers: string[]
}

/**
 * 解析 CSV 文本。解析失败抛出 Error（中文提示）。
 * 仅支持逗号分隔、不支持引号内嵌逗号（教学版简化，报错时会提示）。
 */
export function parseCsvText(text: string): CsvData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) throw new Error('CSV 至少需要 1 行表头 + 1 行数据')

  if (lines.length - 1 > CSV_LIMITS.maxRows) {
    throw new Error(`行数超限：最多 ${CSV_LIMITS.maxRows} 行数据，当前 ${lines.length - 1} 行`)
  }

  const rows = lines.map((l) => l.split(',').map((c) => c.trim()))
  const headers = rows[0]
  const nCols = headers.length
  if (nCols < 2) throw new Error('至少需要 1 个特征列 + 1 个标签列（用逗号分隔，不支持引号内嵌逗号）')
  if (nCols - 1 > CSV_LIMITS.maxFeatures) {
    throw new Error(`特征列超限：最多 ${CSV_LIMITS.maxFeatures} 列特征，当前 ${nCols - 1} 列`)
  }

  const dataRows = rows.slice(1)
  for (const r of dataRows) {
    if (r.length !== nCols) throw new Error(`存在列数不一致的行（应为 ${nCols} 列），请检查是否有多余逗号`)
  }

  // ---- 最后一列：类别标签 ----
  const rawLabels = dataRows.map((r) => r[nCols - 1])
  const distinctLabels = Array.from(new Set(rawLabels)).sort()
  if (distinctLabels.length !== 2) {
    throw new Error(`本工作台目前仅支持二分类：标签列应有 2 种取值，检测到 ${distinctLabels.length} 种`)
  }
  const labelMap = new Map(distinctLabels.map((v, i) => [v, i]))
  const y = rawLabels.map((v) => labelMap.get(v)!)
  const classNames: [string, string] = [distinctLabels[0], distinctLabels[1]]

  // ---- 特征列：数值直接使用，非数值做整数编码 ----
  const encodings: CsvEncoding[] = []
  const X: number[][] = dataRows.map(() => [])
  for (let j = 0; j < nCols - 1; j++) {
    const col = dataRows.map((r) => r[j])
    const allNumeric = col.every((v) => v !== '' && !Number.isNaN(Number(v)))
    if (allNumeric) {
      col.forEach((v, i) => X[i].push(Number(v)))
    } else {
      const distinct = Array.from(new Set(col)).sort()
      if (distinct.length > 20) {
        throw new Error(`特征列「${headers[j]}」有 ${distinct.length} 种非数值取值，过多（上限 20 种），请先做预处理`)
      }
      const map = new Map(distinct.map((v, i) => [v, i]))
      col.forEach((v, i) => X[i].push(map.get(v)!))
      encodings.push({ column: headers[j], map: distinct.map((v, i) => [v, i] as [string, number]) })
    }
  }

  return {
    X,
    y,
    featureNames: headers.slice(0, nCols - 1),
    classNames,
    encodings,
    preview: dataRows.slice(0, 5),
    headers,
  }
}

/**
 * 生成示例 CSV（虚拟"客户流失"数据 200 行，中文表头）
 * 规则：月活跃天数低 + 投诉次数多 → 更可能流失，叠加噪声
 */
export function sampleCsv(): string {
  let seed = 12345
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const lines = ['月活跃天数,月均消费金额,客服投诉次数,是否流失']
  for (let i = 0; i < 200; i++) {
    const churn = i % 2 === 0 ? 1 : 0
    // 流失客户：活跃低、消费低、投诉多
    const active = churn ? 3 + rand() * 10 : 12 + rand() * 16
    const spend = churn ? 20 + rand() * 60 : 60 + rand() * 120
    const complaints = churn ? Math.floor(rand() * 6) : Math.floor(rand() * 3)
    lines.push(
      `${active.toFixed(1)},${spend.toFixed(1)},${complaints},${churn ? '流失' : '未流失'}`,
    )
  }
  // 打乱行序
  const body = lines.slice(1)
  for (let i = body.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[body[i], body[j]] = [body[j], body[i]]
  }
  return [lines[0], ...body].join('\n')
}
