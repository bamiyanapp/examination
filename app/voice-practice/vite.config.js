import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MkDocs静的サイトの/education/voice-practice/配下へビルド成果物を上書き配置する
  // （cd.yml、examination#78）ため、サイトルートではなくこのサブパスを基準にする
  base: '/education/voice-practice/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
