import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

// LINE公式アカウントのURL（examination#229）。変更した場合はここのみ更新すればよい
const LINE_BOT_URL = "https://line.me/R/ti/p/@206epxcr";

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
    <main className="container py-5" style={{ maxWidth: "42rem" }}>
      <h1 className="h3 fw-bold">LINE連携</h1>
      <p className="mt-2 text-muted">
        LINE
        botで面接練習・想定問答の登録を行うには、あなたのGoogleアカウントとLINEアカウントを連携する必要があります。
      </p>
      <div className="card mt-4">
        <div className="card-body">
          <h2 className="card-title h6">1. LINE公式アカウントを友だち追加する</h2>
          <p className="small text-muted">
            まだ友だち追加していない場合は、下のリンクを開くかQRコードを読み取って追加してください。追加済みの場合はこの手順は不要です。
          </p>
          <a
            href={LINE_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-success btn-sm"
            style={{ width: "fit-content" }}
          >
            LINE公式アカウントを開く
          </a>
          <div className="my-2 d-flex justify-content-center">
            <QRCodeSVG value={LINE_BOT_URL} size={160} />
          </div>
        </div>
      </div>
      <div className="card mt-4">
        <div className="card-body">
          <h2 className="card-title h6">2. ワンタイムコードを発行してLINEへ送信する</h2>
          <ol className="d-flex flex-column gap-1">
            <li>下のボタンでワンタイムコードを発行する</li>
            <li>発行されたコード（6桁の数字）を、LINE公式アカウントへそのままメッセージとして送信する</li>
            <li>連携完了のメッセージが届けば準備完了です</li>
          </ol>
          <p className="small text-muted">
            コードの有効期限は10分です。期限が切れた場合は、もう一度ボタンを押して発行し直してください。
          </p>
          <div>
            <button type="button" onClick={issueCode} disabled={isIssuing} className="btn btn-primary">
              コードを発行
            </button>
          </div>
          {code && (
            <div className="d-flex flex-column gap-2 mt-3">
              <div className="d-flex align-items-center gap-2">
                <code className="rounded bg-body-secondary px-3 py-2 fs-3" style={{ letterSpacing: "0.2em" }}>
                  {code}
                </code>
                <button type="button" onClick={handleCopy} className="btn btn-sm btn-secondary">
                  {copied ? "コピーしました" : "コピー"}
                </button>
              </div>
              <p className="small text-muted mb-0">このコードをLINE botへ送信してください。10分間有効です。</p>
            </div>
          )}
          {status && (
            <div role="alert" className={`alert mt-3 mb-0 ${isError ? "alert-danger" : "alert-info"}`}>
              {status}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
