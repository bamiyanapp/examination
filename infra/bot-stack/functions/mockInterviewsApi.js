"use strict";

const { verifyBearerEmail } = require("./apiAuth");
const { listMockInterviewSummaries } = require("./mockInterviews");

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// 模擬面接記録の閲覧API（examination#103）。app/interview-questions/と同じ短期
// トークン（/_voice-token）で認証する読み取り専用API
exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method !== "GET") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const email = await verifyBearerEmail(event);
  if (!email) {
    return jsonResponse(403, { error: "アクセスが許可されていません" });
  }

  const summaries = await listMockInterviewSummaries();
  return jsonResponse(200, { summaries });
};
