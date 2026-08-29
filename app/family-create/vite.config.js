import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // サイトルート直下の/family-create/へビルド成果物を配置する（cd.yml、examination#242）
  base: '/family-create/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
