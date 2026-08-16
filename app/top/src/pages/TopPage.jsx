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
      { label: "プロフィール編集", href: "/settings/profile-edit/" },
    ],
  },
];

// デプロイ（cd.yml）は全アプリを同一コミットから一括ビルドするため、トップページの
// ビルド情報をサイト全体のバージョン表示として扱う（examination#131）。VITE_BUILD_VERSION
// はConventional Commitsからsemantic-releaseが算出したセマンティックバージョン
// （examination#137）。docs/chore等バージョンが上がらないコミットではデプロイの
// たびには変わらないため、実際に最新がデプロイされたかどうかの確認にはビルドSHA・
// 日時（VITE_BUILD_SHA/VITE_BUILD_TIME）をあわせて表示する。ビルド時にこれらが
// 未設定の場合（ローカル開発時等）はフォールバック表示にする
function formatBuildInfo() {
  const version = import.meta.env.VITE_BUILD_VERSION;
  const sha = import.meta.env.VITE_BUILD_SHA;
  const time = import.meta.env.VITE_BUILD_TIME;
  if (!version || !sha || !time) {
    return "開発版";
  }
  const formattedTime = new Date(time).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${version}（${sha}, ${formattedTime}更新）`;
}

export default function TopPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <img src="/favicon.png" alt="" className="mx-auto w-40" />
        <h1 className="text-3xl font-bold">小学校受験対策</h1>
        <p className="mt-2 text-base-content/70">家族向けナレッジベースです。カテゴリからページを選んでください。</p>
      </div>
      <div className="flex flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-3 text-lg font-semibold">{section.title}</h2>
            <ul className="flex flex-col gap-2">
              {section.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="card card-border bg-base-100 transition-colors hover:border-primary"
                  >
                    <div className="card-body flex-row items-center justify-between px-4 py-3">
                      <span>{link.label}</span>
                      <span className="text-base-content/40">→</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-10 text-center text-xs text-base-content/50">バージョン: {formatBuildInfo()}</p>
    </main>
  );
}
