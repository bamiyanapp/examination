import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  DeleteItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { EventEmitter } from "events";

// checkAuth.jsは`jose`（jwtVerify・createRemoteJWKSet）とNode組み込みの`https`を
// requireで直接呼び出す。これらはいずれもCommonJSモジュールで、vi.mockによる
// モジュール差し替えは効かない（examination#401のnotifyFamilyCreated.test.js等で
// 確認済み）。一方、requireで取得した実際のモジュールオブジェクトへ
// Object.definePropertyで直接プロパティを上書きする方式は、checkAuth.js自身の
// requireが同じNodeモジュールキャッシュを参照するため機能することを確認できた
// （プロトタイプ・オブジェクトを直接書き換えるaws-sdk-client-mockと同じ原理）。
// jose.jwtVerifyはgetter-onlyのプロパティとしてexportされているため、単純な
// 代入（jose.jwtVerify = fn）ではなくObject.definePropertyで再定義する必要がある
const ddbMock = mockClient(DynamoDBClient);

const jose = require("jose");
const jwtVerifyMock = vi.fn();
Object.defineProperty(jose, "jwtVerify", { value: jwtVerifyMock, writable: true, configurable: true });

const https = require("https");
const httpsRequestMock = vi.fn();
Object.defineProperty(https, "request", { value: httpsRequestMock, writable: true, configurable: true });

// checkAuth.jsはemailごとの許可判定を15秒TTLでモジュール内（allowCache、
// モジュールスコープのMap）にキャッシュする。requireを使い回すとテスト間で
// このキャッシュが漏れて汚染される（あるテストで「未許可」とキャッシュされた
// メールアドレスを、別のテストが「許可済み」の想定で使うと汚染された結果を
// 読んでしまう）ため、テストごとにrequireキャッシュを破棄して再requireし、
// allowCache等のモジュール内部状態を毎回まっさらな状態に戻す
let handler;
beforeEach(() => {
  delete require.cache[require.resolve("./checkAuth.js")];
  handler = require("./checkAuth.js").handler;
});

beforeEach(() => {
  ddbMock.reset();
  jwtVerifyMock.mockReset();
  httpsRequestMock.mockReset();
});

function cfEvent({ uri, method = "GET", cookie, headers = {}, body }) {
  const allHeaders = {
    host: [{ key: "Host", value: "example.com" }],
    ...headers,
  };
  if (cookie) {
    allHeaders.cookie = [{ key: "Cookie", value: cookie }];
  }
  const request = { uri, method, headers: allHeaders };
  if (body !== undefined) {
    request.body = { data: body, encoding: "text" };
  }
  return { Records: [{ cf: { request } }] };
}

function authenticatedCookie() {
  return "id_token=fake.jwt.token";
}

function mockValidToken(payload = { email: "family@example.com" }) {
  jwtVerifyMock.mockResolvedValue({ payload });
}

function mockInvalidToken() {
  jwtVerifyMock.mockRejectedValue(new Error("invalid signature"));
}

// https.requestを呼び出し元へすぐ指定のレスポンス（statusCode・bodyチャンク）を
// 返すよう差し替える。postForm（/_callback・refresh_token交換）・
// notifyFamilyCreated・deleteFamilyDataRemoteのいずれのシグネチャにも対応する
function mockHttpsResponse({ statusCode = 200, body = "{}" } = {}) {
  httpsRequestMock.mockImplementation((_options, callback) => {
    const res = new EventEmitter();
    res.statusCode = statusCode;
    res.resume = vi.fn();
    const req = new EventEmitter();
    req.end = vi.fn(() => {
      if (callback) callback(res);
      queueMicrotask(() => {
        res.emit("data", Buffer.from(body));
        res.emit("end");
      });
    });
    return req;
  });
}

function mockHttpsError(message = "network error") {
  httpsRequestMock.mockImplementation(() => {
    const req = new EventEmitter();
    req.end = vi.fn(() => {
      queueMicrotask(() => req.emit("error", new Error(message)));
    });
    return req;
  });
}

