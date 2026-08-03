import { useEffect } from "react";

// examination#105: Speculation Rules API（Chrome）で他ページのHTML/JS/CSSを
// バックグラウンドで先読み（prefetch）し、リンククリック時の遷移を高速化する。
// 音声で面接練習ページ（examination#73、gzip約12MB超のONNXモデルを含む）は
// モバイル通信量への影響が大きいため、意図的に先読み対象から除外している。
// prerenderはページ側のuseEffectでのデータ取得・トークン発行が意図せず
// 先走って実行される副作用があるため、v1ではprefetchのみに留める
const PREFETCH_URLS = [
  "/",
  "/education/",
  "/education/interview-questions/",
  "/education/mock-interviews/",
  "/family/profile/",
  "/settings/allowed-emails/",
  "/settings/line-link/",
];

export default function SpeculationRules() {
  useEffect(() => {
    if (!window.HTMLScriptElement?.supports?.("speculationrules")) return;

    // データセーバー有効時・低速回線時は通信量を考慮し先読みしない
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return;
    if (connection?.effectiveType && ["slow-2g", "2g"].includes(connection.effectiveType)) return;

    const urls = PREFETCH_URLS.filter((url) => url !== window.location.pathname);
    if (urls.length === 0) return;

    const script = document.createElement("script");
    script.type = "speculationrules";
    script.textContent = JSON.stringify({ prefetch: [{ source: "list", urls }] });
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return null;
}
