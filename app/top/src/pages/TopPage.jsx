// 新トップページ（examination#82）。画面遷移の再設計として、MkDocs Materialの
// サイドバーナビゲーションに代わる、カテゴリ別のリンク一覧をReactで提供する。
// 段階移行中のため、既存ページ（React化済み・MkDocs双方）へのリンクをそのまま束ねる形とし、
// 各ページ自体の実装（React/Markdown）には手を入れない。/top/でのプレビュー確認の結果、
// サイトの正式なトップページ（/）として採用した。保育園・旅行・住まい・車・AI活用の各章は
// 不要と判断され、knowledge/配下のページごと削除した。家族プロフィールページ（唯一の
// 「家族」カテゴリ配下ページだった）もexamination#102で不要と判断され削除したため、
// カテゴリ自体を廃止した
const SECTIONS = [
  {
    title: "教育",
    links: [
      { label: "概要", href: "/education/" },
      { label: "想定問答", href: "/education/interview-questions/" },
      { label: "模擬面接記録", href: "/education/mock-interviews/" },
      { label: "音声で面接練習", href: "/education/voice-practice/" },
    ],
  },
  {
    title: "設定",
    links: [
      { label: "閲覧許可メールアドレス管理", href: "/settings/allowed-emails/" },
      { label: "LINE連携", href: "/settings/line-link/" },
    ],
  },
];

export default function TopPage() {
  return (
    <main>
      <h1>小学校受験対策</h1>
      <p>家族向けナレッジベースです。カテゴリからページを選んでください。</p>
      {SECTIONS.map((section) => (
        <div className="section" key={section.title}>
          <h2>{section.title}</h2>
          <ul>
            {section.links.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}