describe("checkAuth handler: /_logout, /_logout-complete", () => {
  it("expires cookies and redirects to Cognito logout for /_logout", async () => {
    const result = await handler(cfEvent({ uri: "/_logout" }));

    expect(result.status).toBe("302");
    expect(result.headers.location[0].value).toContain("/logout?");
    expect(result.headers["set-cookie"]).toEqual([
      expect.objectContaining({ value: expect.stringContaining("id_token=; Path=/") }),
      expect.objectContaining({ value: expect.stringContaining("refresh_token=; Path=/") }),
    ]);
  });

  it("returns the logout-relay HTML for /_logout-complete", async () => {
    const result = await handler(cfEvent({ uri: "/_logout-complete" }));

    expect(result.status).toBe("200");
    expect(result.body).toContain("accounts.google.com/Logout");
  });
});

describe("checkAuth handler: /_me", () => {
  it("returns 405 for a non-GET method", async () => {
    const result = await handler(cfEvent({ uri: "/_me", method: "POST" }));
    expect(result.status).toBe("405");
  });

  it("returns 403 when there is no id_token cookie", async () => {
    const result = await handler(cfEvent({ uri: "/_me" }));
    expect(result.status).toBe("403");
  });

  it("returns 403 when the id_token signature is invalid", async () => {
    mockInvalidToken();
    const result = await handler(cfEvent({ uri: "/_me", cookie: authenticatedCookie() }));
    expect(result.status).toBe("403");
  });

  it("returns 403 when the email is not allow-listed", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});

    const result = await handler(cfEvent({ uri: "/_me", cookie: authenticatedCookie() }));

    expect(result.status).toBe("403");
  });

  it("returns the caller's profile fields on success", async () => {
    mockValidToken({ email: "family@example.com", name: "たなか", picture: "https://example.com/p.png" });
    ddbMock
      .on(GetItemCommand, { TableName: "examination-allowed-emails" })
      .resolves({ Item: { familySlug: { S: "tanaka" } } });

    const result = await handler(cfEvent({ uri: "/_me", cookie: authenticatedCookie() }));

    expect(result.status).toBe("200");
    expect(JSON.parse(result.body)).toEqual({
      email: "family@example.com",
      name: "たなか",
      picture: "https://example.com/p.png",
    });
  });

  it("defaults name/picture to empty strings when absent from the token", async () => {
    mockValidToken({ email: "family@example.com" });
    ddbMock
      .on(GetItemCommand, { TableName: "examination-allowed-emails" })
      .resolves({ Item: { familySlug: { S: "tanaka" } } });

    const result = await handler(cfEvent({ uri: "/_me", cookie: authenticatedCookie() }));

    expect(JSON.parse(result.body)).toEqual({ email: "family@example.com", name: "", picture: "" });
  });
});

