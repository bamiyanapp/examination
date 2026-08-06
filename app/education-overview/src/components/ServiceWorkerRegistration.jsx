import { useEffect } from "react";

// examination#118: サイトルート（app/top）が配信する/sw.jsを登録する。
// 静的ページ・バックエンドAPI（想定問答・模擬面接記録等の一覧）を
// Stale-While-Revalidate方式でキャッシュし、2回目以降の表示を高速化する。
// 各アプリは独立ビルドのため、既存の重複方針（NavigationOverlay等と同様）を
// 踏襲しこのコンポーネントをファイルコピーで複製する
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service Worker registration failed", error);
    });
  }, []);

  return null;
}
