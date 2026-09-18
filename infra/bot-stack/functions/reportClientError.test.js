import { describe, it, expect, vi, afterEach } from "vitest";
import { handler } from "./reportClientError.js";

function event(method, body) {
  return {
    requestContext: { http: { method } },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

describe("reportClientError handler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 405 for a non-POST method", async () => {
    const response = await handler(event("GET"));
    expect(response.statusCode).toBe(405);
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await handler({ requestContext: { http: { method: "POST" } }, body: "not json" });
    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when message is missing", async () => {
    const response = await handler(event("POST", { stack: "at foo" }));
    expect(response.statusCode).toBe(400);
  });

  it("logs the payload and returns 200 for a valid report", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await handler(
      event("POST", {
        message: "Cannot read properties of undefined",
        stack: "at App (App.tsx:10)",
        componentStack: "in App",
        url: "https://examination.example.com/top/",
      })
    );

    expect(response.statusCode).toBe(200);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ClientError]",
      expect.objectContaining({ message: "Cannot read properties of undefined" })
    );
  });
});