describe("checkAuth handler: /_admin/emails", () => {
  beforeEach(() => {
    mockValidToken({ email: "family@example.com" });
    ddbMock
      .on(GetItemCommand, { TableName: "examination-allowed-emails" })
      .resolves({ Item: { familySlug: { S: "tanaka" } } });
  });

  it("returns 403 when the requester is not allow-listed", async () => {
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});
    const result = await handler(cfEvent({ uri: "/_admin/emails", cookie: authenticatedCookie() }));
    expect(result.status).toBe("403");
  });

  it("lists the family's allowed emails on GET, sorted", async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { email: { S: "b@example.com" }, addedBy: { S: "a@example.com" }, addedAt: { S: "2026-01-01T00:00:00Z" } },
        { email: { S: "a@example.com" }, addedBy: { S: "" }, addedAt: { S: "2026-01-01T00:00:00Z" } },
      ],
    });

    const result = await handler(cfEvent({ uri: "/_admin/emails", cookie: authenticatedCookie() }));

    expect(result.status).toBe("200");
    expect(JSON.parse(result.body).emails.map((e) => e.email)).toEqual(["a@example.com", "b@example.com"]);
  });

  it("returns 400 on POST with an invalid email", async () => {
    const result = await handler(
      cfEvent({ uri: "/_admin/emails", method: "POST", cookie: authenticatedCookie(), body: JSON.stringify({ email: "not-an-email", action: "add" }) })
    );
    expect(result.status).toBe("400");
  });

  it("returns 400 when action is neither add nor remove", async () => {
    const result = await handler(
      cfEvent({
        uri: "/_admin/emails",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ email: "new@example.com", action: "unknown" }),
      })
    );
    expect(result.status).toBe("400");
  });

  it("rejects adding an email that is already allow-listed elsewhere", async () => {
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });

    const result = await handler(
      cfEvent({
        uri: "/_admin/emails",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ email: "existing@example.com", action: "add" }),
      })
    );

    expect(result.status).toBe("400");
  });

  it("adds a new email and returns the updated list", async () => {
    let allowedEmailAdded = false;
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).callsFake(({ Key }) => {
      if (Key.email.S === "family@example.com") return { Item: { familySlug: { S: "tanaka" } } };
      return allowedEmailAdded ? { Item: {} } : {};
    });
    ddbMock.on(PutItemCommand).callsFake(() => {
      allowedEmailAdded = true;
      return {};
    });
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    const result = await handler(
      cfEvent({
        uri: "/_admin/emails",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ email: "new@example.com", action: "add" }),
      })
    );

    expect(result.status).toBe("200");
    const putCall = ddbMock.commandCalls(PutItemCommand)[0];
    expect(putCall.args[0].input.Item).toMatchObject({
      email: { S: "new@example.com" },
      addedBy: { S: "family@example.com" },
      familySlug: { S: "tanaka" },
    });
  });

  it("returns 404 when removing an email that is not in the requester's family", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    const result = await handler(
      cfEvent({
        uri: "/_admin/emails",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ email: "notmember@example.com", action: "remove" }),
      })
    );

    expect(result.status).toBe("404");
  });

  it("removes another member of the same family", async () => {
    ddbMock
      .on(ScanCommand)
      .resolves({ Items: [{ email: { S: "member@example.com" }, addedBy: { S: "" }, addedAt: { S: "" } }] });
    ddbMock.on(DeleteItemCommand).resolves({});

    const result = await handler(
      cfEvent({
        uri: "/_admin/emails",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ email: "member@example.com", action: "remove" }),
      })
    );

    expect(result.status).toBe("200");
  });

  it("refuses self-removal when other members remain", async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { email: { S: "family@example.com" }, addedBy: { S: "" }, addedAt: { S: "" } },
        { email: { S: "other@example.com" }, addedBy: { S: "" }, addedAt: { S: "" } },
      ],
    });

    const result = await handler(
      cfEvent({
        uri: "/_admin/emails",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ email: "family@example.com", action: "remove" }),
      })
    );

    expect(result.status).toBe("400");
  });

  it("returns 502 when self-removal (last member) fails to delete remote family data", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [{ email: { S: "family@example.com" }, addedBy: { S: "" }, addedAt: { S: "" } }] });
    mockHttpsError();

    const result = await handler(
      cfEvent({
        uri: "/_admin/emails",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ email: "family@example.com", action: "remove" }),
      })
    );

    expect(result.status).toBe("502");
  });

  it("deletes the family (last member self-removal) when the remote data deletion succeeds", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [{ email: { S: "family@example.com" }, addedBy: { S: "" }, addedAt: { S: "" } }] });
    ddbMock.on(DeleteItemCommand).resolves({});
    mockHttpsResponse({ statusCode: 200 });

    const result = await handler(
      cfEvent({
        uri: "/_admin/emails",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ email: "family@example.com", action: "remove" }),
      })
    );

    expect(result.status).toBe("200");
    expect(JSON.parse(result.body)).toEqual({ emails: [], familyDeleted: true });
  });

  it("returns 405 for an unsupported method", async () => {
    const result = await handler(cfEvent({ uri: "/_admin/emails", method: "DELETE", cookie: authenticatedCookie() }));
    expect(result.status).toBe("405");
  });
});

