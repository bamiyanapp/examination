import { defineConfig, devices } from "@playwright/test";

// examinationは専用のテスト用スタックを持たず本番環境に対して実行する
// （dev-standards docs/client-only-vite-spa-pattern.mdの「E2Eはモックを作らず
// 実際のAPIへ直結する」原則、examination#404「Playwright E2E導入 詳細計画」参照）。
// baseURLはCIの事前ジョブ（ci.yml）がexamination-site-prodスタックの実際の
// CloudFrontドメインをその場で取得しE2E_SECRETS_JSON経由で渡す
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
