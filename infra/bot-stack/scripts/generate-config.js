"use strict";

const fs = require("fs");
const path = require("path");

const required = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "GEMINI_API_KEY"];

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
};

const outPath = path.join(__dirname, "..", "functions", "configuration.json");
fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`Wrote ${outPath}`);
