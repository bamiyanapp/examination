// examinationはCognito+Google認証（Lambda@Edge functions/checkAuth.js）で
// サイト全体がゲートされており、未認証で到達できるページが無い。Playwrightで
// Googleの対話的ログインを自動操作する代わりに、E2Eテスト専用のネイティブ
// Cognitoユーザー（examination#413）について事前に1回取得したrefresh_tokenを
// E2E_SECRETS_JSON（静的なGitHub Secret）経由で受け取り、checkAuth.jsが検証
// するのと同じ名前・属性のCookieとして注入する。id_tokenは注入せず、
// checkAuth.js自身が持つ「id_tokenが無い/無効でもrefresh_tokenが有効なら
// 裏側でid_tokenを再発行してリダイレクトする」既存の再認証フローに任せる
// （実際のリピーターユーザーの挙動により近く、id_tokenの短い有効期限切れを
// 気にする必要も無い。examination#404「Playwright E2E導入 詳細計画」参照）
export async function loginAsE2ETestUser(context) {
  const { hostname } = new URL(process.env.E2E_BASE_URL);
  await context.addCookies([
    {
      name: "refresh_token",
      value: process.env.E2E_REFRESH_TOKEN,
      domain: hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
