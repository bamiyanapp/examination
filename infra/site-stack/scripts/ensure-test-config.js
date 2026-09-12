"use strict";

// functions/configuration.jsonはデプロイ時にgenerate-config.jsが実際のシークレット
// （GitHub Secrets由来の環境変数）から生成する、gitignore対象のファイル（examination#402）。
// ローカル・CIでのテスト実行時にはこの生成ステップを経ないため、requireで参照している
// checkAuth.jsのテストが「Cannot find module」で失敗してしまう。テストでは実際の
// シークレット値は不要（Cognito JWKS・DynamoDB等の外部呼び出し自体をモックするため）なので、
// 既に配置済みでない場合のみ、判別しやすいダミー値で生成する。package.jsonの
// pretestスクリプトから呼ばれる想定（infra/bot-stack/scripts/ensure-test-config.jsと同様）
const fs = require("fs");
const path = require("path");

const outPath = path.join(__dirname, "..", "functions", "configuration.json");

if (!fs.existsSync(outPath)) {
  const dummyConfig = {
    region: "us-east-1",
    userPoolId: "test-user-pool-id",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    cognitoDomain: "https://test-domain.auth.us-east-1.amazoncognito.com",
    internalApiSecret: "test-internal-api-secret",
  };
  fs.writeFileSync(outPath, JSON.stringify(dummyConfig, null, 2));
  console.log(`Wrote dummy ${outPath} for tests`);
}
