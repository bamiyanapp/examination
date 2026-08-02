import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // examination#82: 段階移行のため、まずは既存のトップページ（/、knowledge/index.md）と
  // 並行して/top/へプレビュー配置する。旧ページの削除が判断できた段階で'/'へ切り替える
  base: '/top/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
