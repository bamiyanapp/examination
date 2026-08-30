import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // dev-standards submoduleからsymlinkで共有しているコンポーネント
  // （examination#159〜#163等）がimportするnpmパッケージ（qrcode.react等）を、
  // symlinkの実体（dev-standards配下）ではなくこのアプリ自身のnode_modulesから
  // 解決させるために必要（既定ではVite/Node.jsはsymlinkの実体パス基準で
  // node_modulesを探索するため、dev-standards側にはインストールされていない
  // パッケージの解決に失敗する）
  resolve: {
    preserveSymlinks: true,
  },
  // MkDocs静的サイトの/education/配下（教育セクションの概要ページ）へビルド成果物を
  // 上書き配置する（cd.yml、examination#92）ため、サイトルートではなく
  // このサブパスを基準にする
  base: '/education/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
