"use strict";

const { buildClientErrorLogPayload } = require("./clientErrorReporting.js"); // symlink

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// shared/ui/ErrorBoundary.jsxが送信するフロントエンドの未捕捉例外を受け取り、
// CloudWatch Logsへ記録する（examination#449、docs/client-error-reporting-pattern.md参照）。
// 開発環境の制約（スマホオンリー、ブラウザのコンソール出力を事後に確認できない）への対応。
// 認証の無い公開エンドポイントのため、内容の真偽は検証できない前提で
// buildClientErrorLogPayload側が長さ上限を設けている
exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "invalid JSON" });
  }

  const payload = buildClientErrorLogPayload(body);
  if (!payload) {
    return jsonResponse(400, { error: "invalid input" });
  }

  console.error("[ClientError]", payload);

  return jsonResponse(200, { message: "reported" });
};
