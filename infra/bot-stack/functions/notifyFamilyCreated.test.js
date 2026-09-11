import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, ScanCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { handler } from "./notifyFamilyCreated.js";

// このハンドラは（geminiConversation.js経由で）Node組み込みのhttpsモジュールを
// requireで直接呼び出しLINEへ実際にプッシュ通知する（pushLineMessage）。
// CommonJS requireで読み込まれるモジュールはvi.mockによる差し替えが効かない
// （本テスト作成時に検証済み: モック登録済みでもSUT側は実際のhttpsモジュールを
// requireしてしまい、このサンドボックスのネットワーク許可リストでブロックされる
// 実リクエストが飛んだ）。そのため、LINEへの通知が実際に成功する分岐
// （lineUserIdが見つかり、pushLineMessageが成功する経路）は対象外とし、
// それ以外の分岐（認証・バリデーション・LINE未連携時のフォールバック等）のみ検証する。
// 依存注入等によるテスト容易性の改善は本Issue（examination#401）の範囲外とする
const ddbMock = mockClient(DynamoDBClient);
const INTERNAL_SECRET = "test-internal-api-secret"; // scripts/ensure-test-config.jsのダミー値と一致させる

beforeEach(() => {
  ddbMock.reset();
});

function event({ method = "POST", secret = INTERNAL_SECRET, body } = {}) {
  return {
    requestContext: { http: { method } },
    headers: secret ? { "x-internal-secret": secret } : {},
    body,
  };
}

describe("notifyFamilyCreated handler", () => {
  it("returns 405 for a non-POST method", async () => {
    const response = await handler(event({ method: "GET" }));
    expect(response.statusCode).toBe(405);
  });

  it("returns 403 when the internal secret does not match", async () => {
    const response = await handler(event({ secret: "wrong-secret" }));
    expect(response.statusCode).toBe(403);
  });

  it("returns 400 on invalid JSON", async () => {
    const response = await handler(event({ body: "{invalid" }));
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const response = await handler(event({ body: JSON.stringify({ email: "family@example.com" }) }));
    expect(response.statusCode).toBe(400);
  });

  it("seeds the family profile and returns notified: false when the admin is not LINE-linked", async () => {
    ddbMock.on(PutItemCommand).resolves({});
    ddbMock.on(ScanCommand, { TableName: "examination-line-links" }).resolves({ Items: [] });

    const response = await handler(
      event({ body: JSON.stringify({ email: "family@example.com", situation: "お受験理由", familySlug: "tanaka" }) })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ notified: false });
    const putCall = ddbMock.commandCalls(PutItemCommand)[0];
    expect(putCall.args[0].input.Item).toMatchObject({ familySlug: { S: "tanaka" }, situation: { S: "お受験理由" } });
  });

  it("does not fail the request even when saving the family profile fails", async () => {
    ddbMock.on(PutItemCommand).rejects(new Error("boom"));
    ddbMock.on(ScanCommand, { TableName: "examination-line-links" }).resolves({ Items: [] });

    const response = await handler(
      event({ body: JSON.stringify({ email: "family@example.com", situation: "お受験理由", familySlug: "tanaka" }) })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ notified: false });
  });
});
