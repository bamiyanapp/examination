import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { verifyBearerEmail } from "./apiAuth.js";

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

function eventWithAuthHeader(headerValue) {
  return { headers: headerValue === undefined ? {} : { authorization: headerValue } };
}

describe("verifyBearerEmail", () => {
  it("returns null when the Authorization header is missing", async () => {
    expect(await verifyBearerEmail({ headers: {} })).toBeNull();
    expect(await verifyBearerEmail({})).toBeNull();
  });

  it("returns null when the Authorization header does not use the Bearer scheme", async () => {
    expect(await verifyBearerEmail(eventWithAuthHeader("Basic xxxxx"))).toBeNull();
  });

  it("returns null when the token does not exist in examination-voice-tokens", async () => {
    ddbMock.on(GetItemCommand, { TableName: "examination-voice-tokens" }).resolves({});
    expect(await verifyBearerEmail(eventWithAuthHeader("Bearer no-such-token"))).toBeNull();
  });

  it("returns null when the token has already expired", async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    ddbMock
      .on(GetItemCommand, { TableName: "examination-voice-tokens" })
      .resolves({ Item: { email: { S: "family@example.com" }, expiresAt: { N: String(expiredAt) } } });
    expect(await verifyBearerEmail(eventWithAuthHeader("Bearer expired-token"))).toBeNull();
  });

  it("returns null when the token's email is not on the allow-list", async () => {
    const validExpiresAt = Math.floor(Date.now() / 1000) + 3600;
    ddbMock
      .on(GetItemCommand, { TableName: "examination-voice-tokens" })
      .resolves({ Item: { email: { S: "family@example.com" }, expiresAt: { N: String(validExpiresAt) } } });
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});
    expect(await verifyBearerEmail(eventWithAuthHeader("Bearer valid-token"))).toBeNull();
  });

  it("returns the email and familySlug when the token is valid and allow-listed", async () => {
    const validExpiresAt = Math.floor(Date.now() / 1000) + 3600;
    ddbMock
      .on(GetItemCommand, { TableName: "examination-voice-tokens" })
      .resolves({ Item: { email: { S: "family@example.com" }, expiresAt: { N: String(validExpiresAt) } } });
    ddbMock
      .on(GetItemCommand, { TableName: "examination-allowed-emails" })
      .resolves({ Item: { familySlug: { S: "tanaka" } } });

    const result = await verifyBearerEmail(eventWithAuthHeader("Bearer valid-token"));

    expect(result).toEqual({ email: "family@example.com", familySlug: "tanaka" });
  });

  it("defaults familySlug to an empty string when the allow-list record has none", async () => {
    const validExpiresAt = Math.floor(Date.now() / 1000) + 3600;
    ddbMock
      .on(GetItemCommand, { TableName: "examination-voice-tokens" })
      .resolves({ Item: { email: { S: "family@example.com" }, expiresAt: { N: String(validExpiresAt) } } });
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });

    const result = await verifyBearerEmail(eventWithAuthHeader("Bearer valid-token"));

    expect(result).toEqual({ email: "family@example.com", familySlug: "" });
  });
});
