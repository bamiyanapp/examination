import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InterviewQuestions from "./InterviewQuestions.jsx";

const SAMPLE_QUESTIONS = [
  {
    questionId: "q1",
    category: "父の保護者面接",
    targetPerson: "父",
    question: "志望理由を教えてください。",
    answer: "教育方針への共感です。",
    example: "学校見学での体験。",
    impression: "説得力がある。",
    modelAnswer: "",
  },
  {
    questionId: "q2",
    category: "母の保護者面接",
    targetPerson: "母",
    question: "お子さんの長所は何ですか。",
    answer: "好奇心が旺盛なところです。",
    example: "",
    impression: "",
    modelAnswer: "",
  },
  {
    questionId: "q3",
    category: "本人面接",
    targetPerson: "本人",
    question: "好きな遊びは何ですか。",
    answer: "公園でおにごっこをすることです。",
    example: "",
    impression: "",
    modelAnswer: "",
  },
];

beforeEach(() => {
  global.fetch = vi.fn();
  sessionStorage.clear();
});

function mockTokenAndQuestions(questions) {
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ questions }) });
}

describe("InterviewQuestions", () => {
  it("issues a token and fetches all questions on mount", async () => {
    mockTokenAndQuestions(SAMPLE_QUESTIONS);

    render(<InterviewQuestions />);

    await waitFor(() => {
      expect(screen.getByText("志望理由を教えてください。")).toBeInTheDocument();
    });
    expect(screen.getByText("お子さんの長所は何ですか。")).toBeInTheDocument();
    expect(screen.getByText("好きな遊びは何ですか。")).toBeInTheDocument();
    expect(screen.getByText("3件")).toBeInTheDocument();

    expect(global.fetch).toHaveBeenNthCalledWith(1, "/_voice-token", { method: "POST" });
    const secondCall = global.fetch.mock.calls[1];
    expect(secondCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/interview-questions");
    expect(secondCall[1].headers.Authorization).toBe("Bearer voice-token");
  });

  it("filters questions by target person without splitting into separate pages", async () => {
    mockTokenAndQuestions(SAMPLE_QUESTIONS);
    render(<InterviewQuestions />);
    await waitFor(() => screen.getByText("志望理由を教えてください。"));

    fireEvent.click(screen.getByRole("button", { name: "父" }));

    expect(screen.getByText("志望理由を教えてください。")).toBeInTheDocument();
    expect(screen.queryByText("お子さんの長所は何ですか。")).not.toBeInTheDocument();
    expect(screen.queryByText("好きな遊びは何ですか。")).not.toBeInTheDocument();
    expect(screen.getByText("1件")).toBeInTheDocument();
  });

  it("shows all questions again when switching the filter back to すべて", async () => {
    mockTokenAndQuestions(SAMPLE_QUESTIONS);
    render(<InterviewQuestions />);
    await waitFor(() => screen.getByText("志望理由を教えてください。"));

    fireEvent.click(screen.getByRole("button", { name: "母" }));
    expect(screen.getByText("1件")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "すべて" }));
    expect(screen.getByText("3件")).toBeInTheDocument();
  });

  it("shows an error message when token issuance fails", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "アクセスが許可されていません" }) });

    render(<InterviewQuestions />);

    await waitFor(() => {
      expect(screen.getByText("アクセスが許可されていません")).toBeInTheDocument();
    });
  });

  it("shows an error message when fetching questions fails", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "サーバーエラー" }) });

    render(<InterviewQuestions />);

    await waitFor(() => {
      expect(screen.getByText("サーバーエラー")).toBeInTheDocument();
    });
  });

  it("adds a new question via the form and shows it in the list (examination#165)", async () => {
    mockTokenAndQuestions(SAMPLE_QUESTIONS);
    render(<InterviewQuestions />);
    await waitFor(() => screen.getByText("志望理由を教えてください。"));

    fireEvent.click(screen.getByRole("button", { name: "質問を追加" }));
    fireEvent.change(screen.getByLabelText("質問:"), { target: { value: "得意科目は何ですか。" } });
    fireEvent.change(screen.getByLabelText("回答の要点:"), { target: { value: "算数が得意です。" } });

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token-2" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          question: {
            questionId: "q4",
            category: "本人面接",
            targetPerson: "本人",
            question: "得意科目は何ですか。",
            answer: "算数が得意です。",
            example: "",
            impression: "",
            modelAnswer: "",
          },
        }),
      });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("4件")).toBeInTheDocument());
    expect(screen.getByText("得意科目は何ですか。")).toBeInTheDocument();
    const postCall = global.fetch.mock.calls.at(-1);
    expect(postCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/interview-questions");
    expect(postCall[1].method).toBe("POST");
    const sentBody = JSON.parse(postCall[1].body);
    expect(sentBody.targetPerson).toBe("本人");
    expect(sentBody.question).toBe("得意科目は何ですか。");
    expect(sentBody.questionId).toBeUndefined();
  });

  it("edits an existing question via the form and updates the list (examination#165)", async () => {
    mockTokenAndQuestions(SAMPLE_QUESTIONS);
    render(<InterviewQuestions />);
    await waitFor(() => screen.getByText("志望理由を教えてください。"));

    fireEvent.click(screen.getAllByRole("button", { name: "編集" })[0]);
    expect(screen.getByLabelText("質問:")).toHaveValue("志望理由を教えてください。");
    fireEvent.change(screen.getByLabelText("回答の要点:"), { target: { value: "更新後の回答です。" } });

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token-2" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          question: { ...SAMPLE_QUESTIONS[0], answer: "更新後の回答です。" },
        }),
      });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("更新後の回答です。")).toBeInTheDocument());
    const putCall = global.fetch.mock.calls.at(-1);
    expect(putCall[1].method).toBe("PUT");
    expect(JSON.parse(putCall[1].body).questionId).toBe("q1");
  });

  it("shows an error inside the form when saving fails, without closing it", async () => {
    mockTokenAndQuestions(SAMPLE_QUESTIONS);
    render(<InterviewQuestions />);
    await waitFor(() => screen.getByText("志望理由を教えてください。"));

    fireEvent.click(screen.getByRole("button", { name: "質問を追加" }));
    fireEvent.change(screen.getByLabelText("質問:"), { target: { value: "得意科目は何ですか。" } });
    fireEvent.change(screen.getByLabelText("回答の要点:"), { target: { value: "算数が得意です。" } });

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token-2" }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "questionは必須です" }) });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("questionは必須です")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("resizes a textarea to fit its content on input (examination#165)", async () => {
    mockTokenAndQuestions(SAMPLE_QUESTIONS);
    render(<InterviewQuestions />);
    await waitFor(() => screen.getByText("志望理由を教えてください。"));

    fireEvent.click(screen.getByRole("button", { name: "質問を追加" }));
    const textarea = screen.getByLabelText("質問:");
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 120 });

    fireEvent.input(textarea, { target: { value: "1行目\n2行目\n3行目" } });

    expect(textarea.style.height).toBe("120px");
  });

  it("resizes an existing question's textarea to fit its content when opening the edit form (examination#165)", async () => {
    mockTokenAndQuestions(SAMPLE_QUESTIONS);
    render(<InterviewQuestions />);
    await waitFor(() => screen.getByText("志望理由を教えてください。"));

    fireEvent.click(screen.getAllByRole("button", { name: "編集" })[0]);

    const textarea = screen.getByLabelText("質問:");
    expect(textarea.style.height).not.toBe("");
  });

  it("shows cached questions immediately (dimmed) instead of a spinner when a previous fetch was cached (examination#167)", async () => {
    sessionStorage.setItem("examination-interview-questions-cache", JSON.stringify(SAMPLE_QUESTIONS));
    mockTokenAndQuestions(SAMPLE_QUESTIONS);

    render(<InterviewQuestions />);

    // キャッシュがあるため、スピナーのみの「読み込み中...」ではなく、
    // 古いデータ自体が最初から（薄く）表示される
    expect(screen.getByText("志望理由を教えてください。")).toBeInTheDocument();
    expect(screen.getByText("最新の情報を確認しています...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("最新の情報を確認しています...")).not.toBeInTheDocument();
    });
    expect(screen.getByText("志望理由を教えてください。")).toBeInTheDocument();
  });

  it("keeps showing cached questions with a non-blocking warning when the background refresh fails (examination#167)", async () => {
    sessionStorage.setItem("examination-interview-questions-cache", JSON.stringify(SAMPLE_QUESTIONS));
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "サーバーエラー" }) });

    render(<InterviewQuestions />);

    expect(screen.getByText("志望理由を教えてください。")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("最新の情報を取得できませんでした: サーバーエラー")).toBeInTheDocument();
    });
    // 再取得に失敗しても、古いキャッシュの内容は表示され続ける
    expect(screen.getByText("志望理由を教えてください。")).toBeInTheDocument();
  });

  it("caches fetched questions for the next mount (examination#167)", async () => {
    mockTokenAndQuestions(SAMPLE_QUESTIONS);
    render(<InterviewQuestions />);

    await waitFor(() => screen.getByText("志望理由を教えてください。"));

    expect(JSON.parse(sessionStorage.getItem("examination-interview-questions-cache"))).toEqual(SAMPLE_QUESTIONS);
  });
});