describe("checkAuth handler: /_link-line", () => {
  it("returns 403 when not authenticated", async () => {
    const result = await handler(cfEvent({ uri: "/_link-line", method: "POST" }));
    expect(result.status).toBe("403");
  });

  it("returns 403 when the email is not allow-listed", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});

    const result = await handler(cfEvent({ uri: "/_link-line", method: "POST", cookie: authenticatedCookie() }));

    expect(result.status).toBe("403");
  });

  it("issues a one-time code on POST", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });
    ddbMock.on(PutItemCommand).resolves({});

    const result = await handler(cfEvent({ uri: "/_link-line", method: "POST", cookie: authenticatedCookie() }));

    expect(result.status).toBe("200");
    const body = JSON.parse(result.body);
    expect(body.code).toMatch(/^\d{6}$/);
  });

  it("returns 405 for a non-POST method", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });

    const result = await handler(cfEvent({ uri: "/_link-line", method: "GET", cookie: authenticatedCookie() }));

    expect(result.status).toBe("405");
  });
});

describe("checkAuth handler: /_families", () => {
  it("returns 403 when not authenticated", async () => {
    const result = await handler(cfEvent({ uri: "/_families", method: "POST" }));
    expect(result.status).toBe("403");
  });

  it("returns 405 for a non-POST method", async () => {
    mockValidToken();
    const result = await handler(cfEvent({ uri: "/_families", method: "GET", cookie: authenticatedCookie() }));
    expect(result.status).toBe("405");
  });

  it("returns 400 when already belonging to a family", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });

    const result = await handler(
      cfEvent({ uri: "/_families", method: "POST", cookie: authenticatedCookie(), body: JSON.stringify({ situation: "s" }) })
    );

    expect(result.status).toBe("400");
  });

  it("returns 400 when the situation is blank", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});

    const result = await handler(
      cfEvent({ uri: "/_families", method: "POST", cookie: authenticatedCookie(), body: JSON.stringify({ situation: "   " }) })
    );

    expect(result.status).toBe("400");
  });

  it("creates a family and notifies bot-stack on success", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});
    ddbMock.on(PutItemCommand).resolves({});
    mockHttpsResponse();

    const result = await handler(
      cfEvent({
        uri: "/_families",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ situation: "小学校受験の面接" }),
      })
    );

    expect(result.status).toBe("200");
    const body = JSON.parse(result.body);
    expect(body.slug).toEqual(expect.any(String));
    expect(body.situation).toBe("小学校受験の面接");
    expect(httpsRequestMock).toHaveBeenCalled();
  });

  it("still succeeds even when the notify-family-created call fails (best-effort)", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});
    ddbMock.on(PutItemCommand).resolves({});
    mockHttpsError();

    const result = await handler(
      cfEvent({
        uri: "/_families",
        method: "POST",
        cookie: authenticatedCookie(),
        body: JSON.stringify({ situation: "小学校受験の面接" }),
      })
    );

    expect(result.status).toBe("200");
  });
});

describe("checkAuth handler: /_voice-token", () => {
  it("returns 403 when not authenticated", async () => {
    const result = await handler(cfEvent({ uri: "/_voice-token", method: "POST" }));
    expect(result.status).toBe("403");
  });

  it("returns 429 when the daily issuance limit is reached", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });
    const conditionalError = new Error("conditional check failed");
    conditionalError.name = "ConditionalCheckFailedException";
    ddbMock.on(UpdateItemCommand).rejects(conditionalError);

    const result = await handler(cfEvent({ uri: "/_voice-token", method: "POST", cookie: authenticatedCookie() }));

    expect(result.status).toBe("429");
  });

  it("issues a short-lived token on success", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });
    ddbMock.on(UpdateItemCommand).resolves({});
    ddbMock.on(PutItemCommand).resolves({});

    const result = await handler(cfEvent({ uri: "/_voice-token", method: "POST", cookie: authenticatedCookie() }));

    expect(result.status).toBe("200");
    const body = JSON.parse(result.body);
    expect(body.token).toEqual(expect.any(String));
    expect(body.expiresInSeconds).toEqual(expect.any(Number));
  });
});

