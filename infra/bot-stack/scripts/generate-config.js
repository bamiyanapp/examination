"use strict";

const fs = require("fs");
const path = require("path");

const required = [
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "GEMINI_API_KEY",
  "INTERNAL_API_SECRET",
  "ADMIN_NOTIFY_EMAIL",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`環境変数 ${key} が設定されていません`);
  }
}

const config = {
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET,
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  // LINE bot・音声対話機能（examination#62）の両方でこのGemini APIキーを使う
  geminiApiKey: process.env.GEMINI_API_KEY,
  // site-stack（checkAuth.js）からの内部API呼び出し（新規家族登録の通知、
  // examination#259）を検証する共有シークレット。site-stack側にも同じ値を注入する
  internalApiSecret: process.env.INTERNAL_API_SECRET,
  // 新規家族登録の通知（examination#259）を受け取る管理用Googleアカウントのメール
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL,
};

const outPath = path.join(__dirname, "..", "functions", "configuration.json");
fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`Wrote ${outPath}`);
