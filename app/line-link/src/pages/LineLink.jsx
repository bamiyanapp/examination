import { useState } from "react";

// LINE botで面接練習・想定問答の登録を行うためのGoogleアカウント連携ページ（examination#78）。
// 旧: knowledge/settings/line-link.md に埋め込まれていた素の<script>実装をReactへ移植した。
// 呼び出し先API（/_link-line）自体は変更しない
export default function LineLink() {
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);

  async function issueCode() {
    setIsIssuing(true);
    setIsError(false);
    setCode(null);
    setCopied(false);
    setStatus("発行中...");
    try {
      const res = await fetch("/_link-line", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `発行に失敗しました（${res.status}）`);
      }
      setCode(data.code);
      setStatus("");
    } catch (error) {
      setIsError(true);
      setStatus(error.message);
    } finally {
      setIsIssuing(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // クリップボードAPIが使えない環境では、コードのテキスト選択・手動コピーで代替する
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">LINE連携</h1>
      <p className="mt-2 text-base-content/70">
        LINE
        botで面接練習・想定問答の登録を行うには、あなたのGoogleアカウントとLINEアカウントを連携する必要があります。
      </p>
      <div className="card card-border mt-6 bg-base-100">
        <div className="card-body">
          <ol className="flex list-inside list-decimal flex-col gap-1">
            <li>下のボタンでワンタイムコードを発行する</li>
            <li>発行されたコード（6桁の数字）を、LINE公式アカウントへそのままメッセージとして送信する</li>
            <li>連携完了のメッセージが届けば準備完了です</li>
          </ol>
          <p className="text-sm text-base-content/70">
            コードの有効期限は10分です。期限が切れた場合は、もう一度ボタンを押して発行し直してください。
          </p>
          <div className="card-actions">
            <button type="button" onClick={issueCode} disabled={isIssuing} className="btn btn-primary">
              コードを発行
            </button>
          </div>
          {code && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <code className="rounded-box bg-base-200 px-4 py-2 font-mono text-2xl tracking-widest">{code}</code>
                <button type="button" onClick={handleCopy} className="btn btn-sm">
                  {copied ? "コピーしました" : "コピー"}
                </button>
              </div>
              <p className="text-sm text-base-content/70">このコードをLINE botへ送信してください。10分間有効です。</p>
            </div>
          )}
          {status && (
            <div role="alert" className={`alert ${isError ? "alert-error" : "alert-info"}`}>
              <span>{status}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
