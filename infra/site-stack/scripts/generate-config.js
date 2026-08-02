"use strict";

const fs = require("fs");
const path = require("path");

const required = [
  "AWS_REGION",
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "COGNITO_CLIENT_SECRET",
  "COGNITO_DOMAIN",
  "ALLOWED_EMAILS",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`環境変数 ${key} が設定されていません`);
  }
}

const config = {
  region: process.env.AWS_REGION,
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  clientSecret: process.env.COGNITO_CLIENT_SECRET,
  cognitoDomain: process.env.COGNITO_DOMAIN,
  // カンマ区切りのメールアドレス一覧。checkAuth.jsでid_tokenのemailクレームと
  // 突き合わせ、家族以外のGoogleアカウントでのログインを拒否する
  allowedEmails: process.env.ALLOWED_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
};

const outPath = path.join(__dirname, "..", "functions", "configuration.json");
fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`Wrote ${outPath}`);
