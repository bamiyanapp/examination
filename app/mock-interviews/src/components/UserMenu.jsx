import { useEffect, useState } from "react";
import ShareButton from "./ShareButton.jsx";

// ログイン中のユーザー名・アイコン（Googleアカウントのプロフィール画像）を表示し、
// ログアウトへの導線を提供する（examination#150）。id_tokenクッキーはHttpOnlyで
// JSから読めないため、同一オリジンの/_meAPI（checkAuth.js）経由でユーザー情報を取得する。
// 各アプリは独立ビルドのため、既存の重複方針（NavigationOverlay等と同様）を
// 踏襲しこのコンポーネントをファイルコピーで複製する
//
// ページのURLをQRコードで共有する機能（examination#127）もこのメニューへ追加する。
// スマートフォンオンリーの利用環境（家族間の画面共有）では、既存のこの
// 右上ユーティリティメニューへ載せる方が、新規の重複コンポーネントを増やすより
// シンプルなため。QRコード共有部分自体はプロダクト固有の値を持たないため、
// 共有コンポーネント（ShareButton.jsx、dev-standards#163）に切り出している
//
// Bootstrap本体のJS（data-bs-toggleによるドロップダウン開閉）は導入していないため、
// 元のdaisyUI実装と同じくCSSの:focus-within（.user-menu:focus-within .user-menu-dropdown、
// index.css参照）だけで開閉を表現する。メニュー内容は常にDOMへ存在し、表示・非表示は
// CSSのみが担う（examination#310・#314）
export default function UserMenu() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/_me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setUser(data);
      })
      .catch(() => {
        // 取得失敗時はメニュー自体を表示しない（致命的ではないため無視する）
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  const displayName = user.name || user.email;

  return (
    <div className="user-menu position-fixed top-0 end-0 mt-2 me-2" style={{ zIndex: 1040 }}>
      <button
        type="button"
        className="btn btn-light btn-sm rounded-circle p-0 d-flex align-items-center justify-content-center border"
        style={{ width: "2.5rem", height: "2.5rem" }}
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={displayName}
            referrerPolicy="no-referrer"
            className="rounded-circle"
            style={{ width: "2rem", height: "2rem", objectFit: "cover" }}
          />
        ) : (
          <span
            className="rounded-circle bg-secondary text-white d-flex align-items-center justify-content-center"
            style={{ width: "2rem", height: "2rem" }}
          >
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>
      <ul className="user-menu-dropdown list-unstyled position-absolute end-0 mt-2 bg-body rounded shadow p-2" style={{ minWidth: "13rem" }}>
        <li className="px-2 py-1 fw-bold small text-truncate">{displayName}</li>
        <li>
          <ShareButton className="btn btn-sm btn-light w-100 text-start" />
        </li>
        <li>
          <a href="/_logout" className="d-block px-2 py-1 text-decoration-none">
            ログアウト
          </a>
        </li>
      </ul>
    </div>
  );
}
