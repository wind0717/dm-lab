// ============================================================
// 生产级静态服务器 —— 用于 VPS 部署（systemd 托管）
// ============================================================
// 与 lan-server.cjs 的区别（后者只适合可信局域网）：
//   ✓ gzip 压缩 —— 文本资源传输量降约 70%
//   ✓ 缓存策略   —— 带 hash 的静态资源长缓存，index.html 不缓存
//   ✓ 安全响应头 —— nosniff / frame-options / referrer-policy / CSP
//   ✓ 健康检查   —— GET /healthz 返回 200，供负载均衡与监控使用
//   ✓ 优雅退出   —— 收到 SIGTERM 先停收新连接再退出，避免 systemd 报失败
//   ✓ 请求日志   —— 简洁单行，便于 journalctl 查看
//
// 用法：node server.cjs [端口]      （默认 8080，端口也可由 PORT 环境变量指定）
// 依赖：零外部依赖，仅用 Node 内置模块
// ============================================================

const http = require('http')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const os = require('os')

const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10)
const ROOT = path.join(__dirname, 'dist')
// 日志开关：systemd 下建议保持开启（输出到 journalctl）
const LOG = process.env.LOG_REQUESTS !== '0'

// ------------------------------------------------------------
// 静态文件清单：构建时读取，启动后不再变（Vite 产物带 hash）
// ------------------------------------------------------------
/** @type {Map<string, {file: string, size: number, mtime: number}>} */
const FILE_CACHE = new Map()

function scanDist(dir = ROOT, prefix = '') {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    const key = prefix + e.name
    if (e.isDirectory()) {
      scanDist(full, key + '/')
    } else if (e.isFile()) {
      try {
        const st = fs.statSync(full)
        FILE_CACHE.set(key, { file: full, size: st.size, mtime: st.mtimeMs })
      } catch {
        /* 忽略无法 stat 的文件 */
      }
    }
  }
}

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('❌ 找不到 dist/index.html')
  console.error('   请先在项目目录执行：npm run build')
  process.exit(1)
}
scanDist()
console.log(`[server] 已索引 ${FILE_CACHE.size} 个静态文件`)
console.log(`[server] 根目录 ${ROOT}`)

// ------------------------------------------------------------
// MIME 与压缩策略
// ------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'woff',
  '.woff2': 'woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

/** 这些类型压缩后收益大 */
const COMPRESSIBLE = new Set([
  'text/html; charset=utf-8',
  'text/javascript; charset=utf-8',
  'text/css; charset=utf-8',
  'application/json; charset=utf-8',
  'image/svg+xml',
  'text/plain; charset=utf-8',
])

/** 小于 1KB 的压缩不划算 */
const MIN_COMPRESS_SIZE = 1024

// ------------------------------------------------------------
// 安全响应头
// ------------------------------------------------------------
function securityHeaders(nonce) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  }
  // 本平台不需要任何外部资源，CSP 可以很严格。
  // style-src 允许 unsafe-inline —— Tailwind 与 React 内联样式需要。
  // script-src 不加 unsafe-inline：Vite 产物是外部文件，安全。
  if (nonce) {
    h['Content-Security-Policy'] =
      `default-src 'self'; ` +
      `script-src 'self'; ` +
      `style-src 'self' 'unsafe-inline'; ` +
      `img-src 'self' data: blob:; ` +
      `font-src 'self' data:; ` +
      `connect-src 'self'; ` +
      `object-src 'none'; ` +
      `base-uri 'self'; ` +
      `form-action 'self'; ` +
      `frame-ancestors 'self'`
  }
  return h
}

// ------------------------------------------------------------
// 工具
// ------------------------------------------------------------
function parseCookies(req) {
  const raw = req.headers.cookie
  if (!raw) return {}
  const out = {}
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function acceptsGzip(req) {
  const a = req.headers['accept-encoding']
  return typeof a === 'string' && /\bgzip\b/.test(a)
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf) return xf.split(',')[0].trim()
  return req.socket.remoteAddress || '-'
}

