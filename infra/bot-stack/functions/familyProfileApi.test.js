import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { handler } from "./familyProfileApi.js";

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

function authorizedRequest() {
  const validExpiresAt = Math.floor(Date.now() / 1000) + 3600;
  ddbMock
    .on(GetItemCommand, { TableName: "examination-voice-tokens" })
    .resolves({ Item: { email: { S: "family@example.com" }, expiresAt: { N: String(validExpiresAt) } } });
  ddbMock
    .on(GetItemCommand, { TableName: "examination-allowed-emails" })
    .resolves({ Item: { familySlug: { S: "tanaka" } } });
}

function event(method, { authorization = "Bearer valid-token", body } = {}) {
  return {
    requestContext: { http: { method } },
    headers: authorization ? { authorization } : {},
    body,
  };
}

describe("familyProfileApi handler", () => {
  it("returns 403 when the caller is not authenticated", async () => {
    const response = await handler(event("GET", { authorization: null }));
    expect(response.statusCode).toBe(403);
  });

  it("returns the family profile on GET", async () => {
    authorizedRequest();
    ddbMock.on(GetItemCommand, { TableName: "examination-family-profile" }).resolves({
      Item: {
        situation: { S: "お受験理由" },
        schoolCharacteristics: { S: "" },
        otherContext: { S: "" },
        childName: { S: "たろう" },
        fatherName: { S: "" },
        motherName: { S: "" },
      },
    });

    const response = await handler(event("GET"));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      situation: "お受験理由",
      schoolCharacteristics: "",
      otherContext: "",
      childName: "たろう",
      fatherName: "",
      motherName: "",
    });
  });

  it("returns 400 on POST with invalid JSON", async () => {
    authorizedRequest();

    const response = await handler(event("POST", { body: "{invalid" }));

    expect(response.statusCode).toBe(400);
  });

  it("saves the sanitized profile on POST and echoes it back", async () => {
    authorizedRequest();
    ddbMock.on(PutItemCommand).resolves({});

    const response = await handler(
      event("POST", {
        body: JSON.stringify({
          situation: "  お受験理由  ",
          schoolCharacteristics: "自然が多い",
          childName: " たろう ",
          fatherName: "はなお",
          motherName: "はなこ",
        }),
      })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      situation: "お受験理由",
      schoolCharacteristics: "自然が多い",
      otherContext: "",
      childName: "たろう",
      fatherName: "はなお",
      motherName: "はなこ",
    });
    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input.Item).toMatchObject({
      familySlug: { S: "tanaka" },
      situation: { S: "お受験理由" },
      schoolCharacteristics: { S: "自然が多い" },
      childName: { S: "たろう" },
      fatherName: { S: "はなお" },
      motherName: { S: "はなこ" },
      updatedBy: { S: "family@example.com" },
    });
  });

  it("falls back to the default situation when it is blank after trimming", async () => {
    authorizedRequest();
    ddbMock.on(PutItemCommand).resolves({});

    const response = await handler(event("POST", { body: JSON.stringify({ situation: "   " }) }));

    expect(JSON.parse(response.body).situation).toBe("小学校受験の面接");
  });

  it("returns 405 for an unsupported method", async () => {
    authorizedRequest();

    const response = await handler(event("DELETE"));

    expect(response.statusCode).toBe(405);
  });
});
