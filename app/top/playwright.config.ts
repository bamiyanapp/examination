import { defineConfig, devices } from "@playwright/test";

// examinationは専用のテスト用スタックを持たず本番環境に対して実行する
// （dev-standards docs/client-only-vite-spa-pattern.mdの「E2Eはモックを作らず
// 実際のAPIへ直結する」原則、examination#404「Playwright E2E導入 詳細計画」参照）。
// baseURLはexamination-site-prodスタックの実際のCloudFrontドメイン（作成後不変）を
// 静的なGitHub Secret（E2E_SECRETS_JSON）経由で渡す
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["html"],
    // E2Eカバレッジ収集（dev-standards docs/e2e-coverage-pattern.md、examination#450）。
    // frontend-testと同じcoverage/coverage-summary.jsonをoutputDirへ出力し、
    // reusable-ci.ymlの「Show E2E coverage」ステップが読めるようにする
    [
      "monocart-reporter",
      {
        name: "examination(top) E2E Report",
        outputFile: "./monocart-report/index.html",
        coverage: {
          outputDir: "./coverage",
          reports: [["json-summary"], ["console-summary"]],
          // topが実際に読み込むのは自身のビルド成果物（/assets/配下）のみ
          // （Googleアバター画像等の外部リソースはJS/CSSではないため対象外）
          entryFilter: (entry: { url: string }) => entry.url.includes("/assets/"),
          sourceFilter: {
            "**/node_modules/**": false,
            "src/**": true,
          },
        },
      },
    ],
  ],
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
