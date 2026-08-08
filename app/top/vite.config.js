import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // dev-standards submoduleからsymlinkで共有しているコンポーネント
  // （examination#159〜#163等）がimportするnpmパッケージ（qrcode.react等）を、
  // symlinkの実体（dev-standards配下）ではなくこのアプリ自身のnode_modulesから
  // 解決させるために必要（既定ではVite/Node.jsはsymlinkの実体パス基準で
  // node_modulesを探索するため、dev-standards側にはインストールされていない
  // パッケージの解決に失敗する）
  resolve: {
    preserveSymlinks: true,
  },
  // examination#82: /top/でのプレビュー確認の結果、正式なトップページとして採用したため
  // サイトルート('/')を基準にする
  base: '/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
