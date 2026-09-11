import { describe, it, expect } from "vitest";
import { ROLE_DESCRIPTIONS, DEFAULT_SITUATION, sanitizeFreeText, buildSystemPrompt, parseDualReply } from "./geminiConversation.js";

// postJson・callGemini・summarizeMockInterviewはNode組み込みのhttpsモジュールを
// requireで直接呼び出す。CommonJS requireで読み込まれるモジュールはvi.mockによる
// 差し替えが効かないことを確認済み（notifyFamilyCreated.test.jsのコメント参照）ため、
// 純粋関数（sanitizeFreeText・buildSystemPrompt・parseDualReply）のみを対象とする

describe("ROLE_DESCRIPTIONS / DEFAULT_SITUATION", () => {
  it("has descriptions for 本人・父・母", () => {
    expect(ROLE_DESCRIPTIONS).toEqual({
      本人: expect.any(String),
      父: expect.any(String),
      母: expect.any(String),
    });
  });

  it("defaults the situation to 小学校受験の面接", () => {
    expect(DEFAULT_SITUATION).toBe("小学校受験の面接");
  });
});

describe("sanitizeFreeText", () => {
  it("returns the fallback for a non-string value", () => {
    expect(sanitizeFreeText(undefined, "fallback")).toBe("fallback");
    expect(sanitizeFreeText(null, "fallback")).toBe("fallback");
    expect(sanitizeFreeText(123, "fallback")).toBe("fallback");
  });

  it("returns the fallback when the trimmed value is empty", () => {
    expect(sanitizeFreeText("   ", "fallback")).toBe("fallback");
  });

  it("trims whitespace", () => {
    expect(sanitizeFreeText("  こんにちは  ", "fallback")).toBe("こんにちは");
  });

  it("truncates to 200 characters", () => {
    const long = "あ".repeat(250);
    expect(sanitizeFreeText(long, "fallback")).toHaveLength(200);
  });
});

describe("buildSystemPrompt", () => {
  it("includes the role description and situation", () => {
    const prompt = buildSystemPrompt({ role: "本人", situation: "小学校受験の面接" });
    expect(prompt).toContain("小学校受験の面接の面接官です");
    expect(prompt).toContain(ROLE_DESCRIPTIONS["本人"]);
  });

  it("includes schoolCharacteristics only when provided", () => {
    const withCharacteristics = buildSystemPrompt({ role: "本人", situation: "s", schoolCharacteristics: "自然が多い" });
    expect(withCharacteristics).toContain("自然が多い");

    const without = buildSystemPrompt({ role: "本人", situation: "s" });
    expect(without).not.toContain("志望先の特色は次の通りです");
  });

  it("includes otherContext only when provided", () => {
    const withContext = buildSystemPrompt({ role: "父", situation: "s", otherContext: "共働き家庭" });
    expect(withContext).toContain("共働き家庭");
  });

  it("embeds existingQuestions when provided, falling back to a generic prompt otherwise", () => {
    const withQuestions = buildSystemPrompt({
      role: "本人",
      situation: "s",
      existingQuestions: [{ question: "好きな食べ物は？", answer: "お寿司です" }],
    });
    expect(withQuestions).toContain("好きな食べ物は？（想定回答: お寿司です）");

    const withoutQuestions = buildSystemPrompt({ role: "本人", situation: "s" });
    expect(withoutQuestions).toContain("志望動機、家庭の様子");
  });

  it("omits the answer note when a pre-registered question has no answer", () => {
    const prompt = buildSystemPrompt({
      role: "本人",
      situation: "s",
      existingQuestions: [{ question: "好きな遊びは？" }],
    });
    expect(prompt).toContain("- 好きな遊びは？\n");
    expect(prompt).not.toContain("好きな遊びは？（想定回答");
  });
});

describe("parseDualReply", () => {
  it("parses a well-formed dual JSON reply", () => {
    const raw = '{"voice": "こんにちは", "text": "こんにちは、詳しい説明です"}';
    expect(parseDualReply(raw)).toEqual({ voice: "こんにちは", text: "こんにちは、詳しい説明です" });
  });

  it("extracts JSON embedded in surrounding text", () => {
    const raw = 'はい、こちらです：{"voice": "v", "text": "t"} 以上です';
    expect(parseDualReply(raw)).toEqual({ voice: "v", text: "t" });
  });

  it("un-escapes raw newlines inside string values before parsing", () => {
    const raw = '{"voice": "1行目\n2行目", "text": "詳細"}';
    expect(parseDualReply(raw)).toEqual({ voice: "1行目\n2行目", text: "詳細" });
  });

  it("falls back to using the raw text for both fields when JSON parsing fails", () => {
    const raw = "JSON形式ではない普通の文章です";
    expect(parseDualReply(raw)).toEqual({ voice: raw, text: raw });
  });

  it("falls back when the parsed JSON is missing voice/text fields", () => {
    const raw = '{"foo": "bar"}';
    expect(parseDualReply(raw)).toEqual({ voice: raw, text: raw });
  });
});
