// examinationはCognito+Google認証（Lambda@Edge functions/checkAuth.js）で
// サイト全体がゲートされており、未認証で到達できるページが無い。Playwrightで
// Googleの対話的ログインを自動操作する代わりに、CI側（ci.yml）がE2Eテスト専用の
// ネイティブCognitoユーザー（examination#413）についてAdminInitiateAuthで
// その場で発行したid_token・refresh_tokenをE2E_SECRETS_JSON経由で受け取り、
// checkAuth.jsが検証するのと同じ名前・属性のCookieとして注入する
// （examination#404「Playwright E2E導入 詳細計画」参照）
export async function loginAsE2ETestUser(context) {
  const { hostname } = new URL(process.env.E2E_BASE_URL);
  await context.addCookies([
    {
      name: "id_token",
      value: process.env.E2E_ID_TOKEN,
      domain: hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
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
