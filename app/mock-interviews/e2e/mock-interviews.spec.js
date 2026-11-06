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

test("ユーザーメニューからページ共有モーダルを開ける", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/education/mock-interviews/");
  await expect(page.getByRole("heading", { name: "模擬面接記録" })).toBeVisible();

  // iOS Safariのタップ時フォーカス挙動対応（examination#349）により、
  // ボタンをクリックするとCSSの:focus-withinでドロップダウンが開く
  const userMenuButton = page.locator(".user-menu button").first();
  await userMenuButton.click();
  await expect(page.getByRole("button", { name: "このページを共有" })).toBeVisible();
  await captureScreenshot(page, testInfo, "mock-interviews-user-menu", "模擬面接記録（ユーザーメニューを開いた直後）");

  await page.getByRole("button", { name: "このページを共有" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("このページを共有")).toBeVisible();
  await expect(dialog.getByText(/\/$/)).toBeVisible();

  // モーダルヘッダーの閉じるアイコン（aria-label="閉じる"）とフッターの
  // 「閉じる」ボタンの両方がロール名で一致するため、dialog配下のボタンに
  // 絞った上で最後（フッター側）を明示的に選ぶ（examination#631と同じ対応）
  await dialog.getByRole("button", { name: "閉じる" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("「← トップに戻る」リンクからサイトトップへ遷移できる", async ({ page, context }) => {
  await loginAsE2ETestUser(context);
  await page.goto("/education/mock-interviews/");
  await expect(page.getByRole("heading", { name: "模擬面接記録" })).toBeVisible();

  await page.getByRole("link", { name: "← トップに戻る" }).click();
  await expect(page).toHaveURL(/\/$/);
});
