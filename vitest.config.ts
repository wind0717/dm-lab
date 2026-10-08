// Vitest 独立配置
// 单独成文件而不是塞进 vite.config.ts，是因为 vite 的 UserConfig 类型里
// 没有 test 字段（那是 vitest 扩展的），混在一起会报类型错误。
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // 算法层是纯函数、不依赖 DOM，用 node 环境跑最快
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: 'default',
  },
})
