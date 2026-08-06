import { useEffect, useState } from "react";

// examination#122: Service Worker導入（examination#118）後、PWAとしてホーム画面に
// 追加した状態では新しいバージョンに切り替わったことに気づきにくく、キャッシュされた
// 古い画面が表示され続けているように見えてしまい、ホーム画面からの削除・再追加が
// 必要になっていた。ページ読み込み時点で既にService Workerの制御下にあった場合のみ
// （＝初回インストールではなく既存バージョンからの切り替わりの場合のみ）
// controllerchangeイベントを「更新」とみなし、再読み込みを促すバナーを表示する。
// 入力中のフォーム等を妨げないよう、自動的な強制リロードはしない
export default function UpdateNotifier() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);

    function handleControllerChange() {
      if (hadControllerAtLoad) {
        setUpdateAvailable(true);
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="toast toast-bottom toast-center z-50">
      <div className="alert alert-info">
        <span>新しいバージョンがあります</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
          更新する
        </button>
      </div>
    </div>
  );
}
