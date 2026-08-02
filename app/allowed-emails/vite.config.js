import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MkDocs静的サイトの/settings/allowed-emails/配下へビルド成果物を上書き配置する
  // （deploy.yml、examination#78）ため、サイトルートではなくこのサブパスを基準にする
  base: '/settings/allowed-emails/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
