const PAGE_LINKS = [
  { label: "想定問答", href: "/education/interview-questions/" },
  { label: "模擬面接記録", href: "/education/mock-interviews/" },
  { label: "音声で面接練習", href: "/education/voice-practice/" },
];

const WORKFLOW_STEPS = [
  "想定問題と回答案を用意する",
  "想定問題をもとに模擬面接を実施する",
  "実施結果を模擬面接記録に残す（気づき・改善点）",
  "記録をもとに想定問答の回答案を更新する",
  "2〜4を本番まで繰り返す",
];

const MOCK_INTERVIEW_STEPS = [
  "面接官役として1問ずつ出題する（一度に複数問まとめて出題しない）",
  "回答を受けたら、その場で「こうするとより良い」という模範解答・改善ポイントを1問ごとに示す",
  "数問終えたところで、模擬面接記録のフォーマット（よかった点・改善が必要な点・次回までのアクション）で総合フィードバックをまとめる",
  "記録を残す場合は対応するIssueを起票してから追記する（Issue駆動の原則）",
];

// 教育セクションの概要ページ（examination#92）。旧knowledge/education/index.mdの
// React化。鈴木家固有の情報（家族名入りの「今後の準備」チェックリスト・特定の実施日・
// 家族プロフィールへのリンク等）は排除し、どの家族・どの受験にも通用する汎用的な
// 方法論のみを残した。未完了だった具体的な内容更新タスクはexamination#95へ移した
export default function EducationOverview() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">教育: 受験の面接対策</h1>
      <p className="mt-2 text-base-content/70">
        小学校受験の面接対策を中心に、想定問答・模擬面接記録を管理しています。音声対話・LINE
        botでは、小学校受験に限らずシチュエーションを自由入力できる汎用的な面接練習にも対応しています。主に以下の2つを管理します。
      </p>
      <ul className="mt-2 list-inside list-disc text-base-content/70">
        <li>面接で聞かれうる想定問題とその回答案</li>
        <li>模擬面接を実施した記録と、そこから得られた気づきによる想定問題のアップデート</li>
      </ul>
      <p className="mt-2 text-base-content/70">
        想定問題は一度作って終わりではなく、模擬面接を重ねるたびに内容を見直し、改善していくことを前提としています。
      </p>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">ページ一覧</h2>
        <ul className="flex flex-col gap-2">
          {PAGE_LINKS.map((link) => (
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
      </div>

      <div className="card card-border mt-8 bg-base-100">
        <div className="card-body">
          <h2 className="card-title text-base">運用フロー</h2>
          <ol className="list-inside list-decimal">
            {WORKFLOW_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="card card-border mt-6 bg-base-100">
        <div className="card-body">
          <h2 className="card-title text-base">模擬面接の進め方（Claude Codeとの実施時）</h2>
          <ul className="list-inside list-disc">
            {MOCK_INTERVIEW_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  )
}
