import { type ReactNode } from "react";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration.jsx";
import BackendCacheWarmer from "./BackendCacheWarmer.jsx";
import UpdateNotifier from "./UpdateNotifier.jsx";
import SpeculationRules from "./SpeculationRules.jsx";
import NavigationOverlay from "./NavigationOverlay.jsx";
import UserMenu from "./UserMenu.tsx";
import BackToTop from "./BackToTop.jsx";

// app/配下の各アプリ（family-create/を除く）が共通で使うアプリ起動時の設定・
// ラッパー。以前は各App.tsxへ全く同じ内容をファイルコピーしており、jscpdの
// 重複率を押し上げる主要因の1つだった。UserMenu.tsxと同様、preserveSymlinks:true
// なVite設定のもとsymlinkで共有する（examination#447）

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

async function getBackendAuthToken(): Promise<string | undefined> {
  const res = await fetch("/_voice-token", { method: "POST" });
  if (!res.ok) return undefined;
  const { token } = await res.json();
  return token;
}

// トップページ（examination#82でサイトルート採用）のみBackToTopを表示しない
// （既存の挙動を維持。理由の記録は無いが、ランディングページとして
// スクロール量が少なくボタンの必要性が薄いためと推測される）
export default function AppShell({ page, showBackToTop = true }: { page: ReactNode; showBackToTop?: boolean }) {
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
      {showBackToTop && <BackToTop />}
      {page}
    </>
  );
}
