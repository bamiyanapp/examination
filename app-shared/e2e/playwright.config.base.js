// app/配下のE2E導入アプリが共通で使うPlaywright設定の土台。examinationは
// 専用のテスト用スタックを持たず本番環境に対して実行する（dev-standards
// docs/client-only-vite-spa-pattern.mdの「E2Eはモックを作らず実際のAPIへ
// 直結する」原則、examination#404「Playwright E2E導入 詳細計画」参照）。
// baseURLはexamination-site-prodスタックの実際のCloudFrontドメイン（作成後
// 不変）を静的なGitHub Secret（E2E_SECRETS_JSON）経由で渡す。E2Eカバレッジ
// 収集（monocart-reporter、dev-standards docs/e2e-coverage-pattern.md、
// examination#450）の設定もここに含む
//
// defineConfig/devicesは各アプリ自身のnode_modulesから解決させる必要がある
// ため、このファイル自身ではrequire/importせず引数で受け取る
// （infra/infra-shared/eslint.config.base.jsと同じ理由。examination#447）。
// app/配下のアプリ間で内容がほぼ完全に共通のため、app-shared/e2e/から
// symlinkで共有する
export function buildPlaywrightConfig({ defineConfig, devices, reportName }) {
  return defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0,
    reporter: [
      ["html"],
      [
        "monocart-reporter",
        {
          name: reportName,
          outputFile: "./monocart-report/index.html",
          coverage: {
            outputDir: "./coverage",
            reports: [["json-summary"], ["console-summary"]],
            // 各アプリが実際に読み込むのは自身のビルド成果物（/assets/配下）のみ
            // （Googleアバター画像等の外部リソースはJS/CSSではないため対象外）
            entryFilter: (entry) => entry.url.includes("/assets/"),
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
}
