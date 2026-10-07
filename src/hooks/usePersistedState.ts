// ============================================================
// usePersistedState —— 把实验参数存档到浏览器，刷新不丢
// ============================================================
//
// 为什么需要：教学场景里学生调了一组参数（测试集占比、树深、随机种子…），
// 手滑刷新就全归零，无法继续实验、也没法把「我调出 88% 准确率」复现出来。
//
// 存什么、不存什么：
//   ✅ 存 —— 实验参数（preset / seed / maxDepth / testRatio / 流水线配置…）
//   ❌ 不存 —— 过程与产物（points 坐标、训练结果 results、播放进度 step、CSV 原始数据）
//      这些要么可由参数确定性重算出来，要么体积大（CSV 可能几 MB），
//      存进localStorage 会很快撑爆 5MB 配额。
//      进度类state 刷新后从头开始更符合教学预期（"重新推演一遍"）。
//
// 存储介质：
//   localStorage  —— 长期参数（跨会话保留）
//   sessionStorage —— 大块临时数据（如上传的 CSV，标签页关闭即释放）
//
// 容错设计（真实会遇到的情况都覆盖了）：
//   1. localStorage 不可用（隐私模式 / 被禁用）→ 退化为普通 useState
//   2. 配额超限（写入抛 QuotaExceededError）→ 静默降级为内存态
//   3. 存的内容不是合法 JSON（手动改坏 / 旧版本残留）→ 用默认值
//   4. 默认值或存档含不可序列化值（函数 / DOM 节点）→ 只在写入时捕获，不崩
// ============================================================

import { useEffect, useState } from 'react'

/** 存储介质 */
type StorageKind = 'local' | 'session'

/** 带命名空间的 key 前缀，避免与站点其他脚本冲突 */
const PREFIX = 'dm-lab:'

function storageKey(kind: StorageKind, key: string): string {
  return `${PREFIX}${kind}:${key}`
}

function getStore(kind: StorageKind): Storage | null {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage
    // 触发一次读写，确认可用（隐私模式下访问属性就可能抛）
    const probe = `${PREFIX}__probe__`
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

function readRaw(kind: StorageKind, key: string): string | null {
  const s = getStore(kind)
  if (!s) return null
  try {
    return s.getItem(storageKey(kind, key))
  } catch {
    return null
  }
}

function writeRaw(kind: StorageKind, key: string, value: string): boolean {
  const s = getStore(kind)
  if (!s) return false
  try {
    s.setItem(storageKey(kind, key), value)
    return true
  } catch {
    // 配额超限：写入失败就放弃存档，退化为内存态（不打扰用户）
    return false
  }
}

/**
 * 读取初始值：从存档恢复，失败则用默认值。
 *
 * 若默认值是「普通对象」，会与存档做**浅层合并**——这样后续版本新增了参数字段时，
 * 旧存档里缺的字段会用新默认值补上，而不是变成 undefined 导致页面崩。
 * 例：v1 存了 {a:1}，v2 默认值是 {a:0, b:2}，读出来是 {a:1, b:2}。
 */
export function loadPersisted<T>(key: string, fallback: T, kind: StorageKind = 'local'): T {
  const raw = readRaw(kind, key)
  if (raw === null) return fallback
  try {
    const parsed = JSON.parse(raw) as T
    // 基本校验：存档不应是 null / undefined
    if (parsed === null || parsed === undefined) return fallback
    // 双方都是「普通对象」时浅合并，缺字段由默认值兜底
    if (
      isPlainObject(parsed) &&
      isPlainObject(fallback)
    ) {
      return { ...(fallback as object), ...(parsed as object) } as T
    }
    return parsed
  } catch {
    // 存档损坏（手动改坏 / 版本变更后结构不同）→ 清掉脏数据用默认值
    try {
      getStore(kind)?.removeItem(storageKey(kind, key))
    } catch {
      /* 忽略 */
    }
    return fallback
  }
}

/** 判断是否「普通对象」：排除 null、数组、Date、Map 等特殊类型 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** 清除某项存档（供「恢复默认」按钮使用） */
export function clearPersisted(key: string, kind: StorageKind = 'local'): void {
  try {
    getStore(kind)?.removeItem(storageKey(kind, key))
  } catch {
    /* 忽略 */
  }
}

/**
 * 与 useState 同签名，但状态会同步到浏览器存储，刷新后自动恢复。
 *
 * @param key存储标识。建议 `页面名:参数名`，如 'dtree:preset'
 * @param initial 默认值（也用作类型推断基准）
 * @param kind   'local' 长期保留（默认） | 'session' 标签页级
 * @param options.enabled 传false 可临时关闭存档（如恢复默认时）
 *
 * @example
 * const [maxDepth, setMaxDepth] = usePersistedState('dtree:maxDepth', 4)
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  kind: StorageKind = 'local',
  options?: { enabled?: boolean },
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const enabled = options?.enabled ?? true

  // 惰性初始化：只在挂载时读一次存档
  const [value, setValue] = useState<T>(() => (enabled ? loadPersisted<T>(key, initial, kind) : initial))

  /**
   * 换 key 时重新读档。
   * 用 state 记录「当前读的是哪个 key」，而不是在渲染期读 ref——
   * 后者违反 React 规则（refs 不参与渲染），且在并发模式下行为不可靠。
   * 触发时机是 effect，比渲染期比对多一次渲染，但换 key 是低频操作，可接受。
   */
  const [boundKey, setBoundKey] = useState(`${kind}::${key}`)
  const currentKey = `${kind}::${key}`
  if (boundKey !== currentKey) setBoundKey(currentKey)

  useEffect(() => {
    if (boundKey !== currentKey) return
    if (!enabled) {
      setValue(initial)
      return
    }
    // key 或 kind 变了 → 从新存档恢复
    setValue((prev) => {
      const restored = loadPersisted<T>(key, initial, kind)
      // 避免无意义的对象引用变化导致额外渲染
      return JSON.stringify(prev) === JSON.stringify(restored) ? prev : restored
    })
    // initial 刻意不进依赖：它是默认值声明，改它不应触发重读
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundKey, currentKey, enabled])

  // 写入：值变化后同步到存储
  useEffect(() => {
    if (!enabled) return
    try {
      const json = JSON.stringify(value)
      if (json === undefined) return // 值为 undefined（如函数）→ 不存档
      writeRaw(kind, key, json)
    } catch {
      // 序列化失败（如含循环引用、BigInt）→ 静默忽略，不影响交互
    }
  }, [value, key, kind, enabled])

  return [value, setValue]
}

/**
 * 一次性读档（不双向绑定）。适合恢复大对象、避免频繁写盘的场景。
 */
export function usePersistedValue<T>(key: string, initial: T, kind: StorageKind = 'local'): T {
  const [value] = usePersistedState(key, initial, kind)
  return value
}

/** 导出存储介质常量，便于调用方拼 session 存档 */
export const STORAGE = {
  /** 长期参数，跨会话保留 */
  persist: 'local' as StorageKind,
  /** 临时数据，标签页关闭即释放 */
  temp: 'session' as StorageKind,
}
