import { useEffect, useState } from "react";

// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合はここを更新する（app/interview-questions/src/pages/InterviewQuestions.jsxと同じAPI）
const MOCK_INTERVIEWS_API_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/mock-interviews";

async function issueVoiceToken() {
  const res = await fetch("/_voice-token", { method: "POST" });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `トークンの発行に失敗しました（${res.status}）`);
  }
  return data.token;
}

async function fetchSummaries(token) {
  const res = await fetch(MOCK_INTERVIEWS_API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `模擬面接記録の取得に失敗しました（${res.status}）`);
  }
  return data.summaries;
}

function formatCreatedAt(createdAt) {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

// 模擬面接記録の閲覧画面（examination#103）。旧: knowledge/education/mock-interviews.mdへ
// 手書きしていた記録をMkDocsで表示していたのをやめ、DynamoDB（examination-mock-interviews）を
// 正本とする画面へ置き換えた。LINE/音声練習の終了時にAIが自動生成したサマリーが蓄積される
// （examination#93）
export default function MockInterviews() {
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [summaries, setSummaries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await issueVoiceToken();
        const fetched = await fetchSummaries(token);
        if (!cancelled) {
          setSummaries(fetched);
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

  return (
    <main>
      <h1>模擬面接記録</h1>
      <p>面接練習セッションを終えるたびに、AIが振り返りをサマリーして記録します。</p>

      {status === "loading" && <p>読み込み中...</p>}
      {status === "error" && <p style={{ color: "crimson" }}>{errorMessage}</p>}

      {status === "loaded" && summaries.length === 0 && <p>まだ記録がありません。面接練習を行うと、ここに記録が追加されます。</p>}

      {status === "loaded" && summaries.length > 0 && (
        <div className="question-list">
          {summaries.map((s) => (
            <article className="question-card" key={s.sessionId}>
              <span className="target-person">{s.role}</span>
              <h2>{s.situation}</h2>
              <dl>
                {s.schoolCharacteristics && (
                  <>
                    <dt>志望先の特色</dt>
                    <dd>{s.schoolCharacteristics}</dd>
                  </>
                )}
                <dt>記録日時</dt>
                <dd>{formatCreatedAt(s.createdAt)}</dd>
              </dl>
              <p className="summary-text">{s.summary}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
