// examination#100: 独立ビルドの各Reactページ（トップページ以外）には、他ページへ
// 戻る手段が一切無かった。トップページ（/、app/top/）が全ページへのリンク一覧を
// 持つため、そこへの導線を全ページへ配置する
export default function BackToTop() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-3">
      <a href="/" className="link link-hover text-sm text-base-content/70 hover:text-base-content">
        ← トップに戻る
      </a>
    </div>
  );
}
