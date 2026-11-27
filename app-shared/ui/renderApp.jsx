import renderSharedApp from "./SharedRenderApp.jsx"; // dev-standardsのshared/ui/renderApp.jsx（symlink）

// フロントエンドの未捕捉例外をCloudWatch Logsへ記録する（examination#449、
// dev-standards docs/client-error-reporting-pattern.md参照）。開発環境の制約
// （スマホオンリー）でブラウザのコンソール出力を事後に確認できないため。
// 9アプリ共通で同じbot-stackエンドポイントへ送るため、ここへ一度だけ定義する
const REPORT_CLIENT_ERROR_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/report-client-error";

// StrictMode・ErrorBoundaryで包んで描画する部分は、dev-standardsの共有版を使う
// （dev-standards#1380、examination#768）。ここはexamination固有の報告先URLだけを渡す。
// 共有版は兄弟ファイルをimportできないため、各アプリのcomponents/へSharedRenderApp.jsxの
// symlinkを置いている
export default function renderApp(App) {
  renderSharedApp(<App />, { reportUrl: REPORT_CLIENT_ERROR_URL });
}