// ------------------------------------------------------------
// 请求处理
// ------------------------------------------------------------
const server = http.createServer((req, res) => {
  const started = process.hrtime.bigint()

  // 健康检查：不走静态逻辑，供监控探活
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ status: 'ok', files: FILE_CACHE.size, uptime: Math.round(process.uptime()) }))
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end('Method Not Allowed')
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(req.url.split('?')[0])
  } catch {
    res.writeHead(400)
    res.end('Bad Request')
    return
  }

  // 根路径 → index.html；其余交给缓存清单查找
  let key = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  let entry = FILE_CACHE.get(key)

  // SPA 兜底：找不到且不是扩展名请求（.js/.css/.png 等）→ 回 index.html
  // 本平台用的是 HashRouter，其实不需要 SPA 兜底，但留着更稳妥
  // （万一以后换成 BrowserRouter，深链刷新不会 404）。
  if (!entry && !/\.[a-z0-9]+$/i.test(key)) {
    entry = FILE_CACHE.get('index.html')
    key = 'index.html'
  }

  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders() })
    res.end('404 Not Found')
    return
  }

  const ext = path.extname(key).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'

  const headers = securityHeaders(true)
  headers['Content-Type'] = mime
  if (ext === '.html') {
    // index.html 不缓存：保证学生每次打开都拿到最新的资源引用
    headers['Cache-Control'] = 'no-cache, must-revalidate'
  } else {
    // 带 hash 的文件名 → 内容变了文件名也变，可以永久缓存
    headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  }

  const useGzip = acceptsGzip(req) && COMPRESSIBLE.has(mime) && entry.size >= MIN_COMPRESS_SIZE

  fs.readFile(entry.file, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Internal Server Error')
      console.error(`[server] 读取失败 ${key}:`, err.message)
      return
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, { ...headers, 'Content-Length': data.length })
      res.end()
      return
    }

    if (useGzip) {
      zlib.gzip(data, (zerr, gz) => {
        if (zerr) {
          // 压缩失败就发原始内容，不能因此报错
          res.writeHead(200, headers)
          res.end(data)
          return
        }
        res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': gz.length, Vary: 'Accept-Encoding' })
        res.end(gz)
      })
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': data.length })
      res.end(data)
    }

    if (LOG) {
      const ms = Number(process.hrtime.bigint() - started) / 1e6
      console.log(`${req.method} ${req.url} ${res.statusCode} ${ms.toFixed(1)}ms ${clientIp(req)}`)
    }
  })
})

// 大量并发小文件时适当提高 backlog
server.keepAliveTimeout = 65000
server.headersTimeout = 70000

server.listen(PORT, '0.0.0.0', () => {
  console.log('')
  console.log('  ✅ 数据挖掘实验教学平台 · 服务已启动')
  console.log('')
  console.log(`     监听      0.0.0.0:${PORT}`)
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`     本机访问  http://localhost:${PORT}/`)
        console.log(`     局域网    http://${net.address}:${PORT}/`)
      }
    }
  }
  console.log(`     健康检查  http://localhost:${PORT}/healthz`)
  console.log('')
  console.log('     按 Ctrl+C 停止')
  console.log('')
})

// ------------------------------------------------------------
// 优雅退出：systemd 停止服务时先停收新连接
// ------------------------------------------------------------
let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[server] 收到 ${signal}，开始优雅退出…`)
  // 给在途请求 5 秒完成
  const timer = setTimeout(() => {
    console.log('[server] 超时，强制退出')
    process.exit(0)
  }, 5000)
  timer.unref()
  server.close(() => {
    console.log('[server] 已关闭所有连接，退出')
    process.exit(0)
  })
  // 关闭 keep-alive 连接，让 server.close 尽快完成
  server.closeIdleConnections?.()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('uncaughtException', (err) => {
  console.error('[server] 未捕获异常:', err)
  // 不直接退出，交给 systemd 的 Restart=always 处理
})

process.on('unhandledRejection', (err) => {
  console.error('[server] 未处理的 Promise 拒绝:', err)
})