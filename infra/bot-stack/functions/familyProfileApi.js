"use strict";

const { verifyBearerEmail } = require("./apiAuth");
const { MAX_FIELD_LENGTH, getFamilyProfile, saveFamilyProfile } = require("./familyProfile");
const { DEFAULT_SITUATION } = require("./geminiConversation");

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function sanitizeField(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_FIELD_LENGTH) : "";
}

// プロフィール（志望先の特色・その他前提情報）の取得・更新API（examination#125）。
// app/profile-edit/がブラウザから直接呼ぶ。想定問答の閲覧等と同じ短期トークン
// （/_voice-token）で認証する
exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;
  const email = await verifyBearerEmail(event);
  if (!email) {
    return jsonResponse(403, { error: "アクセスが許可されていません" });
  }

  if (method === "GET") {
    return jsonResponse(200, await getFamilyProfile());
  }

  if (method === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return jsonResponse(400, { error: "invalid JSON" });
    }
    const situation = sanitizeField(payload.situation) || DEFAULT_SITUATION;
    const schoolCharacteristics = sanitizeField(payload.schoolCharacteristics);
    const otherContext = sanitizeField(payload.otherContext);
    await saveFamilyProfile({ situation, schoolCharacteristics, otherContext, updatedBy: email });
    return jsonResponse(200, { situation, schoolCharacteristics, otherContext });
  }

  return jsonResponse(405, { error: "method not allowed" });
};
