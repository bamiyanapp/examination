import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // dev-standards submoduleからsymlinkで共有しているコンポーネント
  // （shared/ui/ErrorBoundary.jsx、examination#449）がimportするnpmパッケージ（react）を、
  // symlinkの実体（dev-standards配下）ではなくこのアプリ自身のnode_modulesから
  // 解決させるために必要（既定ではVite/Node.jsはsymlinkの実体パス基準で
  // node_modulesを探索するため、dev-standards側にはインストールされていない
  // パッケージの解決に失敗する）
  resolve: {
    preserveSymlinks: true,
  },
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
