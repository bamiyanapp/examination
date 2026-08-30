import { useEffect, useState } from "react";
import resizeToFitContent from "../components/resizeTextareaToFitContent.js"; // symlink先: dev-standards#164

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

// 初期ローディング表示までの体感速度を改善するため、前回取得した一覧を
// sessionStorageへ保持し、マウント直後は真っ白/スピナーのみではなく
// 古いデータを薄く表示した上でバックグラウンドで再取得する（examination#167）
const QUESTIONS_CACHE_KEY = "examination-interview-questions-cache";

function loadCachedQuestions() {
  try {
    const raw = sessionStorage.getItem(QUESTIONS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCachedQuestions(questions) {
  try {
    sessionStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(questions));
  } catch {
    // sessionStorageが使えない場合は古いキャッシュ表示自体を諦めるだけでよい
  }
}

const EMPTY_FORM = {
  targetPerson: TARGET_PERSONS[0],
  question: "",
  answer: "",
  example: "",
  impression: "",
  modelAnswer: "",
};

// 想定問答の閲覧画面（examination#77）。旧: 本人/父/母で分かれていた
// knowledge/education/interview-yosuke.md・interview-tomoyo.md・interview-ritsu.mdの
// 3ページをMkDocsで個別表示していたのをやめ、1画面に統合した。データはDynamoDB
// （examination-interview-questions）が唯一の正本で、対象者（本人/父/母）は
// targetPerson属性としてカテゴリとは別に持つ
export default function InterviewQuestions() {
  const [cachedQuestions] = useState(loadCachedQuestions);
  const [status, setStatus] = useState(cachedQuestions ? "stale" : "loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [questions, setQuestions] = useState(cachedQuestions || []);
  const [filter, setFilter] = useState("すべて");

  // 質問の追加・編集フォーム（examination#165）。新規追加・編集を同じモーダルで扱い、
  // formMode/formQuestionIdで区別する
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("add");
  const [formQuestionId, setFormQuestionId] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [formStatus, setFormStatus] = useState("");
  const [formIsError, setFormIsError] = useState(false);
  const [formIsSaving, setFormIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await issueVoiceToken();
        const fetched = await fetchQuestions(token);
        if (!cancelled) {
          setQuestions(fetched);
          setStatus("loaded");
          setRefreshError("");
          saveCachedQuestions(fetched);
        }
      } catch (error) {
        if (!cancelled) {
          if (cachedQuestions) {
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
    // cachedQuestionsはマウント時のuseState初期化子で1度だけ読み込んだ値で、
    // その後setterを呼ばないため参照が変わらず、依存に加えても再実行は起きない
  }, [cachedQuestions]);

  const visibleQuestions = filter === "すべて" ? questions : questions.filter((q) => q.targetPerson === filter);

  function openAddForm() {
    setFormMode("add");
    setFormQuestionId(null);
    setFormValues(EMPTY_FORM);
    setFormStatus("");
    setFormIsError(false);
    setFormOpen(true);
  }

  function openEditForm(q) {
    setFormMode("edit");
    setFormQuestionId(q.questionId);
    setFormValues({
      targetPerson: q.targetPerson || TARGET_PERSONS[0],
      question: q.question,
      answer: q.answer,
      example: q.example,
      impression: q.impression,
      modelAnswer: q.modelAnswer,
    });
    setFormStatus("");
    setFormIsError(false);
    setFormOpen(true);
  }

  function updateFormField(field, value) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    setFormIsSaving(true);
    setFormIsError(false);
    setFormStatus("");
    try {
      const token = await issueVoiceToken();
      const res = await fetch(INTERVIEW_QUESTIONS_API_URL, {
        method: formMode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(formMode === "edit" ? { questionId: formQuestionId, ...formValues } : formValues),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `保存に失敗しました（${res.status}）`);
      }
      if (formMode === "edit") {
        setQuestions((prev) => prev.map((q) => (q.questionId === data.question.questionId ? data.question : q)));
      } else {
        setQuestions((prev) => [...prev, data.question]);
      }
      setFormOpen(false);
    } catch (error) {
      setFormIsError(true);
      setFormStatus(error.message);
    } finally {
      setFormIsSaving(false);
    }
  }

  return (
    <main className="container py-5" style={{ maxWidth: "42rem" }}>
      <h1 className="h3 fw-bold">想定問答</h1>
      <p className="mt-2 text-muted">本人・父・母の想定問答をまとめて掲載しています。対象者で絞り込むこともできます。</p>

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
            <div className="btn-group mt-4 flex-wrap" role="group" aria-label="対象者で絞り込む">
              {["すべて", ...TARGET_PERSONS].map((person) => (
                <button
                  key={person}
                  type="button"
                  aria-pressed={filter === person}
                  onClick={() => setFilter(person)}
                  className={`btn ${filter === person ? "btn-primary" : "btn-outline-primary"}`}
                >
                  {person}
                </button>
              ))}
            </div>

            <div className="mt-3 d-flex align-items-center justify-content-between">
              <p className="small text-muted mb-0">{visibleQuestions.length}件</p>
              <button type="button" onClick={openAddForm} className="btn btn-sm btn-primary">
                質問を追加
              </button>
            </div>

            <div className="mt-2 d-flex flex-column gap-3">
              {visibleQuestions.map((q) => (
                <article className="card" key={q.questionId}>
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between">
                      <span className="badge text-bg-secondary">{q.targetPerson || "対象者未設定"}</span>
                      <button type="button" onClick={() => openEditForm(q)} className="btn btn-sm">
                        編集
                      </button>
                    </div>
                    <h2 className="card-title h6 mt-2">{q.question}</h2>
                    <dl className="d-flex flex-column gap-1 mb-0">
                      <dt className="small fw-semibold text-muted">回答の要点</dt>
                      <dd>{q.answer}</dd>
                      {q.example && (
                        <>
                          <dt className="mt-2 small fw-semibold text-muted">盛り込む具体例</dt>
                          <dd>{q.example}</dd>
                        </>
                      )}
                      {q.impression && (
                        <>
                          <dt className="mt-2 small fw-semibold text-muted">面接官への印象</dt>
                          <dd>{q.impression}</dd>
                        </>
                      )}
                      {q.modelAnswer && (
                        <>
                          <dt className="mt-2 small fw-semibold text-muted">模範解答</dt>
                          <dd>{q.modelAnswer}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <>
          <div className="modal d-block show" tabIndex="-1" role="dialog">
            <div className="modal-dialog modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h3 className="modal-title h5">{formMode === "edit" ? "質問を編集" : "質問を追加"}</h3>
                  <button type="button" className="btn-close" aria-label="閉じる" onClick={() => setFormOpen(false)} />
                </div>
                <form onSubmit={handleFormSubmit}>
                  <div className="modal-body d-flex flex-column gap-3">
                    <label className="d-block">
                      <span className="form-label d-block">対象者:</span>
                      <select
                        value={formValues.targetPerson}
                        onChange={(event) => updateFormField("targetPerson", event.target.value)}
                        className="form-select"
                      >
                        {TARGET_PERSONS.map((person) => (
                          <option key={person} value={person}>
                            {person}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="d-block">
                      <span className="form-label d-block">質問:</span>
                      <textarea
                        required
                        value={formValues.question}
                        onChange={(event) => updateFormField("question", event.target.value)}
                        onInput={(event) => resizeToFitContent(event.target)}
                        ref={resizeToFitContent}
                        className="form-control"
                        style={{ resize: "none", overflow: "hidden" }}
                      />
                    </label>
                    <label className="d-block">
                      <span className="form-label d-block">回答の要点:</span>
                      <textarea
                        required
                        value={formValues.answer}
                        onChange={(event) => updateFormField("answer", event.target.value)}
                        onInput={(event) => resizeToFitContent(event.target)}
                        ref={resizeToFitContent}
                        className="form-control"
                        style={{ resize: "none", overflow: "hidden" }}
                      />
                    </label>
                    <label className="d-block">
                      <span className="form-label d-block">盛り込む具体例（任意）:</span>
                      <textarea
                        value={formValues.example}
                        onChange={(event) => updateFormField("example", event.target.value)}
                        onInput={(event) => resizeToFitContent(event.target)}
                        ref={resizeToFitContent}
                        className="form-control"
                        style={{ resize: "none", overflow: "hidden" }}
                      />
                    </label>
                    <label className="d-block">
                      <span className="form-label d-block">面接官への印象（任意）:</span>
                      <textarea
                        value={formValues.impression}
                        onChange={(event) => updateFormField("impression", event.target.value)}
                        onInput={(event) => resizeToFitContent(event.target)}
                        ref={resizeToFitContent}
                        className="form-control"
                        style={{ resize: "none", overflow: "hidden" }}
                      />
                    </label>
                    <label className="d-block">
                      <span className="form-label d-block">模範解答（任意）:</span>
                      <textarea
                        value={formValues.modelAnswer}
                        onChange={(event) => updateFormField("modelAnswer", event.target.value)}
                        onInput={(event) => resizeToFitContent(event.target)}
                        ref={resizeToFitContent}
                        className="form-control"
                        style={{ resize: "none", overflow: "hidden" }}
                      />
                    </label>
                    {formStatus && (
                      <div role="alert" className={`alert mb-0 ${formIsError ? "alert-danger" : "alert-info"}`}>
                        {formStatus}
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button type="button" onClick={() => setFormOpen(false)} disabled={formIsSaving} className="btn btn-sm btn-secondary">
                      キャンセル
                    </button>
                    <button type="submit" disabled={formIsSaving} className="btn btn-sm btn-primary">
                      保存
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" onClick={() => setFormOpen(false)} />
        </>
      )}
    </main>
  );
}
