import { describe, it, expect } from "vitest";
import { jsonResponse, checkInternalApiAuth } from "./internalApi.js";

describe("jsonResponse", () => {
  it("ステータスコード・JSON文字列化されたボディを返す", () => {
    const res = jsonResponse(200, { ok: true });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(res.body).toBe(JSON.stringify({ ok: true }));
  });
});

describe("checkInternalApiAuth", () => {
  it("POST以外は405を返す", () => {
    const event = { requestContext: { http: { method: "GET" } }, headers: {} };
    const result = checkInternalApiAuth(event, { internalApiSecret: "secret" });
    expect(result.statusCode).toBe(405);
  });

  it("シークレット不一致は403を返す", () => {
    const event = { requestContext: { http: { method: "POST" } }, headers: { "x-internal-secret": "wrong" } };
    const result = checkInternalApiAuth(event, { internalApiSecret: "secret" });
    expect(result.statusCode).toBe(403);
  });

  it("internalApiSecret未設定時も403を返す", () => {
    const event = { requestContext: { http: { method: "POST" } }, headers: { "x-internal-secret": "secret" } };
    const result = checkInternalApiAuth(event, {});
    expect(result.statusCode).toBe(403);
  });

  it("検証を通過した場合はnullを返す", () => {
    const event = { requestContext: { http: { method: "POST" } }, headers: { "x-internal-secret": "secret" } };
    const result = checkInternalApiAuth(event, { internalApiSecret: "secret" });
    expect(result).toBeNull();
  });
});
