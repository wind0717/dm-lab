import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  //相对路径：dist 可挂到任意静态平台的任意子目录，无需重写规则
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // vendor 拆分：react 核心、图表库、UI 组件分开，便于浏览器并行下载与长期缓存
    rollupOptions: {
      output: {
        manualChunks: {
          // React 运行时变动最少，单独成块可长期命中缓存
          'vendor-react': ['react', 'react-dom', 'react-router'],
          // 图表库体积大且少改动，单独切出去
          'vendor-charts': ['recharts'],
          // 交互控件（滑动条/弹窗/浮层）合一块
          'vendor-radix': [
            '@radix-ui/react-slider',
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-dropdown-menu',
          ],
        },
      },
    },
    // 切块后单块应远小于 500KB，放宽阈值避免误报
    chunkSizeWarningLimit: 700,
  },
});
