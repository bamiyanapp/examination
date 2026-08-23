import FamilyCreate from './pages/FamilyCreate.jsx'

// このページの訪問者は、他のページ（LINE連携・想定問答等）が前提とする
// isAllowedEmail（examination-allowed-emailsへの登録済み）をまだ満たしていない
// 招待済みユーザーそのものである（examination#242）。UserMenu・BackendCacheWarmer・
// NavigationOverlay等の共通コンポーネントは/_me・/_voice-token等isAllowedEmail
// 前提のAPIに依存しており、この訪問者に対しては機能しない（各コンポーネント自身の
// 「取得失敗時は何も表示しない」フォールバックにより壊れはしないが、意味のある
// 表示にもならない）ため、他アプリと異なりあえて含めない。PWA化（manifest.json・
// Service Worker）も、一度きりの招待受諾フローでありホーム画面に追加する対象では
// ないため行わない
function App() {
  return <FamilyCreate />
}

export default App
