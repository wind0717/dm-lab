import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // react-refresh/only-export-components 全项目关闭。
    //
    // 该规则要求「组件文件只导出组件」，但本项目有两类合理例外：
    //   1. src/components/ui/* 是 shadcn 官方组件库，cva 变体、Badge 变体
    //      等辅助导出与组件同文件是上游既定结构，不宜改动。
    //   2. pages/cluster/clusterShared.tsx、pages/walkthrough/walkShared.tsx
    //      同时导出数据面板组件与配套的 genPts() 生成函数，二者必须成对维护
    //      放在同一文件，拆开反而割裂。
    // 该规则只影响开发时的 Fast Refresh 粒度，与运行时行为无关。
    files: ['**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
