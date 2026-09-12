import { test, expect } from "@playwright/test";
import { loginAsE2ETestUser } from "./auth.js";
import { captureScreenshot } from "./screenshot.js";

test("認証済みでトップページの主要セクションが表示される", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/");
  await expect(page.getByText("教育")).toBeVisible();
  await expect(page.getByText("設定")).toBeVisible();
  await captureScreenshot(page, testInfo, "top-page", "トップページ（認証済み）");
});
