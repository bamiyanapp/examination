"use strict";

// site-stack↔bot-stack間の内部API（deleteFamilyData.js・notifyFamilyCreated.js等、
// site-stackがサーバー間で呼ぶAPI）が共通で使うレスポンス整形・認証チェック。
// jscpdの重複検知（examination#447）を機に切り出した

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// POSTメソッド・共有シークレット（X-Internal-Secretヘッダー）を検証し、
// 問題があればそのまま返すべきjsonResponseを返す。問題無ければnullを返す
function checkInternalApiAuth(event, config) {
  if (event.requestContext?.http?.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }
  const providedSecret = event.headers?.["x-internal-secret"];
  if (!config.internalApiSecret || providedSecret !== config.internalApiSecret) {
    return jsonResponse(403, { error: "forbidden" });
  }
  return null;
}

module.exports = { jsonResponse, checkInternalApiAuth };
