import { useEffect, useState } from "react";

// dev-standardsのshared/pwa/UpdateNotifier.jsxからの個別コピー（bamiyanapp/dev-standards#289、
// examination#298・#308・#315）。examination自体がBootstrap 5.3へ移行中（examination#308）で、
// 全9アプリの移行完了までは各アプリ個別にクラスを追従させる必要があるため、symlink共有を
// やめてこのファイルを個別管理する。全アプリの移行完了後、examination#318でdev-standardsの
// symlinkへ戻す。ロジック自体はdev-standards側と同一。
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
    <div className="position-fixed bottom-0 start-50 translate-middle-x mb-3" style={{ zIndex: 1050 }}>
      <div className="alert alert-info d-flex align-items-center gap-2 shadow mb-0">
        <span>新しいバージョンがあります</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
          更新する
        </button>
      </div>
    </div>
  );
}
