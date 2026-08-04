import { useEffect, useState } from "react";

// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合はここを更新する（app/voice-practice/src/pages/VoicePractice.jsxと同じAPI）
const INTERVIEW_QUESTIONS_API_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/interview-questions";

const TARGET_PERSONS = ["本人", "父", "母"];

async function issueVoiceToken() {
  const res = await fetch("/_voice-token", { method: "POST" });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `トークンの発行に失敗しました（${res.status}）`);
  }
  return data.token;
}

async function fetchQuestions(token) {
  const res = await fetch(INTERVIEW_QUESTIONS_API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `想定問答の取得に失敗しました（${res.status}）`);
  }
  return data.questions;
}

// 想定問答の閲覧画面（examination#77）。旧: 本人/父/母で分かれていた
// knowledge/education/interview-yosuke.md・interview-tomoyo.md・interview-ritsu.mdの
// 3ページをMkDocsで個別表示していたのをやめ、1画面に統合した。データはDynamoDB
// （examination-interview-questions）が唯一の正本で、対象者（本人/父/母）は
// targetPerson属性としてカテゴリとは別に持つ
export default function InterviewQuestions() {
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [questions, setQuestions] = useState([]);
  const [filter, setFilter] = useState("すべて");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await issueVoiceToken();
        const fetched = await fetchQuestions(token);
        if (!cancelled) {
          setQuestions(fetched);
          setStatus("loaded");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message);
          setStatus("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleQuestions = filter === "すべて" ? questions : questions.filter((q) => q.targetPerson === filter);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">想定問答</h1>
      <p className="mt-2 text-base-content/70">本人・父・母の想定問答をまとめて掲載しています。対象者で絞り込むこともできます。</p>

      {status === "loading" && (
        <div className="mt-6 flex items-center gap-2 text-base-content/70">
          <span className="loading loading-spinner loading-sm" />
          読み込み中...
        </div>
      )}
      {status === "error" && (
        <div role="alert" className="alert alert-error mt-6">
          <span>{errorMessage}</span>
        </div>
      )}

      {status === "loaded" && (
        <>
          <div className="join mt-6 flex-wrap" role="group" aria-label="対象者で絞り込む">
            {["すべて", ...TARGET_PERSONS].map((person) => (
              <button
                key={person}
                type="button"
                aria-pressed={filter === person}
                onClick={() => setFilter(person)}
                className={`btn join-item ${filter === person ? "btn-primary" : "btn-outline"}`}
              >
                {person}
              </button>
            ))}
          </div>

          <p className="mt-4 text-sm text-base-content/70">{visibleQuestions.length}件</p>

          <div className="mt-2 flex flex-col gap-4">
            {visibleQuestions.map((q) => (
              <article className="card card-border bg-base-100" key={q.questionId}>
                <div className="card-body">
                  <span className="badge badge-neutral self-start">{q.targetPerson || "対象者未設定"}</span>
                  <h2 className="card-title text-base">{q.question}</h2>
                  <dl className="flex flex-col gap-1">
                    <dt className="text-xs font-semibold text-base-content/60">回答の要点</dt>
                    <dd>{q.answer}</dd>
                    {q.example && (
                      <>
                        <dt className="mt-2 text-xs font-semibold text-base-content/60">盛り込む具体例</dt>
                        <dd>{q.example}</dd>
                      </>
                    )}
                    {q.impression && (
                      <>
                        <dt className="mt-2 text-xs font-semibold text-base-content/60">面接官への印象</dt>
                        <dd>{q.impression}</dd>
                      </>
                    )}
                    {q.modelAnswer && (
                      <>
                        <dt className="mt-2 text-xs font-semibold text-base-content/60">模範解答</dt>
                        <dd>{q.modelAnswer}</dd>
                      </>
                    )}
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
