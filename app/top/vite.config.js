import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // examination#82: /top/でのプレビュー確認の結果、正式なトップページとして採用したため
  // サイトルート('/')を基準にする
  base: '/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
