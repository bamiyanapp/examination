import { test, expect } from "./coverageFixture.js"; // symlink
import { loginAsE2ETestUser } from "./auth.js";
import { captureScreenshot } from "./screenshot.js";

// テスト専用家族（examination#413）のスコープ内でのみ追加・削除を行う。
// example.com（RFC 2606で予約された文書用ドメイン）のメールアドレスを、
// 実行のたびに一意になるようタイムスタンプ付きで生成し、実在の人物の
// メールアドレスとは無関係であることを明確にする。テスト自身が追加した
// レコードはテスト内で必ず削除し（後片付け）、実在の家族の許可メール
// アドレスには一切触れない
const testEmail = `e2e-test-${Date.now()}@example.com`;

test("認証済みで許可メールアドレスの追加・削除ができる", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/settings/allowed-emails/");
  // アサーションが失敗しても、認証後に実際どのページへ到達したかを
  // Job Summary/PRコメント（reusable-ci.ymlのスクリーンショット報告機能）で
  // 確認できるよう、アサーションより先に撮影する
  console.log(`到達したURL: ${page.url()}`);
  await expect(page.getByRole("heading", { name: "閲覧許可メールアドレスの管理" })).toBeVisible();
  await captureScreenshot(page, testInfo, "allowed-emails-list", "閲覧許可メールアドレスの管理（認証済み）");

  await page.getByPlaceholder("追加するメールアドレス").fill(testEmail);
  await page.getByRole("button", { name: "追加" }).click();

  const addedRow = page.getByRole("listitem").filter({ hasText: testEmail });
  try {
    await expect(addedRow).toBeVisible();
    await captureScreenshot(page, testInfo, "allowed-emails-added", "閲覧許可メールアドレスの管理（テスト用アドレス追加後）");
  } finally {
    // 後片付け: 追加したテスト用アドレスを削除する（実在の家族データには一切触れない）。
    // 上のtry内のアサーションが失敗した場合でも、テストデータを残さないよう必ず実行する
    await addedRow.getByRole("button", { name: "削除" }).click();
    await expect(addedRow).toBeHidden();
  }
});
