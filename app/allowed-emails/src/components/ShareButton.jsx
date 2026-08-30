import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

// dev-standardsのshared/ui/ShareButton.jsxからの個別コピー（examination#308・#310）。
// dev-standards側はBootstrap 5.3クラスへの統一が未対応（bamiyanapp/dev-standards#328）のため、
// Bootstrap移行済みのexaminationはsymlink共有をやめてこのファイルを個別管理する。
// ロジック自体はdev-standards側と同一。Bootstrap本体のJS（モーダルのdata-bs-toggle等）は
// 導入していないため、開閉状態はReactのuseStateで自前管理する（examinationの他の
// Bootstrap移行コンポーネントと同様の方針）。
//
// 現在のページ（既定ではwindow.location.href）をQRコードで表示し、URLをワンタップ
// コピーできるボタン＋モーダル。スマートフォンオンリーの利用環境で、家族間・
// チーム間の画面共有にQRコードの読み取りが最も簡便であることを想定している。
//
// label: トリガーボタン・モーダル見出しの文言
// className: トリガーボタンへ追加するクラス名（メニュー項目等、埋め込み先の見た目に合わせる）
// getUrl: 共有するURLを返す関数（既定はwindow.location.href）
export default function ShareButton({ label = "このページを共有", className = "", getUrl = () => window.location.href }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  function openShare() {
    setCopied(false);
    setShareUrl(getUrl());
    setOpen(true);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // クリップボードAPIが使えない環境では、URLのテキスト選択・手動コピーで代替する
    }
  }

  return (
    <>
      <button type="button" onClick={openShare} className={className}>
        {label}
      </button>

      {open && (
        <>
          <div className="modal d-block show" tabIndex="-1" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h3 className="modal-title h5">{label}</h3>
                  <button type="button" className="btn-close" aria-label="閉じる" onClick={() => setOpen(false)} />
                </div>
                <div className="modal-body">
                  <div className="d-flex justify-content-center mb-3">
                    <QRCodeSVG value={shareUrl} size={200} />
                  </div>
                  <p className="bg-body-secondary rounded p-2 small text-break user-select-all mb-0">{shareUrl}</p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={handleCopy}>
                    {copied ? "コピーしました" : "URLをコピー"}
                  </button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(false)}>
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" onClick={() => setOpen(false)} />
        </>
      )}
    </>
  );
}
