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
    <main>
      <h1>想定問答</h1>
      <p>本人・父・母の想定問答をまとめて掲載しています。対象者で絞り込むこともできます。</p>

      {status === "loading" && <p>読み込み中...</p>}
      {status === "error" && <p style={{ color: "crimson" }}>{errorMessage}</p>}

      {status === "loaded" && (
        <>
          <div className="filters" role="group" aria-label="対象者で絞り込む">
            {["すべて", ...TARGET_PERSONS].map((person) => (
              <button
                key={person}
                type="button"
                aria-pressed={filter === person}
                onClick={() => setFilter(person)}
              >
                {person}
              </button>
            ))}
          </div>

          <p>{visibleQuestions.length}件</p>

          <div className="question-list">
            {visibleQuestions.map((q) => (
              <article className="question-card" key={q.questionId}>
                <span className="target-person">{q.targetPerson || "対象者未設定"}</span>
                <h2>{q.question}</h2>
                <dl>
                  <dt>回答の要点</dt>
                  <dd>{q.answer}</dd>
                  {q.example && (
                    <>
                      <dt>盛り込む具体例</dt>
                      <dd>{q.example}</dd>
                    </>
                  )}
                  {q.impression && (
                    <>
                      <dt>面接官への印象</dt>
                      <dd>{q.impression}</dd>
                    </>
                  )}
                  {q.modelAnswer && (
                    <>
                      <dt>模範解答</dt>
                      <dd>{q.modelAnswer}</dd>
                    </>
                  )}
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
