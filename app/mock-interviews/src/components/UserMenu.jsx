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
    <div className="dropdown dropdown-end fixed top-2 right-2 z-40">
      <div tabIndex={0} role="button" className="btn btn-ghost btn-circle avatar">
        {user.picture ? (
          <div className="w-8 rounded-full">
            <img src={user.picture} alt={displayName} referrerPolicy="no-referrer" />
          </div>
        ) : (
          <div className="bg-neutral text-neutral-content flex w-8 items-center justify-center rounded-full text-sm">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <ul className="menu dropdown-content menu-sm z-40 mt-3 w-52 rounded-box bg-base-100 p-2 shadow">
        <li className="menu-title">
          <span>{displayName}</span>
        </li>
        <li>
          <ShareButton />
        </li>
        <li>
          <a href="/_logout">ログアウト</a>
        </li>
      </ul>
    </div>
  );
}
