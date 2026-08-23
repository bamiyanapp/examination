import { useCallback, useEffect, useState } from "react";

// 閲覧許可メールアドレスの一覧・追加・削除ページ（examination#78）。
// 旧: knowledge/settings/allowed-emails.md に埋め込まれていた素の<script>実装をReactへ移植した。
// 呼び出し先API（/_admin/emails）自体は変更しない
export default function AllowedEmails() {
  const [emails, setEmails] = useState([]);
  const [invites, setInvites] = useState([]);
  const [status, setStatus] = useState("読み込み中...");
  const [isError, setIsError] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  const load = useCallback(async () => {
    setIsError(false);
    setStatus("読み込み中...");
    try {
      const res = await fetch("/_admin/emails");
      if (!res.ok) {
        throw new Error(`読み込みに失敗しました（${res.status}）`);
      }
      const data = await res.json();
      setEmails(data.emails || []);
      setInvites(data.invites || []);
      setStatus("");
    } catch (error) {
      setIsError(true);
      setStatus(error.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function mutate(action, email) {
    setIsError(false);
    setStatus("処理中...");
    try {
      const res = await fetch("/_admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `処理に失敗しました（${res.status}）`);
      }
      setEmails(data.emails || []);
      setInvites(data.invites || []);
      setStatus("");
    } catch (error) {
      setIsError(true);
      setStatus(error.message);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    mutate("add", email);
    setNewEmail("");
  }

  function handleInviteSubmit(event) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    mutate("invite-family-creator", email);
    setInviteEmail("");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">閲覧許可メールアドレスの管理</h1>
      <p className="mt-2 text-base-content/70">
        このサイトを閲覧できるGoogleアカウントのメールアドレスを一覧・追加・削除できます。ログイン中のアカウントがこの一覧に含まれている場合のみ操作できます（含まれていない場合はこのページ自体が表示できません）。
      </p>
      <ul className="mt-2 list-inside list-disc text-sm text-base-content/70">
        <li>自分自身のメールアドレスは削除できません（誤って全員が閲覧できなくなることを防ぐため）</li>
        <li>一覧に残り1件しかない場合、それは削除できません</li>
        <li>追加・削除は最大60秒ほどで全世界のアクセス地点に反映されます（すぐに反映されないことがあります）</li>
      </ul>
      {isError && status && (
        <div role="alert" className="alert alert-error mt-4">
          <span>{status}</span>
        </div>
      )}
      {!isError && status && (
        <div className="mt-4 flex items-center gap-2 text-base-content/70">
          <span className="loading loading-spinner loading-sm" />
          {status}
        </div>
      )}
      <ul className="list mt-4 rounded-box bg-base-100 shadow-sm">
        {emails.map((item) => (
          <li key={item.email} className="list-row items-center">
            <div className="flex-1">
              {item.email}（追加者: {item.addedBy || "-"}）
            </div>
            <button type="button" onClick={() => mutate("remove", item.email)} className="btn btn-sm btn-outline btn-error">
              削除
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="join mt-6 w-full">
        <input
          type="email"
          placeholder="追加するメールアドレス"
          required
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          className="input join-item flex-1"
        />
        <button type="submit" className="btn btn-primary join-item">
          追加
        </button>
      </form>

      <h2 className="mt-10 text-xl font-bold">家族の新規作成を招待</h2>
      <p className="mt-2 text-base-content/70">
        新しい家族（自分の家族とは別のデータ空間）を作りたい相手のメールアドレスを招待できます（
        <a href="https://github.com/bamiyanapp/examination/issues/44" className="link">
          複数家族対応
        </a>
        ）。招待されたメールアドレスでログインすると、「/family-create/」で家族名を指定して新規作成できます。招待は一度作成に使われると自動的に消費されます。
      </p>
      <ul className="list mt-4 rounded-box bg-base-100 shadow-sm">
        {invites.map((item) => (
          <li key={item.email} className="list-row items-center">
            <div className="flex-1">
              {item.email}（招待者: {item.invitedBy || "-"}）
            </div>
            <button
              type="button"
              onClick={() => mutate("revoke-invite", item.email)}
              className="btn btn-sm btn-outline btn-error"
            >
              取り消す
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={handleInviteSubmit} className="join mt-4 w-full">
        <input
          type="email"
          placeholder="招待するメールアドレス"
          required
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          className="input join-item flex-1"
        />
        <button type="submit" className="btn btn-primary join-item">
          招待する
        </button>
      </form>
    </main>
  );
}
