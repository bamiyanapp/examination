"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

const VOICE_TOKENS_TABLE = "examination-voice-tokens";
const ALLOWED_EMAILS_TABLE = "examination-allowed-emails";

const ddb = new DynamoDBClient({ region: "us-east-1" });

// サイト（checkAuth.js）が/_voice-tokenで発行した短期トークンを検証する（examination#62）。
// 音声対話専用に発行された名前だが、実体は「ログイン済み・許可済みユーザーであることの
// 証明」であり音声機能に限定されないため、bot-stackの他のブラウザ向けAPI（examination#77の
// 想定問答閲覧API等）でも同じトークンをそのまま流用する
async function verifyVoiceToken(token) {
  const result = await ddb.send(new GetItemCommand({ TableName: VOICE_TOKENS_TABLE, Key: { token: { S: token } } }));
  if (!result.Item) return null;
  const expiresAt = Number(result.Item.expiresAt?.N || 0);
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;
  return result.Item.email.S;
}

// 許可済みメールアドレスかどうかに加え、複数家族対応（examination#44、#238）の
// familySlugも同じGetItem結果からあわせて返す（追加のDB往復は発生しない）。
// 許可されていない場合はnullを返す
async function getAllowedEmailRecord(email) {
  const result = await ddb.send(new GetItemCommand({ TableName: ALLOWED_EMAILS_TABLE, Key: { email: { S: email } } }));
  if (!result.Item) return null;
  return { familySlug: result.Item.familySlug?.S || "" };
}

// Authorization: Bearer <token> ヘッダーを検証し、許可済みユーザーのメールアドレス・
// 所属家族（familySlug）を返す。認証できない場合はnullを返す（呼び出し側で403を返す）
async function verifyBearerEmail(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return null;
  const email = await verifyVoiceToken(token);
  if (!email) return null;
  const record = await getAllowedEmailRecord(email);
  if (!record) return null;
  return { email, familySlug: record.familySlug };
}

module.exports = { verifyBearerEmail };
