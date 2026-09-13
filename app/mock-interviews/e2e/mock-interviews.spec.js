import { test, expect } from "./coverageFixture.js"; // symlink
import { loginAsE2ETestUser } from "./auth.js";
import { captureScreenshot } from "./screenshot.js";

test("認証済みで模擬面接記録の一覧が表示される", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/education/mock-interviews/");
  // アサーションが失敗しても、認証後に実際どのページへ到達したかを
  // Job Summary/PRコメント（reusable-ci.ymlのスクリーンショット報告機能）で
  // 確認できるよう、アサーションより先に撮影する
  console.log(`到達したURL: ${page.url()}`);
  await expect(page.getByRole("heading", { name: "模擬面接記録" })).toBeVisible();
  await captureScreenshot(page, testInfo, "mock-interviews-list", "模擬面接記録（認証済み）");
});
