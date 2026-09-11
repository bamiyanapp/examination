import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, PutItemCommand, QueryCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  deriveTargetPerson,
  saveQuestion,
  queryQuestionsByTargetPerson,
  applyReconciliationResults,
  createQuestion,
  updateQuestion,
} from "./interviewQuestionsStore.js";

const ddbMock = mockClient(DynamoDBClient);
const TABLE = "examination-interview-questions";

beforeEach(() => {
  ddbMock.reset();
});

describe("deriveTargetPerson", () => {
  it.each([
    ["本人面接", "本人"],
    ["父の保護者面接", "父"],
    ["母の保護者面接", "母"],
  ])("maps %s to %s", (category, expected) => {
    expect(deriveTargetPerson(category)).toBe(expected);
  });

  it("returns an empty string for an unknown category", () => {
    expect(deriveTargetPerson("unknown")).toBe("");
  });
});

describe("saveQuestion", () => {
  it("puts an item deriving targetPerson from the category and returns a generated questionId", async () => {
    ddbMock.on(PutItemCommand).resolves({});

    const questionId = await saveQuestion({
      familySlug: "tanaka",
      category: "本人面接",
      question: "好きな食べ物は？",
      answer: "お寿司です",
      createdBy: "line-bot",
    });

    expect(questionId).toEqual(expect.any(String));
    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input).toMatchObject({
      TableName: TABLE,
      Item: expect.objectContaining({
        familySlug: { S: "tanaka" },
        category: { S: "本人面接" },
        targetPerson: { S: "本人" },
        question: { S: "好きな食べ物は？" },
        answer: { S: "お寿司です" },
        createdBy: { S: "line-bot" },
      }),
    });
  });
});

describe("queryQuestionsByTargetPerson", () => {
  it("queries by familySlug and filters by targetPerson, mapping items", async () => {
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

    const questions = await queryQuestionsByTargetPerson("本人", "tanaka");

    expect(questions).toEqual([
      {
        questionId: "q1",
        category: "本人面接",
        targetPerson: "本人",
        question: "好きな食べ物は？",
        answer: "お寿司です",
        example: "",
        impression: "",
        modelAnswer: "",
        createdBy: "",
        createdAt: "",
      },
    ]);
    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input).toMatchObject({
      TableName: TABLE,
      KeyConditionExpression: "familySlug = :slug",
      FilterExpression: "targetPerson = :targetPerson",
      ExpressionAttributeValues: { ":slug": { S: "tanaka" }, ":targetPerson": { S: "本人" } },
    });
  });

  it("returns an empty array when there are no items", async () => {
    ddbMock.on(QueryCommand).resolves({});
    expect(await queryQuestionsByTargetPerson("本人", "tanaka")).toEqual([]);
  });
});

describe("applyReconciliationResults", () => {
  it("skips items whose shouldPersist is false", async () => {
    await applyReconciliationResults([{ shouldPersist: false, question: "x" }], "本人", [], "tanaka");
    expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it("skips a matched item when shouldUpdateModelAnswer is false", async () => {
    const existingQuestions = [{ questionId: "q1", category: "本人面接" }];
    await applyReconciliationResults(
      [{ shouldPersist: true, matchedQuestionId: "q1", shouldUpdateModelAnswer: false }],
      "本人",
      existingQuestions,
      "tanaka"
    );
    expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it("skips a matched item when the AI hallucinated an id not present in existingQuestions", async () => {
    await applyReconciliationResults(
      [{ shouldPersist: true, matchedQuestionId: "no-such-id", shouldUpdateModelAnswer: true }],
      "本人",
      [{ questionId: "q1" }],
      "tanaka"
    );
    expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it("writes back the existing item with the updated modelAnswer/impression when matched", async () => {
    ddbMock.on(PutItemCommand).resolves({});
    const existingQuestions = [
      {
        questionId: "q1",
        category: "本人面接",
        targetPerson: "本人",
        question: "好きな食べ物は？",
        answer: "お寿司です",
        example: "",
        createdBy: "line-bot",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    await applyReconciliationResults(
      [
        {
          shouldPersist: true,
          matchedQuestionId: "q1",
          shouldUpdateModelAnswer: true,
          modelAnswer: "はきはきと回答できた",
          impression: "良い",
        },
      ],
      "本人",
      existingQuestions,
      "tanaka"
    );

    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input.Item).toMatchObject({
      questionId: { S: "q1" },
      modelAnswer: { S: "はきはきと回答できた" },
      impression: { S: "良い" },
    });
  });

  it("skips a new (unmatched) item without a question", async () => {
    await applyReconciliationResults([{ shouldPersist: true }], "本人", [], "tanaka");
    expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0);
  });

  it("creates a new item for an unmatched result with a question", async () => {
    ddbMock.on(PutItemCommand).resolves({});

    await applyReconciliationResults(
      [{ shouldPersist: true, question: "新しい質問", answer: "回答", modelAnswer: "模範解答", impression: "良い" }],
      "本人",
      [],
      "tanaka"
    );

    const call = ddbMock.commandCalls(PutItemCommand)[0];
    expect(call.args[0].input.Item).toMatchObject({
      familySlug: { S: "tanaka" },
      category: { S: "本人面接" },
      targetPerson: { S: "本人" },
      question: { S: "新しい質問" },
      answer: { S: "回答" },
      createdBy: { S: "practice" },
    });
  });

  it("processes an empty/undefined items list without error", async () => {
    await expect(applyReconciliationResults(undefined, "本人", [], "tanaka")).resolves.toBeUndefined();
  });
});

describe("createQuestion / updateQuestion", () => {
  it("creates a question and returns it via toQuestionItem shape", async () => {
    ddbMock.on(PutItemCommand).resolves({});

    const created = await createQuestion({
      familySlug: "tanaka",
      targetPerson: "本人",
      question: "好きな遊びは？",
      answer: "鬼ごっこです",
      createdBy: "family@example.com",
    });

    expect(created).toMatchObject({
      category: "本人面接",
      targetPerson: "本人",
      question: "好きな遊びは？",
      answer: "鬼ごっこです",
      createdBy: "family@example.com",
    });
  });

  it("updates an existing question, preserving createdBy/createdAt", async () => {
    ddbMock.on(GetItemCommand).resolves({
      Item: {
        questionId: { S: "q1" },
        category: { S: "本人面接" },
        createdBy: { S: "original-creator" },
        createdAt: { S: "2026-01-01T00:00:00.000Z" },
      },
    });
    ddbMock.on(PutItemCommand).resolves({});

    const updated = await updateQuestion({
      questionId: "q1",
      familySlug: "tanaka",
      targetPerson: "本人",
      question: "更新後の質問",
      answer: "更新後の回答",
    });

    expect(updated).toMatchObject({
      questionId: "q1",
      question: "更新後の質問",
      createdBy: "original-creator",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns null when updating a question that does not exist", async () => {
    ddbMock.on(GetItemCommand).resolves({});

    const updated = await updateQuestion({ questionId: "no-such-id", familySlug: "tanaka", targetPerson: "本人" });

    expect(updated).toBeNull();
    expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0);
  });
});
