import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { AI_API_DAILY_LIMIT, incrementAndCheckAiApiUsage } from "./aiApiLimit.js";

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

describe("incrementAndCheckAiApiUsage", () => {
  it("returns true and increments examination-ai-api-issuance when under the daily limit", async () => {
    ddbMock.on(UpdateItemCommand).resolves({});

    const allowed = await incrementAndCheckAiApiUsage("family@example.com");

    expect(allowed).toBe(true);
    const call = ddbMock.commandCalls(UpdateItemCommand)[0];
    expect(call.args[0].input).toMatchObject({
      TableName: "examination-ai-api-issuance",
      ExpressionAttributeValues: expect.objectContaining({ ":limit": { N: String(AI_API_DAILY_LIMIT) } }),
    });
  });

  it("returns false when the daily limit has been reached (ConditionalCheckFailedException)", async () => {
    const error = new Error("conditional check failed");
    error.name = "ConditionalCheckFailedException";
    ddbMock.on(UpdateItemCommand).rejects(error);

    const allowed = await incrementAndCheckAiApiUsage("family@example.com");

    expect(allowed).toBe(false);
  });
});
