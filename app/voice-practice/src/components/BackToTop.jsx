// dev-standardsのshared/ui/BackToTop.jsxからの個別コピー（examination#308・#316）。
// dev-standards側はBootstrap 5.3クラスへの統一が未対応（bamiyanapp/dev-standards#328）のため、
// Bootstrap移行済みのexaminationはsymlink共有をやめてこのファイルを個別管理する。
// ロジック自体はdev-standards側と同一。
//
// 独立ビルドの複数ページで構成されたサイトにおいて、各ページ（トップページ以外）に
// 他ページへ戻る手段を提供する。トップページのパスとラベルはpropsで受け取る
export default function BackToTop({ href = "/", label = "← トップに戻る" }) {
  return (
    <div className="container pt-3" style={{ maxWidth: "42rem" }}>
      <a href={href} className="link-secondary link-underline-opacity-0 link-underline-opacity-100-hover small">
        {label}
      </a>
    </div>
  );
}
