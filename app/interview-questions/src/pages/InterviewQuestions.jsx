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

const EMPTY_FORM = {
  targetPerson: TARGET_PERSONS[0],
  question: "",
  answer: "",
  example: "",
  impression: "",
  modelAnswer: "",
};

// 追加・編集フォームのテキストエリアを、入力内容に応じて高さ可変にする
// （examination#165）。一度高さをautoへ戻してからscrollHeightを測ることで、
// 入力により行数が減った場合にも正しく縮む。編集フォームを開いた直後
// （既存の複数行の内容が最初から入っている場合）にも正しい高さになるよう、
// refコールバックとしても同じ関数を使う
function resizeToFitContent(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
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

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-base-content/70">{visibleQuestions.length}件</p>
            <button type="button" onClick={openAddForm} className="btn btn-sm btn-primary">
              質問を追加
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-4">
            {visibleQuestions.map((q) => (
              <article className="card card-border bg-base-100" key={q.questionId}>
                <div className="card-body">
                  <div className="flex items-center justify-between">
                    <span className="badge badge-neutral">{q.targetPerson || "対象者未設定"}</span>
                    <button type="button" onClick={() => openEditForm(q)} className="btn btn-xs">
                      編集
                    </button>
                  </div>
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

      {formOpen && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="text-lg font-bold">{formMode === "edit" ? "質問を編集" : "質問を追加"}</h3>
            <form onSubmit={handleFormSubmit} className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">対象者:</span>
                <select
                  value={formValues.targetPerson}
                  onChange={(event) => updateFormField("targetPerson", event.target.value)}
                  className="select"
                >
                  {TARGET_PERSONS.map((person) => (
                    <option key={person} value={person}>
                      {person}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">質問:</span>
                <textarea
                  required
                  value={formValues.question}
                  onChange={(event) => updateFormField("question", event.target.value)}
                  onInput={(event) => resizeToFitContent(event.target)}
                  ref={resizeToFitContent}
                  className="textarea resize-none overflow-hidden"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">回答の要点:</span>
                <textarea
                  required
                  value={formValues.answer}
                  onChange={(event) => updateFormField("answer", event.target.value)}
                  onInput={(event) => resizeToFitContent(event.target)}
                  ref={resizeToFitContent}
                  className="textarea resize-none overflow-hidden"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">盛り込む具体例（任意）:</span>
                <textarea
                  value={formValues.example}
                  onChange={(event) => updateFormField("example", event.target.value)}
                  onInput={(event) => resizeToFitContent(event.target)}
                  ref={resizeToFitContent}
                  className="textarea resize-none overflow-hidden"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">面接官への印象（任意）:</span>
                <textarea
                  value={formValues.impression}
                  onChange={(event) => updateFormField("impression", event.target.value)}
                  onInput={(event) => resizeToFitContent(event.target)}
                  ref={resizeToFitContent}
                  className="textarea resize-none overflow-hidden"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">模範解答（任意）:</span>
                <textarea
                  value={formValues.modelAnswer}
                  onChange={(event) => updateFormField("modelAnswer", event.target.value)}
                  onInput={(event) => resizeToFitContent(event.target)}
                  ref={resizeToFitContent}
                  className="textarea resize-none overflow-hidden"
                />
              </label>
              {formStatus && (
                <div role="alert" className={`alert ${formIsError ? "alert-error" : "alert-info"}`}>
                  <span>{formStatus}</span>
                </div>
              )}
              <div className="modal-action">
                <button type="button" onClick={() => setFormOpen(false)} disabled={formIsSaving} className="btn btn-sm">
                  キャンセル
                </button>
                <button type="submit" disabled={formIsSaving} className="btn btn-sm btn-primary">
                  保存
                </button>
              </div>
            </form>
          </div>
          <button type="button" className="modal-backdrop" aria-label="閉じる" onClick={() => setFormOpen(false)} />
        </div>
      )}
    </main>
  );
}
