import { useEffect, useRef, useState } from "react";

// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合はここを更新する（app/voice-practice/src/pages/VoicePractice.jsxと同じAPI）
const FAMILY_PROFILE_API_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile";

async function issueVoiceToken() {
  const res = await fetch("/_voice-token", { method: "POST" });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `トークンの発行に失敗しました（${res.status}）`);
  }
  return data.token;
}

async function fetchProfile(token) {
  const res = await fetch(FAMILY_PROFILE_API_URL, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `プロフィールの取得に失敗しました（${res.status}）`);
  }
  return data;
}

async function saveProfile(token, profile) {
  const res = await fetch(FAMILY_PROFILE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(profile),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `プロフィールの保存に失敗しました（${res.status}）`);
  }
  return data;
}

// プロフィール編集画面（examination#125）。「志望先の特色」「その他前提情報」は
// 以前は面接練習（音声対話ページ・LINE bot）のたびに毎回自由入力していたが、
// 練習の度に入力し直すものではないため、この専用画面で編集・保存するように移設した。
// 面接練習側は保存された内容を参照するのみで、その場での編集はできない
export default function ProfileEdit() {
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [situation, setSituation] = useState("");
  const [schoolCharacteristics, setSchoolCharacteristics] = useState("");
  const [otherContext, setOtherContext] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const tokenRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await issueVoiceToken();
        tokenRef.current = token;
        const profile = await fetchProfile(token);
        if (!cancelled) {
          setSituation(profile.situation || "");
          setSchoolCharacteristics(profile.schoolCharacteristics || "");
          setOtherContext(profile.otherContext || "");
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

  async function handleSave(event) {
    event.preventDefault();
    setIsSaving(true);
    setSavedMessage("");
    setErrorMessage("");
    try {
      const token = tokenRef.current || (await issueVoiceToken());
      tokenRef.current = token;
      await saveProfile(token, { situation, schoolCharacteristics, otherContext });
      setSavedMessage("保存しました。");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">プロフィール編集</h1>
      <p className="mt-2 text-base-content/70">
        面接練習（音声対話ページ・LINE
        bot）で使う「シチュエーション」「志望先の特色」「その他前提情報」をここで編集・保存します。面接練習画面ではここで保存した内容を参照するのみで、その場での編集はできません。
      </p>

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
        <form onSubmit={handleSave} className="card card-border mt-6 bg-base-100">
          <div className="card-body gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">シチュエーション:</span>
              <input
                type="text"
                value={situation}
                onChange={(event) => setSituation(event.target.value)}
                placeholder="例: 小学校受験の面接、就職の面接、大学入試の面接"
                className="input w-full"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">志望先の特色（任意）:</span>
              <textarea
                value={schoolCharacteristics}
                onChange={(event) => setSchoolCharacteristics(event.target.value)}
                placeholder="例: 自由な校風で、生徒の主体性を重視する"
                rows={3}
                className="textarea w-full"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">その他前提情報（任意）:</span>
              <textarea
                value={otherContext}
                onChange={(event) => setOtherContext(event.target.value)}
                placeholder="例: 志望先の特色欄では書ききれない、家族構成や志望動機の背景など"
                rows={3}
                className="textarea w-full"
              />
            </label>
            <div className="card-actions items-center gap-3">
              <button type="submit" disabled={isSaving} className="btn btn-primary">
                保存する
              </button>
              {savedMessage && <span className="text-sm text-success">{savedMessage}</span>}
            </div>
            {errorMessage && (
              <div role="alert" className="alert alert-error">
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </form>
      )}
    </main>
  );
}
