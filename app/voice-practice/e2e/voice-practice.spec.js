import { test, expect } from "./coverageFixture.js"; // symlink
import { loginAsE2ETestUser } from "./auth.js";
import { captureScreenshot } from "./screenshot.js";

test("認証済みでプロフィールが表示され、会話を開始・終了できる", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/education/voice-practice/");

  // アサーションが失敗しても、認証後に実際どのページへ到達したかを
  // Job Summary/PRコメント（reusable-ci.ymlのスクリーンショット報告機能）で
  // 確認できるよう、アサーションより先に撮影する
  console.log(`到達したURL: ${page.url()}`);
  await expect(page.getByText(/シチュエーション:/)).toBeVisible();
  await captureScreenshot(page, testInfo, "voice-practice-profile", "音声で面接練習（プロフィール表示、認証済み）");

  // infra/bot-stackのvoiceChat.js（Gemini連携）を実際に呼び出す。ブラウザ標準の
  // SpeechRecognition/SpeechSynthesisはheadless Chromiumで信頼できないため、
  // 「話す」（音声入力）は対象外とし、「会話を始める」で最初のAI応答を
  // 受け取るところまでを主要フローとして検証する
  await page.getByRole("button", { name: "会話を始める" }).click();
  await expect(page.getByText("面接官")).toBeVisible({ timeout: 30000 });
  await captureScreenshot(page, testInfo, "voice-practice-started", "音声で面接練習（会話開始後、AI応答を受信）");

  await page.getByRole("button", { name: "練習を終える" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
