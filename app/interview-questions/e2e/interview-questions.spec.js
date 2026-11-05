import { test, expect } from "./coverageFixture.js"; // symlink
import { loginAsE2ETestUser } from "./auth.js";
import { captureScreenshot } from "./screenshot.js";

test("認証済みで想定問答の一覧が表示される", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/education/interview-questions/");
  // アサーションが失敗しても、認証後に実際どのページへ到達したかを
  // Job Summary/PRコメント（reusable-ci.ymlのスクリーンショット報告機能）で
  // 確認できるよう、アサーションより先に撮影する
  console.log(`到達したURL: ${page.url()}`);
  await expect(page.getByRole("heading", { name: "想定問答" })).toBeVisible();
  await captureScreenshot(page, testInfo, "interview-questions-list", "想定問答（認証済み）");

  const fatherFilterButton = page.getByRole("group", { name: "対象者で絞り込む" }).getByRole("button", { name: "父" });
  await fatherFilterButton.click();
  await expect(fatherFilterButton).toHaveAttribute("aria-pressed", "true");
  await captureScreenshot(page, testInfo, "interview-questions-filtered", "想定問答（「父」で絞り込み後）");
});

test("質問の追加フォームを開き、必須項目未入力では保存できずキャンセルで閉じられる", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/education/interview-questions/");
  await expect(page.getByRole("heading", { name: "想定問答" })).toBeVisible();

  await page.getByRole("button", { name: "質問を追加" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "質問を追加" })).toBeVisible();
  await captureScreenshot(page, testInfo, "interview-questions-add-form", "想定問答（質問を追加フォームを開いた直後）");

  // 質問・回答の要点はrequiredのため、未入力のままではブラウザの標準バリデーションに
  // より送信がブロックされ、保存APIは呼ばれない（＝一覧件数が変化しない）ことを確認する
  const beforeCount = await page.getByText(/件$/).first().textContent();
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByRole("heading", { name: "質問を追加" })).toBeVisible();

  await dialog.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/件$/).first()).toHaveText(beforeCount ?? "");
});
