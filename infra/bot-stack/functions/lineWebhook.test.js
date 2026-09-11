import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { handler } from "./lineWebhook.js";

// このハンドラは、テキストメッセージを1件でも処理すると最終的にreplyMessage
// （geminiConversation.js経由でNode組み込みのhttpsを直接requireする）を呼ぶため、
// CommonJS requireで読み込まれるモジュールをvi.mockで差し替えられない制約
// （notifyFamilyCreated.test.js参照）から、実際のメッセージ処理・返信までは
// 対象外とする。署名検証・リクエストの入口（405/403/400）と、返信対象イベントが
// 0件のケース（ネットワーク呼び出しが発生しない）のみを検証する
const ddbMock = mockClient(DynamoDBClient);
const LINE_CHANNEL_SECRET = "test-line-channel-secret"; // scripts/ensure-test-config.jsのダミー値と一致させる

beforeEach(() => {
  ddbMock.reset();
});

function sign(rawBody) {
  // テスト専用のダミー値（scripts/ensure-test-config.js参照）であり、実際の
  // シークレットではない
  // eslint-disable-next-line sonarjs/hardcoded-secret-signatures
  return crypto.createHmac("sha256", LINE_CHANNEL_SECRET).update(rawBody).digest("base64");
}

function event(rawBody, { signature = sign(rawBody), method = "POST" } = {}) {
  return {
    requestContext: { http: { method } },
    headers: signature ? { "x-line-signature": signature } : {},
    body: rawBody,
  };
}

describe("lineWebhook handler", () => {
  it("returns 405 for a non-POST method", async () => {
    const response = await handler(event("{}", { method: "GET" }));
    expect(response.statusCode).toBe(405);
  });

  it("returns 403 when the signature is missing", async () => {
    const response = await handler(event("{}", { signature: null }));
    expect(response.statusCode).toBe(403);
  });

  it("returns 403 when the signature does not match the body", async () => {
    const response = await handler(event("{}", { signature: sign("different body") }));
    expect(response.statusCode).toBe(403);
  });

  it("returns 400 on invalid JSON with a valid signature", async () => {
    const response = await handler(event("{invalid"));
    expect(response.statusCode).toBe(400);
  });

  it("returns 200 OK when there are no events", async () => {
    const response = await handler(event(JSON.stringify({ events: [] })));
    expect(response).toEqual({ statusCode: 200, body: "OK" });
  });

  it("returns 200 OK and skips non-text-message events without any DynamoDB/network call", async () => {
    const response = await handler(
      event(
        JSON.stringify({
          events: [
            { type: "follow", source: { userId: "U1" }, replyToken: "r1" },
            { type: "message", message: { type: "image" }, source: { userId: "U2" }, replyToken: "r2" },
            { type: "message", message: { type: "text", text: "こんにちは" } }, // userId/replyToken無し
          ],
        })
      )
    );

    expect(response).toEqual({ statusCode: 200, body: "OK" });
    expect(ddbMock.calls()).toHaveLength(0);
  });
});
