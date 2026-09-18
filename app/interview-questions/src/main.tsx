import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.jsx' // symlink

// フロントエンドの未捕捉例外をCloudWatch Logsへ記録する（examination#449、
// docs/client-error-reporting-pattern.md参照）。開発環境の制約（スマホオンリー）で
// ブラウザのコンソール出力を事後に確認できないため
const REPORT_CLIENT_ERROR_URL = 'https://0yqos9utye.execute-api.us-east-1.amazonaws.com/report-client-error'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary reportUrl={REPORT_CLIENT_ERROR_URL}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
