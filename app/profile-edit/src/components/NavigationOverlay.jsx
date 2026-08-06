import { useEffect } from "react";

// examination#100: SPAクライアントサイドルーティングを導入しない全ページ遷移の
// 設計（examination#78）のため、リンククリックから実際の画面遷移までの間、
// 読み込み中であることが分かるオーバーレイを表示する。ホーム画面に追加した状態
// （examination#72）ではブラウザ標準の読み込みインジケータが非表示になりがちで、
// 遷移中は何も表示されず画面が固まったように見える問題に対応する
export default function NavigationOverlay() {
  useEffect(() => {
    function handleClick(event) {
      const link = event.target.closest("a");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || !href.startsWith("/") || link.target === "_blank") return;
      document.getElementById("nav-overlay")?.classList.add("visible");
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <div
      id="nav-overlay"
      className="nav-overlay hidden fixed inset-0 z-50 items-center justify-center bg-base-100/80"
      aria-hidden="true"
    >
      <span className="loading loading-spinner loading-lg text-primary" />
    </div>
  );
}
