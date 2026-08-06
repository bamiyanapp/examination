import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MkDocs静的サイトの/settings/profile-edit/配下へビルド成果物を上書き配置する
  // （deploy.yml、examination#125）ため、サイトルートではなくこのサブパスを基準にする
  base: '/settings/profile-edit/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
