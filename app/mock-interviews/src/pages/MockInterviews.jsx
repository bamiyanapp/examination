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
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">模擬面接記録</h1>
      <p className="mt-2 text-base-content/70">面接練習セッションを終えるたびに、AIが振り返りをサマリーして記録します。</p>

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

      {status === "loaded" && summaries.length === 0 && (
        <p className="mt-6 text-base-content/70">まだ記録がありません。面接練習を行うと、ここに記録が追加されます。</p>
      )}

      {status === "loaded" && summaries.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          {summaries.map((s) => (
            <article className="card card-border bg-base-100" key={s.sessionId}>
              <div className="card-body">
                <span className="badge badge-neutral self-start">{s.role}</span>
                <h2 className="card-title text-base">{s.situation}</h2>
                <dl className="flex flex-col gap-1">
                  {s.schoolCharacteristics && (
                    <>
                      <dt className="text-xs font-semibold text-base-content/60">志望先の特色</dt>
                      <dd>{s.schoolCharacteristics}</dd>
                    </>
                  )}
                  <dt className="mt-2 text-xs font-semibold text-base-content/60">記録日時</dt>
                  <dd>{formatCreatedAt(s.createdAt)}</dd>
                </dl>
                <p className="mt-2 whitespace-pre-wrap">{s.summary}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
