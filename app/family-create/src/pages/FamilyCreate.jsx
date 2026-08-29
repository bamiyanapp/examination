import { useState } from "react";

// checkAuth.jsのcreateFamilyが返す文言と一致させる。既に所属済みという応答は、
// 失敗ではなく「反映待ちで表示だけがこのページのまま」という状態を示すサインとして
// 特別扱いする（examination#267）
const ALREADY_IN_FAMILY_MESSAGE = "既に家族に所属しています";

async function createFamily(situation) {
  const res = await fetch("/_families", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ situation }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `家族の作成に失敗しました（${res.status}）`);
  }
  return data;
}

// 家族の新規作成ページ（examination#44・#242・#258）。公開登録制のため、
// Googleアカウントでログインしていれば誰でも利用できる。既に何らかの家族に
// 所属している場合は/_families側で拒否される。作成に成功したら、そのまま
// サイトのトップページへ案内する。
//
// 家族名ではなくシチュエーション（例:「小学校受験の面接」）を入力させる
// （examination#305、家族名とシチュエーションの統合）。入力内容はトップページの
// 見出し・AI練習のプロンプトに使われ、後から/settings/profile-edit/でいつでも
// 変更できる
export default function FamilyCreate() {
  const [situation, setSituation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [createdFamily, setCreatedFamily] = useState(null);
  const [alreadyInFamily, setAlreadyInFamily] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    setAlreadyInFamily(false);
    try {
      const family = await createFamily(situation);
      setCreatedFamily(family);
    } catch (error) {
      // 許可判定はLambda@Edgeの実行環境ごとに最大15秒キャッシュされるため
      // （examination#267）、作成直後に他ページへ遷移してこのページへ戻された
      // 場合、既に成功しているにもかかわらずこのエラーになることがある。
      // 失敗と誤解させないよう、待機を促す案内として別枠で表示する
      if (error.message === ALREADY_IN_FAMILY_MESSAGE) {
        setAlreadyInFamily(true);
      } else {
        setErrorMessage(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="container py-5" style={{ maxWidth: "42rem" }}>
      <h1 className="h3 fw-bold">家族の新規作成</h1>
      <p className="mt-2 text-muted">
        Googleアカウントでログイン済みで、まだどの家族にも所属していない方なら、シチュエーション（例:
        「小学校受験の面接」）を指定して新しい家族を作成できます。作成したメールアドレスがその家族の最初のメンバーになります。入力したシチュエーションは、後から「設定
        → プロフィール編集」でいつでも変更できます。
      </p>

      {createdFamily ? (
        <div role="alert" className="alert alert-success mt-4">
          「{createdFamily.situation}」を作成しました。<a href="/" className="alert-link">トップページへ進む</a>
        </div>
      ) : alreadyInFamily ? (
        <div role="alert" className="alert alert-info mt-4">
          このアカウントは既に家族に参加済みです。反映まで少し時間がかかることがあるため、15秒ほど待ってから
          <a href="/" className="alert-link">トップページへ進む</a>
          を試してください。
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card mt-4">
          <div className="card-body d-flex flex-column gap-3">
            <div>
              <label className="form-label fw-medium">シチュエーション:</label>
              <input
                type="text"
                value={situation}
                onChange={(event) => setSituation(event.target.value)}
                placeholder="例: 小学校受験の面接"
                required
                className="form-control"
              />
            </div>
            <div>
              <button type="submit" disabled={isSubmitting || !situation.trim()} className="btn btn-primary">
                {isSubmitting ? "作成中..." : "作成する"}
              </button>
            </div>
            {errorMessage && (
              <div role="alert" className="alert alert-danger mb-0">
                {errorMessage}
              </div>
            )}
          </div>
        </form>
      )}
    </main>
  );
}
