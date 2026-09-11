import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand, QueryCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { handler } from "./interviewQuestions.js";

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
});

function event(method, { authorization = "Bearer valid-token", body } = {}) {
  return {
    requestContext: { http: { method } },
    headers: authorization ? { authorization } : {},
    body,
  };
}

describe("interviewQuestions handler", () => {
  it("returns 403 when the caller is not authenticated", async () => {
    const response = await handler(event("GET", { authorization: null }));
    expect(response.statusCode).toBe(403);
  });

  it("returns the family's questions on GET", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          questionId: { S: "q1" },
          category: { S: "本人面接" },
          targetPerson: { S: "本人" },
          question: { S: "好きな食べ物は？" },
          answer: { S: "お寿司です" },
        },
      ],
    });

    const response = await handler(event("GET"));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).questions).toEqual([
      {
        questionId: "q1",
        category: "本人面接",
        targetPerson: "本人",
        question: "好きな食べ物は？",
        answer: "お寿司です",
        example: "",
        impression: "",
        modelAnswer: "",
      },
    ]);
  });

  it("returns 400 on POST with invalid JSON", async () => {
    const response = await handler(event("POST", { body: "{invalid" }));
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when targetPerson is not one of 本人/父/母", async () => {
    const response = await handler(
      event("POST", { body: JSON.stringify({ targetPerson: "祖父", question: "q", answer: "a" }) })
    );
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when question is missing", async () => {
    const response = await handler(event("POST", { body: JSON.stringify({ targetPerson: "本人", answer: "a" }) }));
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when answer is missing", async () => {
    const response = await handler(event("POST", { body: JSON.stringify({ targetPerson: "本人", question: "q" }) }));
    expect(response.statusCode).toBe(400);
  });

  it("creates a question on POST", async () => {
    ddbMock.on(PutItemCommand).resolves({});

    const response = await handler(
      event("POST", { body: JSON.stringify({ targetPerson: "本人", question: "好きな遊びは？", answer: "鬼ごっこです" }) })
    );

    expect(response.statusCode).toBe(200);
    const { question } = JSON.parse(response.body);
    expect(question).toMatchObject({ question: "好きな遊びは？", answer: "鬼ごっこです", category: "本人面接" });
    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input.Item.createdBy).toEqual({ S: "family@example.com" });
  });

  it("returns 400 on PUT without questionId", async () => {
    const response = await handler(
      event("PUT", { body: JSON.stringify({ targetPerson: "本人", question: "q", answer: "a" }) })
    );
    expect(response.statusCode).toBe(400);
  });

  it("returns 404 on PUT when the question does not exist", async () => {
    ddbMock.on(GetItemCommand, { TableName: "examination-interview-questions" }).resolves({});

    const response = await handler(
      event("PUT", {
        body: JSON.stringify({ questionId: "no-such-id", targetPerson: "本人", question: "q", answer: "a" }),
      })
    );

    expect(response.statusCode).toBe(404);
  });

  it("updates an existing question on PUT", async () => {
    ddbMock.on(GetItemCommand, { TableName: "examination-interview-questions" }).resolves({
      Item: { questionId: { S: "q1" }, category: { S: "本人面接" }, createdBy: { S: "line-bot" } },
    });
    ddbMock.on(PutItemCommand).resolves({});

    const response = await handler(
      event("PUT", {
        body: JSON.stringify({ questionId: "q1", targetPerson: "本人", question: "更新後の質問", answer: "更新後の回答" }),
      })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).question).toMatchObject({ questionId: "q1", question: "更新後の質問" });
  });

  it("returns 405 for an unsupported method", async () => {
    const response = await handler(event("DELETE"));
    expect(response.statusCode).toBe(405);
  });
});
