import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // サイトルート直下の/family-create/へビルド成果物を配置する（cd.yml、examination#242）
  base: '/family-create/',
  build: {
    // E2Eカバレッジ収集（monocart-reporter）がビルド後のバンドルファイル単位ではなく
    // 実際のsrc/*.tsxファイル単位まで遡って集計できるようにする
    // （dev-standards docs/e2e-coverage-pattern.md、examination#450）
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // e2e/配下はPlaywright（npm run test:e2e）専用のテストで、vitestの既定の
    // includeパターン（**/*.spec.js等）に一致してしまうため明示的に除外する
    // （examination#414、PR #428で実際にvitestがe2e/top.spec.jsを拾ってしまい
    // 「Playwright Test did not expect test() to be called here」で失敗した）
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
