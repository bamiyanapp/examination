import { test, expect } from "./coverageFixture.js"; // symlink
import { loginAsE2ETestUser } from "./auth.js";
import { captureScreenshot } from "./screenshot.js";

test("認証済みで家族の新規作成ができる", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);

  // examination#413の共有E2Eテストユーザーは既にテスト家族へ所属済み（他の全E2E
  // テストが依存する共有フィクスチャのため、このテストのためだけに所属状態を
  // 変更する訳にはいかない）。checkAuth.js側に用意したテスト専用経路
  // （examination#419）を有効にするヘッダーをここで注入する。実際の呼び出し元
  // メールアドレスではなく使い捨ての合成メールアドレスを「作成した家族の唯一の
  // メンバー」として扱い、作成直後にサーバー側でその場で削除するため、共有
  // フィクスチャの所属状態には一切影響を与えない（詳細はcheckAuth.jsの
  // createFamily・handleFamiliesApiのコメント参照）
  await page.route("**/_families", (route) =>
    route.continue({ headers: { ...route.request().headers(), "x-e2e-test": "true" } })
  );

  await page.goto("/family-create/");
  // アサーションが失敗しても、認証後に実際どのページへ到達したかを
  // Job Summary/PRコメント（reusable-ci.ymlのスクリーンショット報告機能）で
  // 確認できるよう、アサーションより先に撮影する
  console.log(`到達したURL: ${page.url()}`);
  await expect(page.getByRole("heading", { name: "家族の新規作成" })).toBeVisible();
  await captureScreenshot(page, testInfo, "family-create-form", "家族の新規作成（認証済み）");

  await page.getByPlaceholder("例: 小学校受験の面接").fill("E2Eテスト用シチュエーション");
  await page.getByRole("button", { name: "作成する" }).click();

  await expect(page.getByRole("alert")).toContainText("を作成しました");
  await captureScreenshot(page, testInfo, "family-create-success", "家族の新規作成（作成成功後）");
});
