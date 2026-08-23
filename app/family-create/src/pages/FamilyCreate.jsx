import { useState } from "react";

// checkAuth.jsのcreateFamilyが返す文言と一致させる。既に所属済みという応答は、
// 失敗ではなく「反映待ちで表示だけがこのページのまま」という状態を示すサインとして
// 特別扱いする（examination#267）
const ALREADY_IN_FAMILY_MESSAGE = "既に家族に所属しています";

async function createFamily(name) {
  const res = await fetch("/_families", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
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
// サイトのトップページへ案内する
export default function FamilyCreate() {
  const [name, setName] = useState("");
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
      const family = await createFamily(name);
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
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">家族の新規作成</h1>
      <p className="mt-2 text-base-content/70">
        Googleアカウントでログイン済みで、まだどの家族にも所属していない方なら、家族名を指定して新しい家族を作成できます。作成したメールアドレスがその家族の最初のメンバーになります。
      </p>

      {createdFamily ? (
        <div role="alert" className="alert alert-success mt-6">
          <span>
            「{createdFamily.name}」を作成しました。<a href="/" className="link">トップページへ進む</a>
          </span>
        </div>
      ) : alreadyInFamily ? (
        <div role="alert" className="alert alert-info mt-6">
          <span>
            このアカウントは既に家族に参加済みです。反映まで少し時間がかかることがあるため、15秒ほど待ってから
            <a href="/" className="link">トップページへ進む</a>
            を試してください。
          </span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card card-border mt-6 bg-base-100">
          <div className="card-body gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">家族名:</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例: 調布の鈴木家"
                required
                className="input w-full"
              />
            </label>
            <div className="card-actions">
              <button type="submit" disabled={isSubmitting || !name.trim()} className="btn btn-primary">
                {isSubmitting ? "作成中..." : "作成する"}
              </button>
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