describe("checkAuth handler: normal navigation requests", () => {
  it("allows an authenticated, allow-listed request and normalizes the URI", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });

    const result = await handler(cfEvent({ uri: "/settings/", cookie: authenticatedCookie() }));

    // 未認証時のようなstatus/statusDescriptionを持たず、CloudFrontへ渡す
    // requestオブジェクトそのものが返る
    expect(result.status).toBeUndefined();
    expect(result.uri).toBe("/settings/index.html");
  });

  it("passes through the family-create page for an authenticated but not-yet-allowed user", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});

    const result = await handler(cfEvent({ uri: "/family-create/", cookie: authenticatedCookie() }));

    expect(result.status).toBeUndefined();
    expect(result.uri).toBe("/family-create/index.html");
  });

  it("redirects an authenticated but not-yet-allowed user to the family-create page", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});

    const result = await handler(cfEvent({ uri: "/settings/", cookie: authenticatedCookie() }));

    expect(result.status).toBe("302");
    expect(result.headers.location[0].value).toContain("/family-create/");
  });

  it("redirects to the Cognito login screen when unauthenticated (no refresh_token)", async () => {
    ddbMock.on(PutItemCommand).resolves({});

    const result = await handler(cfEvent({ uri: "/settings/" }));

    expect(result.status).toBe("302");
    expect(result.headers.location[0].value).toContain("/oauth2/authorize?");
  });

  it("returns 401 for background precache requests instead of redirecting to login", async () => {
    const result = await handler(
      cfEvent({ uri: "/settings/", headers: { "x-precache-request": [{ key: "X-Precache-Request", value: "1" }] } })
    );

    expect(result.status).toBe("401");
  });

  it("re-issues an id_token via the refresh_token cookie when the id_token is invalid/absent", async () => {
    mockValidToken();
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });
    mockHttpsResponse({ body: JSON.stringify({ id_token: "new.jwt.token", expires_in: 3600 }) });

    const result = await handler(cfEvent({ uri: "/settings/", cookie: "refresh_token=valid-refresh-token" }));

    expect(result.status).toBe("302");
    expect(result.headers["set-cookie"][0].value).toContain("id_token=new.jwt.token");
  });

  it("falls through to the Cognito login screen when the refresh_token itself is invalid", async () => {
    mockHttpsError("invalid_grant");
    ddbMock.on(PutItemCommand).resolves({});

    const result = await handler(cfEvent({ uri: "/settings/", cookie: "refresh_token=expired-refresh-token" }));

    expect(result.status).toBe("302");
    expect(result.headers.location[0].value).toContain("/oauth2/authorize?");
    // 失効したrefresh_tokenは失効させ、無駄な再試行を避ける
    expect(result.headers["set-cookie"][0].value).toContain("refresh_token=;");
  });
});

