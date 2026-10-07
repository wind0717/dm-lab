// ============================================================
// usePersistedState 自测 —— 验证存档读写与各类容错
// 运行方式（项目根目录）：node scripts/selftest-persist.mjs
//
// 背景：P0-④ 要解决「刷新丢全部参数」。这个 hook 要在真实浏览器环境里
// 正确工作，且在隐私模式 / 配额超限 / 存档损坏时优雅降级。
// 本脚本在 Node 里用内存版 Storage 模拟浏览器，验证核心逻辑分支。
// ============================================================

/** 内存版 Storage，模拟浏览器 */
class MemStorage {
  constructor(name) {
    this.name = name
    this.map = new Map()
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null
  }
  setItem(k, v) {
    if (this.volatile) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    this.map.set(k, String(v))
  }
  removeItem(k) {
    this.map.delete(k)
  }
}

// ---- 把 hook 的纯逻辑抽出来测（与 src/hooks/usePersistedState.ts 保持一致）----
const PREFIX = 'dm-lab:'
const store = { local: new MemStorage('local'), session: new MemStorage('session') }
let available = true

const storageKey = (kind, key) => `${PREFIX}${kind}:${key}`

function getStore(kind) {
  if (!available) return null
  try {
    const s = store[kind]
    const probe = `${PREFIX}__probe__`
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

function readRaw(kind, key) {
  const s = getStore(kind)
  if (!s) return null
  try {
    return s.getItem(storageKey(kind, key))
  } catch {
    return null
  }
}

function writeRaw(kind, key, value) {
  const s = getStore(kind)
  if (!s) return false
  try {
    s.setItem(storageKey(kind, key), value)
    return true
  } catch {
    return false
  }
}

function isPlainObject(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function loadPersisted(key, fallback, kind = 'local') {
  const raw = readRaw(kind, key)
  if (raw === null) return fallback
  try {
    const parsed = JSON.parse(raw)
    if (parsed === null || parsed === undefined) return fallback
    if (isPlainObject(parsed) && isPlainObject(fallback)) {
      return { ...fallback, ...parsed }
    }
    return parsed
  } catch {
    try {
      getStore(kind)?.removeItem(storageKey(kind, key))
    } catch {
      /* 忽略 */
    }
    return fallback
  }
}

function clearPersisted(key, kind = 'local') {
  try {
    getStore(kind)?.removeItem(storageKey(kind, key))
  } catch {
    /* 忽略 */
  }
}

// ---- 断言框架 ----
let pass = 0
let fail = 0
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function check(name, fn) {
  try {
    fn()
    pass++
    console.log('  ✓ ' + name)
  } catch (e) {
    fail++
    console.log('  ✗ ' + name + ' → ' + e.message)
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || '断言失败')
}

console.log('【1】基本读写往返')
check('首次读取返回默认值', () => {
  assert(loadPersisted('dtree:maxDepth', 4) === 4, '应返回默认值 4')
})
check('写入后能读回', () => {
  writeRaw('local', 'dtree:maxDepth', JSON.stringify(7))
  assert(loadPersisted('dtree:maxDepth', 4) === 7, '应读回 7')
})
check('支持对象与数组', () => {
  const ops = [{ type: 'impute', col: 0 }, { type: 'scale' }]
  writeRaw('local', 'prep:ops', JSON.stringify(ops))
  assert(eq(loadPersisted('prep:ops', []), ops), '应读回同样的数组')
})
check('支持布尔与0 等假值', () => {
  writeRaw('local', 'x:a', JSON.stringify(false))
  writeRaw('local', 'x:b', JSON.stringify(0))
  writeRaw('local', 'x:c', JSON.stringify(''))
  assert(loadPersisted('x:a', true) === false, 'false 被误判为缺失')
  assert(loadPersisted('x:b', 9) === 0, '0 被误判为缺失')
  assert(loadPersisted('x:c', 'z') === '', '空串被误判为缺失')
})

console.log('')
console.log('【2】损坏存档的容错')
check('非法 JSON → 回退默认值且清掉脏数据', () => {
  store.local.setItem(storageKey('local', 'broken'), '{这不是JSON')
  const v = loadPersisted('broken', 42)
  assert(v === 42, '应回退默认值')
  assert(store.local.getItem(storageKey('local', 'broken')) === null, '脏数据应被清除')
})
check('存档是 null → 回退默认值', () => {
  store.local.setItem(storageKey('local', 'nul'), 'null')
  assert(loadPersisted('nul', 5) === 5, 'null 应回退')
})
check('存档缺字段时用默认值补上（版本演进兼容）', () => {
  store.local.setItem(storageKey('local', 'old'), JSON.stringify({ a: 1 }))
  const v = loadPersisted('old', { a: 0, b: 2 })
  assert(v.a === 1, '存档里有的字段应保留')
  assert(v.b === 2, '存档里缺的字段应被默认值补上')
})
check('数组不与默认值合并（避免类型混淆）', () => {
  store.local.setItem(storageKey('local', 'arr'), JSON.stringify([1, 2]))
  const v = loadPersisted('arr', [9, 9, 9])
  assert(eq(v, [1, 2]), '数组应原样返回，不做对象合并')
})
check('Date 等特殊类型不合并', () => {
  const d = new Date('2026-01-01')
  store.local.setItem(storageKey('local', 'dt'), JSON.stringify(d))
  const v = loadPersisted('dt', new Date('2020-01-01'))
  assert(typeof v === 'string', 'Date 序列化后是字符串，应原样返回')
})
check('clearPersisted 生效', () => {
  writeRaw('local', 'temp1', JSON.stringify(1))
  clearPersisted('temp1')
  assert(loadPersisted('temp1', 99) === 99, '清除后应回默认值')
})

console.log('')
console.log('【3】配额超限的降级')
check('写入抛 QuotaExceededError 时writeRaw 返回 false 而非抛出', () => {
  store.local.volatile = true
  const ok = writeRaw('local', 'big', JSON.stringify({ x: 1 }))
  assert(ok === false, '应返回 false 表示失败')
  store.local.volatile = false
})
check('配额超限后读取仍能工作（退化为默认值）', () => {
  store.local.volatile = true
  const v = loadPersisted('big', 7)
  assert(v === 7, '应回退默认值而非崩溃')
  store.local.volatile = false
})

console.log('')
console.log('【4】localStorage 完全不可用（隐私模式）')
check('available=false 时 getStore 返回 null', () => {
  available = false
  assert(getStore('local') === null, '应返回 null')
})
check('不可用时读取回退默认值（不崩）', () => {
  assert(loadPersisted('anything', 3) === 3, '应回退默认值')
})
check('不可用时写入返回 false（不崩）', () => {
  const ok = writeRaw('local', 'k', '1')
  assert(ok === false, '应返回 false')
})
check('不可用后恢复可用，读写正常', () => {
  available = true
  writeRaw('local', 'recover', JSON.stringify(11))
  assert(loadPersisted('recover', 0) === 11, '恢复后应能读回')
})

console.log('')
console.log('【5】session 与 local 隔离')
check('同名key 在两种介质下互不干扰', () => {
  writeRaw('local', 'same', JSON.stringify('from-local'))
  writeRaw('session', 'same', JSON.stringify('from-session'))
  assert(loadPersisted('same', null, 'local') === 'from-local', 'local 应读到 local 的值')
  assert(loadPersisted('same', null, 'session') === 'from-session', 'session 应读到 session 的值')
})
check('key 前缀加了命名空间', () => {
  assert(storageKey('local', 'x') === 'dm-lab:local:x', '缺命名空间前缀')
})

console.log('')
console.log('【6】不可序列化值的防护')
check('JSON.stringify(undefined) → undefined，写入被跳过', () => {
  const json = JSON.stringify(undefined)
  assert(json === undefined, '应返回 undefined')
  // hook 里的判断：if (json === undefined) return → 不调用 writeRaw
  let wrote = false
  if (json !== undefined) writeRaw('local', 'fn', json)
  wrote = store.local.getItem(storageKey('local', 'fn')) !== null
  assert(!wrote, '函数等不可序列化值不应写入')
})
check('循环引用被静默捕获（模拟 hook 内 try/catch）', () => {
  const a = { name: 'x' }
  a.self = a
  let threw = false
  try {
    JSON.stringify(a)
  } catch {
    threw = true
  }
  assert(threw, '循环引用确实会抛，hook 靠 try/catch 兜住')
})

console.log('')
console.log(`===== ${pass} 通过 / ${fail} 失败 =====`)
process.exit(fail ? 1 : 0)