import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { getFamilyProfile, saveFamilyProfile } from "./familyProfile.js";

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

describe("getFamilyProfile", () => {
  it("returns the default situation and empty fields when no profile exists yet", async () => {
    ddbMock.on(GetItemCommand).resolves({});

    const profile = await getFamilyProfile("tanaka");

    expect(profile).toEqual({ situation: "小学校受験の面接", schoolCharacteristics: "", otherContext: "" });
  });

  it("returns the saved profile fields", async () => {
    ddbMock.on(GetItemCommand).resolves({
      Item: {
        situation: { S: "お受験理由" },
        schoolCharacteristics: { S: "自然が多い" },
        otherContext: { S: "共働き家庭" },
      },
    });

    const profile = await getFamilyProfile("tanaka");

    expect(profile).toEqual({ situation: "お受験理由", schoolCharacteristics: "自然が多い", otherContext: "共働き家庭" });
    const call = ddbMock.commandCalls(GetItemCommand)[0];
    expect(call.args[0].input).toEqual({
      TableName: "examination-family-profile",
      Key: { familySlug: { S: "tanaka" } },
    });
  });

  it("falls back to the default situation when the saved situation is empty", async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: {} });

    const profile = await getFamilyProfile("tanaka");

    expect(profile.situation).toBe("小学校受験の面接");
  });
});

describe("saveFamilyProfile", () => {
  it("puts an item with the given fields", async () => {
    ddbMock.on(PutItemCommand).resolves({});

    await saveFamilyProfile({
      familySlug: "tanaka",
      situation: "お受験理由",
      schoolCharacteristics: "自然が多い",
      otherContext: "共働き家庭",
      updatedBy: "family@example.com",
    });

    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input).toMatchObject({
      TableName: "examination-family-profile",
      Item: expect.objectContaining({
        familySlug: { S: "tanaka" },
        situation: { S: "お受験理由" },
        schoolCharacteristics: { S: "自然が多い" },
        otherContext: { S: "共働き家庭" },
        updatedBy: { S: "family@example.com" },
      }),
    });
  });

  it("defaults empty/missing fields (situation to the default, others to empty strings)", async () => {
    ddbMock.on(PutItemCommand).resolves({});

    await saveFamilyProfile({ familySlug: "tanaka" });

    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input.Item).toMatchObject({
      situation: { S: "小学校受験の面接" },
      schoolCharacteristics: { S: "" },
      otherContext: { S: "" },
      updatedBy: { S: "" },
    });
  });
});