describe("checkAuth handler: /_callback", () => {
  it("returns 400 when code or state is missing", async () => {
    const result = await handler(cfEvent({ uri: "/_callback" }));
    expect(result.status).toBe("400");
  });

  it("returns 400 when state is not valid base64-encoded JSON", async () => {
    // querystringはcfEvent対象外のためRecords[0].cf.request.querystringを直接設定する
    const event = cfEvent({ uri: "/_callback" });
    event.Records[0].cf.request.querystring = "code=abc&state=not-valid-json-base64";

    const response = await handler(event);

    expect(response.status).toBe("400");
  });

  it("exchanges the code for tokens and redirects to the original URI on success", async () => {
    ddbMock.on(DeleteItemCommand, { TableName: "examination-csrf-nonces" }).resolves({});
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({ Item: {} });
    mockValidToken({ email: "family@example.com" });
    mockHttpsResponse({ body: JSON.stringify({ id_token: "new.jwt.token", refresh_token: "new-refresh", expires_in: 3600 }) });

    const state = Buffer.from(JSON.stringify({ uri: "/settings/", nonce: "abc123" })).toString("base64");
    const event = cfEvent({ uri: "/_callback" });
    event.Records[0].cf.request.querystring = `code=auth-code&state=${encodeURIComponent(state)}`;

    const result = await handler(event);

    expect(result.status).toBe("302");
    expect(result.headers.location[0].value).toBe("https://example.com/settings/");
    expect(result.headers["set-cookie"]).toEqual([
      expect.objectContaining({ value: expect.stringContaining("id_token=new.jwt.token") }),
      expect.objectContaining({ value: expect.stringContaining("refresh_token=new-refresh") }),
    ]);
  });

  it("returns 400 when the nonce is invalid/already used", async () => {
    ddbMock.on(DeleteItemCommand, { TableName: "examination-csrf-nonces" }).rejects(
      Object.assign(new Error("conditional"), { name: "ConditionalCheckFailedException" })
    );

    const state = Buffer.from(JSON.stringify({ uri: "/settings/", nonce: "used-nonce" })).toString("base64");
    const event = cfEvent({ uri: "/_callback" });
    event.Records[0].cf.request.querystring = `code=auth-code&state=${encodeURIComponent(state)}`;

    const result = await handler(event);

    expect(result.status).toBe("400");
  });

  it("redirects unregistered users to /family-create/ after their first login", async () => {
    ddbMock.on(DeleteItemCommand, { TableName: "examination-csrf-nonces" }).resolves({});
    ddbMock.on(GetItemCommand, { TableName: "examination-allowed-emails" }).resolves({});
    mockValidToken({ email: "new-family@example.com" });
    mockHttpsResponse({ body: JSON.stringify({ id_token: "new.jwt.token", refresh_token: "new-refresh", expires_in: 3600 }) });

    const state = Buffer.from(JSON.stringify({ uri: "/settings/", nonce: "abc123" })).toString("base64");
    const event = cfEvent({ uri: "/_callback" });
    event.Records[0].cf.request.querystring = `code=auth-code&state=${encodeURIComponent(state)}`;

    const result = await handler(event);

    expect(result.headers.location[0].value).toBe("https://example.com/family-create/");
  });

  it("returns 502 when the token exchange itself fails", async () => {
    ddbMock.on(DeleteItemCommand, { TableName: "examination-csrf-nonces" }).resolves({});
    mockHttpsError();

    const state = Buffer.from(JSON.stringify({ uri: "/settings/", nonce: "abc123" })).toString("base64");
    const event = cfEvent({ uri: "/_callback" });
    event.Records[0].cf.request.querystring = `code=auth-code&state=${encodeURIComponent(state)}`;

    const result = await handler(event);

    expect(result.status).toBe("502");
  });

  it("returns 403 when the exchanged id_token fails signature verification", async () => {
    ddbMock.on(DeleteItemCommand, { TableName: "examination-csrf-nonces" }).resolves({});
    mockHttpsResponse({ body: JSON.stringify({ id_token: "bad.jwt.token", refresh_token: "r", expires_in: 3600 }) });
    mockInvalidToken();

    const state = Buffer.from(JSON.stringify({ uri: "/settings/", nonce: "abc123" })).toString("base64");
    const event = cfEvent({ uri: "/_callback" });
    event.Records[0].cf.request.querystring = `code=auth-code&state=${encodeURIComponent(state)}`;

    const result = await handler(event);

    expect(result.status).toBe("403");
  });
});
