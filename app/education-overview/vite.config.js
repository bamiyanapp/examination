import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MkDocs静的サイトの/education/配下（教育セクションの概要ページ）へビルド成果物を
  // 上書き配置する（cd.yml、examination#92）ため、サイトルートではなく
  // このサブパスを基準にする
  base: '/education/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
