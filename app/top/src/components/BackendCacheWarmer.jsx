import { useEffect } from "react";

// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合は各ページのsrc/pages/*.jsxとあわせてここも更新する
const BACKEND_LIST_ENDPOINTS = [
  "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/interview-questions",
  "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/mock-interviews",
];

const WARMED_FLAG = "examination-backend-cache-warmed";

// examination#118（追加スコープ）: どのページを最初に開いても、バックエンドの
// 一覧取得API（想定問答・模擬面接記録）をバックグラウンドで先に取得しておき、
// Service Worker（app/top/public/sw.js）のキャッシュを温めておく。実際にその
// ページへ遷移した際はキャッシュから即座に表示できる。/_voice-tokenの発行には
// 1日あたりの上限がある（examination#69、20回/日）ため、通常の閲覧だけで上限を
// 消費しないよう、ブラウザセッションあたり1回だけ実行する
export default function BackendCacheWarmer() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    if (sessionStorage.getItem(WARMED_FLAG)) return;
    sessionStorage.setItem(WARMED_FLAG, "1");

    (async () => {
      try {
        const res = await fetch("/_voice-token", { method: "POST" });
        if (!res.ok) return;
        const { token } = await res.json();
        await Promise.all(
          BACKEND_LIST_ENDPOINTS.map((url) =>
            fetch(url, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
          )
        );
      } catch {
        // バックグラウンドでの事前取得のため、失敗しても他機能をブロックしない
      }
    })();
  }, []);

  return null;
}
