import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { hasMeaningfulContent, saveMockInterviewSummary, listMockInterviewSummaries } from "./mockInterviews.js";

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
  vi.useRealTimers();
});

describe("hasMeaningfulContent", () => {
  it("returns false for a non-array value", () => {
    expect(hasMeaningfulContent(undefined)).toBe(false);
    expect(hasMeaningfulContent(null)).toBe(false);
  });

  it("returns false when no message has role 'user'", () => {
    expect(hasMeaningfulContent([{ role: "assistant", content: "こんにちは" }])).toBe(false);
    expect(hasMeaningfulContent([])).toBe(false);
  });

  it("returns true when at least one message has role 'user'", () => {
    expect(
      hasMeaningfulContent([
        { role: "assistant", content: "こんにちは" },
        { role: "user", content: "よろしくお願いします" },
      ])
    ).toBe(true);
  });
});

describe("saveMockInterviewSummary", () => {
  it("puts an item with the given fields and returns a generated sessionId", async () => {
    ddbMock.on(PutItemCommand).resolves({});

    const sessionId = await saveMockInterviewSummary({
      familySlug: "tanaka",
      role: "本人",
      situation: "受験理由",
      schoolCharacteristics: "自然が多い",
      channel: "line",
      summary: "落ち着いて回答できた",
      createdBy: "family@example.com",
    });

    expect(sessionId).toEqual(expect.any(String));
    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input).toMatchObject({
      TableName: "examination-mock-interviews",
      Item: expect.objectContaining({
        familySlug: { S: "tanaka" },
        role: { S: "本人" },
        situation: { S: "受験理由" },
        schoolCharacteristics: { S: "自然が多い" },
        channel: { S: "line" },
        summary: { S: "落ち着いて回答できた" },
        createdBy: { S: "family@example.com" },
      }),
    });
  });

  it("stores an empty string when schoolCharacteristics is not provided", async () => {
    ddbMock.on(PutItemCommand).resolves({});

    await saveMockInterviewSummary({
      familySlug: "tanaka",
      role: "父",
      situation: "受験理由",
      channel: "voice",
      summary: "要約",
      createdBy: "family@example.com",
    });

    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input.Item.schoolCharacteristics).toEqual({ S: "" });
  });
});

describe("listMockInterviewSummaries", () => {
  it("queries by familySlug in descending order and maps items to summaries", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          sessionId: { S: "s2" },
          role: { S: "母" },
          situation: { S: "受験理由" },
          schoolCharacteristics: { S: "自然が多い" },
          channel: { S: "line" },
          summary: { S: "要約2" },
          createdAt: { S: "2026-01-02T00:00:00.000Z" },
        },
      ],
    });

    const summaries = await listMockInterviewSummaries("tanaka");

    expect(summaries).toEqual([
      {
        sessionId: "s2",
        role: "母",
        situation: "受験理由",
        schoolCharacteristics: "自然が多い",
        channel: "line",
        summary: "要約2",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input).toMatchObject({
      TableName: "examination-mock-interviews",
      KeyConditionExpression: "familySlug = :slug",
      ExpressionAttributeValues: { ":slug": { S: "tanaka" } },
      ScanIndexForward: false,
    });
  });

  it("returns an empty array when there are no items", async () => {
    ddbMock.on(QueryCommand).resolves({});
    expect(await listMockInterviewSummaries("tanaka")).toEqual([]);
  });

  it("defaults missing fields to empty strings", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{}] });
    expect(await listMockInterviewSummaries("tanaka")).toEqual([
      { sessionId: "", role: "", situation: "", schoolCharacteristics: "", channel: "", summary: "", createdAt: "" },
    ]);
  });
});
