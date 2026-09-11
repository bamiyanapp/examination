import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, QueryCommand, DeleteItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { handler } from "./deleteFamilyData.js";

const ddbMock = mockClient(DynamoDBClient);
const INTERNAL_SECRET = "test-internal-api-secret"; // scripts/ensure-test-config.jsのダミー値と一致させる

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(QueryCommand).resolves({ Items: [] });
  ddbMock.on(ScanCommand).resolves({ Items: [] });
  ddbMock.on(DeleteItemCommand).resolves({});
});

function event({ method = "POST", secret = INTERNAL_SECRET, body } = {}) {
  return {
    requestContext: { http: { method } },
    headers: secret ? { "x-internal-secret": secret } : {},
    body,
  };
}

describe("deleteFamilyData handler", () => {
  it("returns 405 for a non-POST method", async () => {
    const response = await handler(event({ method: "GET" }));
    expect(response.statusCode).toBe(405);
  });

  it("returns 403 when the internal secret does not match", async () => {
    const response = await handler(event({ secret: "wrong-secret", body: JSON.stringify({ familySlug: "tanaka" }) }));
    expect(response.statusCode).toBe(403);
  });

  it("returns 403 when the internal secret header is missing", async () => {
    const response = await handler(event({ secret: null, body: JSON.stringify({ familySlug: "tanaka" }) }));
    expect(response.statusCode).toBe(403);
  });

  it("returns 400 on invalid JSON", async () => {
    const response = await handler(event({ body: "{invalid" }));
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when familySlug is missing", async () => {
    const response = await handler(event({ body: JSON.stringify({}) }));
    expect(response.statusCode).toBe(400);
  });

  it("deletes items from all three family tables and returns deleted: true", async () => {
    const response = await handler(event({ body: JSON.stringify({ familySlug: "tanaka" }) }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ deleted: true });
    const deleteCalls = ddbMock.commandCalls(DeleteItemCommand);
    // familyProfileの削除（QueryCommandの結果は空配列なので、他はQuery分の削除は発生しない）
    expect(deleteCalls.some((c) => c.args[0].input.TableName === "examination-family-profile")).toBe(true);
  });

  it("also deletes the LINE link when an email is provided", async () => {
    ddbMock.on(ScanCommand, { TableName: "examination-line-links" }).resolves({
      Items: [{ lineUserId: { S: "U123" }, email: { S: "family@example.com" } }],
    });

    const response = await handler(
      event({ body: JSON.stringify({ familySlug: "tanaka", email: "family@example.com" }) })
    );

    expect(response.statusCode).toBe(200);
    const deleteCalls = ddbMock.commandCalls(DeleteItemCommand);
    expect(
      deleteCalls.some(
        (c) => c.args[0].input.TableName === "examination-line-links" && c.args[0].input.Key.lineUserId.S === "U123"
      )
    ).toBe(true);
  });

  it("deletes items returned by the interview-questions/mock-interviews queries", async () => {
    ddbMock
      .on(QueryCommand, { TableName: "examination-interview-questions" })
      .resolves({ Items: [{ familySlug: { S: "tanaka" }, questionId: { S: "q1" } }] });

    await handler(event({ body: JSON.stringify({ familySlug: "tanaka" }) }));

    const deleteCalls = ddbMock.commandCalls(DeleteItemCommand);
    expect(
      deleteCalls.some(
        (c) => c.args[0].input.TableName === "examination-interview-questions" && c.args[0].input.Key.questionId.S === "q1"
      )
    ).toBe(true);
  });

  it("returns 500 when a DynamoDB call fails", async () => {
    ddbMock.on(QueryCommand).rejects(new Error("boom"));

    const response = await handler(event({ body: JSON.stringify({ familySlug: "tanaka" }) }));

    expect(response.statusCode).toBe(500);
  });
});
