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

// 初期ローディング表示までの体感速度を改善するため、前回取得した一覧を
// sessionStorageへ保持し、マウント直後は真っ白/スピナーのみではなく
// 古いデータを薄く表示した上でバックグラウンドで再取得する（examination#167）
const SUMMARIES_CACHE_KEY = "examination-mock-interviews-cache";

function loadCachedSummaries() {
  try {
    const raw = sessionStorage.getItem(SUMMARIES_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCachedSummaries(summaries) {
  try {
    sessionStorage.setItem(SUMMARIES_CACHE_KEY, JSON.stringify(summaries));
  } catch {
    // sessionStorageが使えない場合は古いキャッシュ表示自体を諦めるだけでよい
  }
}

// 模擬面接記録の閲覧画面（examination#103）。旧: knowledge/education/mock-interviews.mdへ
// 手書きしていた記録をMkDocsで表示していたのをやめ、DynamoDB（examination-mock-interviews）を
// 正本とする画面へ置き換えた。LINE/音声練習の終了時にAIが自動生成したサマリーが蓄積される
// （examination#93）
export default function MockInterviews() {
  const [cachedSummaries] = useState(loadCachedSummaries);
  const [status, setStatus] = useState(cachedSummaries ? "stale" : "loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [summaries, setSummaries] = useState(cachedSummaries || []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await issueVoiceToken();
        const fetched = await fetchSummaries(token);
        if (!cancelled) {
          setSummaries(fetched);
          setStatus("loaded");
          setRefreshError("");
          saveCachedSummaries(fetched);
        }
      } catch (error) {
        if (!cancelled) {
          if (cachedSummaries) {
            // 古いキャッシュを表示したままにし、再取得に失敗したことのみ通知する
            setRefreshError(error.message);
            setStatus("loaded");
          } else {
            setErrorMessage(error.message);
            setStatus("error");
          }
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // cachedSummariesはマウント時のuseState初期化子で1度だけ読み込んだ値で、
    // その後setterを呼ばないため参照が変わらず、依存に加えても再実行は起きない
  }, [cachedSummaries]);

  return (
    <main className="container py-5" style={{ maxWidth: "42rem" }}>
      <h1 className="h3 fw-bold">模擬面接記録</h1>
      <p className="mt-2 text-muted">面接練習セッションを終えるたびに、AIが振り返りをサマリーして記録します。</p>

      {status === "loading" && (
        <div className="mt-4 d-flex align-items-center gap-2 text-muted">
          <span className="spinner-border spinner-border-sm" role="status" />
          読み込み中...
        </div>
      )}
      {status === "error" && (
        <div role="alert" className="alert alert-danger mt-4">
          {errorMessage}
        </div>
      )}

      {(status === "stale" || status === "loaded") && (
        <>
          {status === "stale" && (
            <div className="mt-3 d-flex align-items-center gap-2 small text-muted">
              <span className="spinner-border spinner-border-sm" role="status" />
              最新の情報を確認しています...
            </div>
          )}
          {refreshError && (
            <div role="alert" className="alert alert-warning mt-3">
              最新の情報を取得できませんでした: {refreshError}
            </div>
          )}
          <div className={status === "stale" ? "opacity-50" : ""} style={{ transition: "opacity 0.2s" }}>
            {summaries.length === 0 && (
              <p className="mt-4 text-muted">まだ記録がありません。面接練習を行うと、ここに記録が追加されます。</p>
            )}

            {summaries.length > 0 && (
              <div className="mt-4 d-flex flex-column gap-3">
                {summaries.map((s) => (
                  <article className="card" key={s.sessionId}>
                    <div className="card-body">
                      <span className="badge text-bg-secondary align-self-start">{s.role}</span>
                      <h2 className="card-title h6 mt-2">{s.situation}</h2>
                      <dl className="d-flex flex-column gap-1 mb-0">
                        {s.schoolCharacteristics && (
                          <>
                            <dt className="small fw-semibold text-muted">志望先の特色</dt>
                            <dd>{s.schoolCharacteristics}</dd>
                          </>
                        )}
                        <dt className="mt-2 small fw-semibold text-muted">記録日時</dt>
                        <dd>{formatCreatedAt(s.createdAt)}</dd>
                      </dl>
                      <p className="mt-2 mb-0" style={{ whiteSpace: "pre-wrap" }}>{s.summary}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
