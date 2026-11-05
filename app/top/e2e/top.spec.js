import { test, expect } from "./coverageFixture.js"; // symlink
import { loginAsE2ETestUser } from "./auth.js";
import { captureScreenshot } from "./screenshot.js";

test("認証済みでトップページの主要セクションが表示される", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/");
  // アサーションが失敗しても、認証後に実際どのページへ到達したかを
  // Job Summary/PRコメント（reusable-ci.ymlのスクリーンショット報告機能）で
  // 確認できるよう、アサーションより先に撮影する
  console.log(`到達したURL: ${page.url()}`);
  await captureScreenshot(page, testInfo, "top-page", "トップページ（認証済み）");
  await expect(page.getByText("教育")).toBeVisible();
  await expect(page.getByText("設定")).toBeVisible();
});

test("ユーザーメニューからページ共有モーダルを開ける", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/");
  await expect(page.getByText("教育")).toBeVisible();

  // iOS Safariのタップ時フォーカス挙動対応（examination#349）により、
  // ボタンをクリックするとCSSの:focus-withinでドロップダウンが開く
  const userMenuButton = page.locator(".user-menu button").first();
  await userMenuButton.click();
  await expect(page.getByRole("button", { name: "このページを共有" })).toBeVisible();
  await captureScreenshot(page, testInfo, "top-page-user-menu", "トップページ（ユーザーメニューを開いた直後）");

  await page.getByRole("button", { name: "このページを共有" }).click();
  await expect(page.getByRole("dialog").getByText("このページを共有")).toBeVisible();
  await expect(page.getByText(/\/$/)).toBeVisible();

  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("「想定問答」リンクから想定問答ページへ遷移できる", async ({ page, context }) => {
  await loginAsE2ETestUser(context);
  await page.goto("/");
  await expect(page.getByText("教育")).toBeVisible();

  await page.getByRole("link", { name: "想定問答" }).click();
  await expect(page).toHaveURL(/\/education\/interview-questions\/$/);
});
