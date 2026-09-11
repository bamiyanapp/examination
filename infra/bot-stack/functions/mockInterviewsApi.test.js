import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { handler } from "./mockInterviewsApi.js";

// mockInterviewsApi.jsはCommonJSで依存モジュール（apiAuth.js・mockInterviews.js）を
// requireで分割代入するため、vi.mockによるモジュール差し替えは分割代入時に既にコピー
// された参照までは置き換えられない。そのため両モジュールが実際に呼ぶDynamoDBの
// レベルでモックし、結線（handlerが正しく認証・データ取得を行うこと）を検証する
const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

function event(method, authorization) {
  return {
    requestContext: { http: { method } },
    headers: authorization ? { authorization } : {},
  };
}

describe("mockInterviewsApi handler", () => {
  it("returns 405 for a non-GET method", async () => {
    const response = await handler(event("POST"));
    expect(response.statusCode).toBe(405);
  });

  it("returns 403 when the Authorization header is missing", async () => {
    const response = await handler(event("GET"));
    expect(response.statusCode).toBe(403);
  });

  it("returns 403 when the bearer token is not allow-listed", async () => {
    const validExpiresAt = Math.floor(Date.now() / 1000) + 3600;
    ddbMock
      .on(GetItemCommand, { TableName: "examination-voice-tokens" })
      .resolves({ Item: { email: { S: "family@example.com" }, expiresAt: { N: String(validExpiresAt) } } });
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});

    const response = await handler(event("GET", "Bearer valid-token"));

    expect(response.statusCode).toBe(403);
  });

  it("returns the summaries for the caller's family on success", async () => {
    const validExpiresAt = Math.floor(Date.now() / 1000) + 3600;
    ddbMock
      .on(GetItemCommand, { TableName: "examination-voice-tokens" })
      .resolves({ Item: { email: { S: "family@example.com" }, expiresAt: { N: String(validExpiresAt) } } });
    ddbMock
      .on(GetItemCommand, { TableName: "examination-allowed-emails" })
      .resolves({ Item: { familySlug: { S: "tanaka" } } });
    ddbMock.on(QueryCommand, { TableName: "examination-mock-interviews" }).resolves({
      Items: [
        {
          sessionId: { S: "s1" },
          role: { S: "本人" },
          situation: { S: "受験理由" },
          schoolCharacteristics: { S: "" },
          channel: { S: "line" },
          summary: { S: "落ち着いて回答できた" },
          createdAt: { S: "2026-01-01T00:00:00.000Z" },
        },
      ],
    });

    const response = await handler(event("GET", "Bearer valid-token"));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      summaries: [
        {
          sessionId: "s1",
          role: "本人",
          situation: "受験理由",
          schoolCharacteristics: "",
          channel: "line",
          summary: "落ち着いて回答できた",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const queryCall = ddbMock.commandCalls(QueryCommand)[0];
    expect(queryCall.args[0].input.ExpressionAttributeValues).toEqual({ ":slug": { S: "tanaka" } });
  });
});
