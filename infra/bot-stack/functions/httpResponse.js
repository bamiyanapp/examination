"use strict";

// bot-stackの各ハンドラが個別に定義していたjsonResponseヘルパーを共有化する
// （examination#449、jscpdの重複検知でreportClientError.jsが既存ハンドラと
// 同一パターンを複製している点が指摘された）。
function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

module.exports = { jsonResponse };
