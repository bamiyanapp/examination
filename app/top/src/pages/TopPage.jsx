// 新トップページ（examination#82）。画面遷移の再設計として、MkDocs Materialの
// サイドバーナビゲーションに代わる、カテゴリ別のリンク一覧をReactで提供する。
// 段階移行中のため、既存ページ（React化済み・MkDocs双方）へのリンクをそのまま束ねる形とし、
// 各ページ自体の実装（React/Markdown）には手を入れない。検証のためまずは/top/へ並行配置し、
// 旧トップページ（/、knowledge/index.md）は残したまま、不要と判断できたページから順次
// 整理していく
const SECTIONS = [
  {
    title: "教育",
    links: [
      { label: "概要", href: "/education/" },
      { label: "想定問答（保護者面接: よーすけ）", href: "/education/interview-yosuke/" },
      { label: "想定問答（保護者面接: ともよ）", href: "/education/interview-tomoyo/" },
      { label: "想定問答（本人面接: りつ）", href: "/education/interview-ritsu/" },
      { label: "模擬面接記録", href: "/education/mock-interviews/" },
      { label: "音声で面接練習", href: "/education/voice-practice/" },
    ],
  },
  { title: "家族", links: [{ label: "プロフィール", href: "/family/profile/" }] },
  { title: "保育園", links: [{ label: "保育園", href: "/childcare/" }] },
  { title: "旅行", links: [{ label: "旅行", href: "/travel/" }] },
  { title: "住まい", links: [{ label: "住まい", href: "/home/" }] },
  { title: "車", links: [{ label: "車", href: "/cars/" }] },
  { title: "AI活用", links: [{ label: "AI活用", href: "/ai/" }] },
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
