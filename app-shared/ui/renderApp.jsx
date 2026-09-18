import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./ErrorBoundary.jsx";

// フロントエンドの未捕捉例外をCloudWatch Logsへ記録する（examination#449、
// dev-standards docs/client-error-reporting-pattern.md参照）。開発環境の制約
// （スマホオンリー）でブラウザのコンソール出力を事後に確認できないため。
// 9アプリ共通で同じbot-stackエンドポイントへ送るため、ここへ一度だけ定義する
const REPORT_CLIENT_ERROR_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/report-client-error";

// 各main.tsxが個別にStrictMode・ErrorBoundaryのラップを書くと、9アプリ全て
// ほぼ同一内容のためjscpdの重複検知に引っかかる（examination#449、duplication-check
// 実測7.22%が閾値5%を超過）。共通ロジックをここへ切り出し、main.tsx側は
// このrenderAppを呼ぶだけにする
export default function renderApp(App) {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <ErrorBoundary reportUrl={REPORT_CLIENT_ERROR_URL}>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
