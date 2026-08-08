import MockInterviews from './pages/MockInterviews.jsx'
import NavigationOverlay from './components/NavigationOverlay.jsx'
import BackToTop from './components/BackToTop.jsx'
import SpeculationRules from './components/SpeculationRules.jsx'
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration.jsx'
import BackendCacheWarmer from './components/BackendCacheWarmer.jsx'
import UpdateNotifier from './components/UpdateNotifier.jsx'
import UserMenu from './components/UserMenu.jsx'

// examination#105: 音声で面接練習ページ（gzip約12MB超のONNXモデルを含んでいた経緯が
// あった）は今回もモバイル通信量への影響が大きいため先読み対象から除外している
const PREFETCH_URLS = [
  "/",
  "/education/",
  "/education/interview-questions/",
  "/education/mock-interviews/",
  "/settings/allowed-emails/",
  "/settings/line-link/",
];

// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合は各ページのsrc/pages/*.jsxとあわせてここも更新する
const BACKEND_LIST_ENDPOINTS = [
  "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/interview-questions",
  "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/mock-interviews",
  "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile",
];

async function getBackendAuthToken() {
  const res = await fetch("/_voice-token", { method: "POST" });
  if (!res.ok) return undefined;
  const { token } = await res.json();
  return token;
}


function App() {
  return (
    <>
      <ServiceWorkerRegistration />
      <BackendCacheWarmer
        endpoints={BACKEND_LIST_ENDPOINTS}
        getAuthToken={getBackendAuthToken}
        warmedFlagKey="examination-backend-cache-warmed"
      />
      <UpdateNotifier />
      <SpeculationRules urls={PREFETCH_URLS} />
      <NavigationOverlay />
      <UserMenu />
      <BackToTop />
      <MockInterviews />
    </>
  )
}

export default App
