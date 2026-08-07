import { useEffect } from "react";

// iOS PWA（ホーム画面から起動したスタンドアロン表示）はブラウザの自動的な
// Service Worker更新チェック（ページ遷移時・約24時間おき）が働きにくく、
// アプリを終了せずバックグラウンドへ回して再度開いただけでは新バージョンに
// 気づかないことがある（examination#122の実機確認で判明）。アプリがフォア
// グラウンドに戻るたびに明示的にregistration.update()を呼び、新バージョンの
// 検知（UpdateNotifierが拾うcontrollerchangeイベント）を確実にする
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// examination#118: サイトルート（app/top）が配信する/sw.jsを登録する。
// 静的ページ・バックエンドAPI（想定問答・模擬面接記録等の一覧）を
// Stale-While-Revalidate方式でキャッシュし、2回目以降の表示を高速化する。
// 各アプリは独立ビルドのため、既存の重複方針（NavigationOverlay等と同様）を
// 踏襲しこのコンポーネントをファイルコピーで複製する
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
      })
      .catch((error) => {
        console.error("Service Worker registration failed", error);
      });

    function checkForUpdate() {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {
          // オフライン等での更新チェック失敗は致命的ではないため無視する
        });
      }
    }

    document.addEventListener("visibilitychange", checkForUpdate);
    const intervalId = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", checkForUpdate);
      clearInterval(intervalId);
    };
  }, []);

  return null;
}
