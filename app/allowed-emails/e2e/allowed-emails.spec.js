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

test("ユーザーメニューからページ共有モーダルを開ける", async ({ page, context }, testInfo) => {
  await loginAsE2ETestUser(context);
  await page.goto("/settings/allowed-emails/");
  await expect(page.getByRole("heading", { name: "閲覧許可メールアドレスの管理" })).toBeVisible();

  // iOS Safariのタップ時フォーカス挙動対応（examination#349）により、
  // ボタンをクリックするとCSSの:focus-withinでドロップダウンが開く
  const userMenuButton = page.locator(".user-menu button").first();
  await userMenuButton.click();
  await expect(page.getByRole("button", { name: "このページを共有" })).toBeVisible();
  await captureScreenshot(page, testInfo, "allowed-emails-user-menu", "閲覧許可メールアドレスの管理（ユーザーメニューを開いた直後）");

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
  await page.goto("/settings/allowed-emails/");
  await expect(page.getByRole("heading", { name: "閲覧許可メールアドレスの管理" })).toBeVisible();

  await page.getByRole("link", { name: "← トップに戻る" }).click();
  await expect(page).toHaveURL(/\/$/);
});
