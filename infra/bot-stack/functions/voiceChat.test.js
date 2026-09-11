import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { handler } from "./voiceChat.js";

// callGemini・summarizeMockInterview（geminiConversation.js経由でNode組み込みの
// httpsを直接requireする）が関与する経路は、CommonJS requireで読み込まれる
// モジュールをvi.mockで差し替えられない制約（notifyFamilyCreated.test.js参照）
// のため対象外とする。それ以外（認証・バリデーション・レート制限・練習終了時の
// 保存分岐）を検証する
const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
  const validExpiresAt = Math.floor(Date.now() / 1000) + 3600;
  ddbMock
    .on(GetItemCommand, { TableName: "examination-voice-tokens" })
    .resolves({ Item: { email: { S: "family@example.com" }, expiresAt: { N: String(validExpiresAt) } } });
  ddbMock
    .on(GetItemCommand, { TableName: "examination-allowed-emails" })
    .resolves({ Item: { familySlug: { S: "tanaka" } } });
  ddbMock.on(GetItemCommand, { TableName: "examination-family-profile" }).resolves({});
});

function event(method, { authorization = "Bearer valid-token", body } = {}) {
  return {
    requestContext: { http: { method } },
    headers: authorization ? { authorization } : {},
    body,
  };
}

describe("voiceChat handler", () => {
  it("returns 405 for a non-POST method", async () => {
    const response = await handler(event("GET"));
    expect(response.statusCode).toBe(405);
  });

  it("returns 403 when the caller is not authenticated", async () => {
    const response = await handler(event("POST", { authorization: null }));
    expect(response.statusCode).toBe(403);
  });

  it("returns 400 on invalid JSON", async () => {
    const response = await handler(event("POST", { body: "{invalid" }));
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when role is not one of 本人/父/母", async () => {
    const response = await handler(event("POST", { body: JSON.stringify({ role: "祖父" }) }));
    expect(response.statusCode).toBe(400);
  });

  it("returns saved: false for action=end when the history has no user message", async () => {
    const response = await handler(
      event("POST", { body: JSON.stringify({ role: "本人", action: "end", history: [{ role: "assistant", content: "x" }] }) })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ saved: false });
  });

  it("returns saved: false for action=end with an empty history", async () => {
    const response = await handler(event("POST", { body: JSON.stringify({ role: "本人", action: "end" }) }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ saved: false });
  });

  it("returns 429 when the daily AI API limit has been reached, before calling Gemini", async () => {
    const error = new Error("conditional check failed");
    error.name = "ConditionalCheckFailedException";
    ddbMock.on(UpdateItemCommand).rejects(error);

    const response = await handler(event("POST", { body: JSON.stringify({ role: "本人", message: "こんにちは" }) }));

    expect(response.statusCode).toBe(429);
    const updateCall = ddbMock.commandCalls(UpdateItemCommand)[0];
    expect(updateCall.args[0].input.TableName).toBe("examination-ai-api-issuance");
  });
});
