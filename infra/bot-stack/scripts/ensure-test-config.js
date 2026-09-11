"use strict";

// functions/configuration.jsonはデプロイ時にgenerate-config.jsが実際のシークレット
// （GitHub Secrets由来の環境変数）から生成する、gitignore対象のファイル（examination#401）。
// ローカル・CIでのテスト実行時にはこの生成ステップを経ないため、requireで参照している
// 各ハンドラのテストが「Cannot find module」で軒並み失敗してしまう。テストでは実際の
// シークレット値は不要（DynamoDB・Gemini API等の外部呼び出し自体をモックするため）なので、
// 既に配置済みでない場合のみ、判別しやすいダミー値で生成する。package.jsonの
// pretestスクリプトから呼ばれる想定
const fs = require("fs");
const path = require("path");

const outPath = path.join(__dirname, "..", "functions", "configuration.json");

if (!fs.existsSync(outPath)) {
  const dummyConfig = {
    lineChannelSecret: "test-line-channel-secret",
    lineChannelAccessToken: "test-line-channel-access-token",
    geminiApiKey: "test-gemini-api-key",
    internalApiSecret: "test-internal-api-secret",
    adminNotifyEmail: "test-admin@example.com",
  };
  fs.writeFileSync(outPath, JSON.stringify(dummyConfig, null, 2));
  console.log(`Wrote dummy ${outPath} for tests`);
}
