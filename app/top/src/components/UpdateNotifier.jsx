import { useEffect, useState } from "react";

// dev-standardsのshared/pwa/UpdateNotifier.jsxからの個別コピー（bamiyanapp/dev-standards#289、
// examination#298）。dev-standards側は標準構成（Bootstrap 5.3）向けにクラス名を書き換える計画のため、
// Tailwind CSS v4 + daisyUI 5構成のexaminationはsymlink共有をやめてこのファイルを個別管理する
// （dev-standardsのdocs/service-worker-update-pattern.mdに記載の「調整が必要な場合はsymlink化を
// 見送り、コピーして個別管理する」方針）。ロジック自体はdev-standards側と同一。
//
// Service Worker導入後、PWAとしてホーム画面に追加した状態では新しいバージョンに
// 切り替わったことに気づきにくく、キャッシュされた古い画面が表示され続けている
// ように見えてしまい、ホーム画面からの削除・再追加が必要になりがちだった。
// ページ読み込み時点で既にService Workerの制御下にあった場合のみ（＝初回
// インストールではなく既存バージョンからの切り替わりの場合のみ）controllerchange
// イベントを「更新」とみなし、再読み込みを促すバナーを表示する。入力中のフォーム等を
// 妨げないよう、自動的な強制リロードはしない。詳細な経緯・キャッシュ戦略の全体像は
// dev-standardsのdocs/service-worker-update-pattern.mdを参照
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
