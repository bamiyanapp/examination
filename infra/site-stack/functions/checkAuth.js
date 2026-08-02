"use strict";

const https = require("https");
const crypto = require("crypto");
const { createRemoteJWKSet, jwtVerify } = require("jose");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  DeleteItemCommand,
  ScanCommand,
} = require("@aws-sdk/client-dynamodb");
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");

const ALLOWED_EMAILS_TABLE = "examination-allowed-emails";
// checkAuth.jsはLambda@Edgeとしてus-east-1にのみデプロイされ、テーブルも同じ
// スタック（us-east-1）内に存在するためリージョンを固定する
const ddb = new DynamoDBClient({ region: "us-east-1" });

let jwks;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}/.well-known/jwks.json`)
    );
  }
  return jwks;
}

function parseCookies(headers) {
  const cookies = {};
  const cookieHeaders = (headers.cookie || []).map((h) => h.value);
  for (const header of cookieHeaders) {
    for (const part of header.split(";")) {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (key) cookies[key] = value;
    }
  }
  return cookies;
}

function postForm(hostname, path, form, extraHeaders = {}) {
  const body = new URLSearchParams(form).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error(`token endpoint returned invalid JSON: ${data}`));
            }
          } else {
            reject(new Error(`token endpoint returned ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

function redirectResponse(location, setCookieValues) {
  const headers = {
    location: [{ key: "Location", value: location }],
  };
  if (setCookieValues && setCookieValues.length > 0) {
    headers["set-cookie"] = setCookieValues.map((value) => ({ key: "Set-Cookie", value }));
  }
  return {
    status: "302",
    statusDescription: "Found",
    headers,
  };
}

function jsonResponse(statusCode, statusDescription, body) {
  return {
    status: String(statusCode),
    statusDescription,
    headers: {
      "content-type": [{ key: "Content-Type", value: "application/json; charset=utf-8" }],
    },
    body: JSON.stringify(body),
  };
}

function cookieString(name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function forbiddenResponse() {
  return { status: "403", statusDescription: "Forbidden", body: "アクセスが許可されていません" };
}

// emailごとの許可判定を短時間キャッシュする。Lambda@Edgeの実行環境はエッジロケーション
// ごとに独立したコンテナのため、/_admin/emailsでの追加・削除はこのTTL(60秒)を上限に
// 各エッジへ順次反映される（即時グローバル反映はしない設計）
const ALLOW_CACHE_TTL_MS = 60_000;
const allowCache = new Map();

function invalidateAllowCache(email) {
  allowCache.delete(String(email).toLowerCase());
}

async function isAllowedEmail(email) {
  if (!email) return false;
  const key = String(email).toLowerCase();
  const cached = allowCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.allowed;
  }
  let allowed = false;
  try {
    const result = await ddb.send(
      new GetItemCommand({
        TableName: ALLOWED_EMAILS_TABLE,
        Key: { email: { S: key } },
      })
    );
    allowed = Boolean(result.Item);
  } catch (error) {
    console.error("DynamoDB GetItem failed", error.message);
    allowed = false;
  }
  allowCache.set(key, { allowed, expiresAt: now + ALLOW_CACHE_TTL_MS });
  return allowed;
}

async function listAllowedEmails() {
  const result = await ddb.send(new ScanCommand({ TableName: ALLOWED_EMAILS_TABLE }));
  return (result.Items || [])
    .map((item) => ({
      email: item.email && item.email.S,
      addedBy: (item.addedBy && item.addedBy.S) || "",
      addedAt: (item.addedAt && item.addedAt.S) || "",
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

async function addAllowedEmail(email, addedBy) {
  const key = String(email).toLowerCase();
  await ddb.send(
    new PutItemCommand({
      TableName: ALLOWED_EMAILS_TABLE,
      Item: {
        email: { S: key },
        addedBy: { S: String(addedBy || "") },
        addedAt: { S: new Date().toISOString() },
      },
    })
  );
  invalidateAllowCache(key);
}

async function removeAllowedEmail(email) {
  const key = String(email).toLowerCase();
  await ddb.send(
    new DeleteItemCommand({
      TableName: ALLOWED_EMAILS_TABLE,
      Key: { email: { S: key } },
    })
  );
  invalidateAllowCache(key);
}

// CloudFrontのオリジンはS3のREST API経由（Origin Access Control）であり、S3静的
// ウェブサイトホスティングのようなディレクトリリクエストへの自動index.html解決は
// 行われない。DefaultRootObjectはディストリビューションのルート(/)にのみ適用され
// サブパスには効かないため、MkDocsのディレクトリ形式URL（use_directory_urls既定）を
// ここで正規化する
function normalizeUri(uri) {
  if (uri.endsWith("/")) {
    return `${uri}index.html`;
  }
  if (!uri.includes(".")) {
    return `${uri}/index.html`;
  }
  return uri;
}

function parseJsonBody(request) {
  if (!request.body || !request.body.data) return null;
  const raw =
    request.body.encoding === "base64" ? Buffer.from(request.body.data, "base64").toString("utf-8") : request.body.data;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function verifyIdTokenFromCookie(request) {
  const cookies = parseCookies(request.headers);
  if (!cookies.id_token) return null;
  try {
    const { payload } = await jwtVerify(cookies.id_token, getJwks(), {
      issuer: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
      audience: config.clientId,
    });
    return payload;
  } catch (error) {
    console.warn("id_token verification failed", error.message);
    return null;
  }
}

// 許可メールアドレスの一覧・追加・削除API。既に許可されているユーザーのみ利用できる
async function handleAdminEmailsApi(request) {
  const payload = await verifyIdTokenFromCookie(request);
  if (!payload) {
    return forbiddenResponse();
  }
  const requesterEmail = String(payload.email || "").toLowerCase();
  if (!(await isAllowedEmail(requesterEmail))) {
    return forbiddenResponse();
  }

  if (request.method === "GET") {
    return jsonResponse(200, "OK", { emails: await listAllowedEmails() });
  }

  if (request.method === "POST") {
    const body = parseJsonBody(request);
    const targetEmail = body && typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const action = body && body.action;

    if (!targetEmail || !EMAIL_PATTERN.test(targetEmail)) {
      return jsonResponse(400, "Bad Request", { error: "メールアドレスが不正です" });
    }

    if (action === "add") {
      await addAllowedEmail(targetEmail, requesterEmail);
      return jsonResponse(200, "OK", { emails: await listAllowedEmails() });
    }

    if (action === "remove") {
      if (targetEmail === requesterEmail) {
        return jsonResponse(400, "Bad Request", { error: "自分自身は削除できません" });
      }
      const current = await listAllowedEmails();
      if (current.length <= 1) {
        return jsonResponse(400, "Bad Request", { error: "最後の1件は削除できません" });
      }
      await removeAllowedEmail(targetEmail);
      return jsonResponse(200, "OK", { emails: await listAllowedEmails() });
    }

    return jsonResponse(400, "Bad Request", { error: "actionはaddまたはremoveを指定してください" });
  }

  return { status: "405", statusDescription: "Method Not Allowed", body: "method not allowed" };
}

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const domainName = request.headers.host[0].value;
  const cognitoDomainHost = config.cognitoDomain.replace(/^https?:\/\//, "");

  // サインアウト: 自前のCookieを失効させた上でCognito自体のセッションも切る
  if (request.uri === "/_logout") {
    const logoutUrl =
      `https://${cognitoDomainHost}/logout?` +
      new URLSearchParams({
        client_id: config.clientId,
        logout_uri: `https://${domainName}/`,
      }).toString();
    return redirectResponse(logoutUrl, [cookieString("id_token", "", 0), cookieString("refresh_token", "", 0)]);
  }

  // 許可メールアドレスの管理API
  if (request.uri === "/_admin/emails") {
    return handleAdminEmailsApi(request);
  }

  // Cognito Hosted UIからのコールバック: 認可コードをトークンに交換してCookieへ保存する
  if (request.uri === "/_callback") {
    const params = new URLSearchParams(request.querystring);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      return { status: "400", statusDescription: "Bad Request", body: "missing code or state" };
    }

    // ログインCSRF対策: 未認証時のリダイレクトでcsrf_stateクッキーに保存したnonceと、
    // stateパラメータに埋め込んだnonceが一致することを確認する（第三者が発行させた
    // 認可コードをこのブラウザに横流しして紐付けさせる攻撃を防ぐ）
    let originalUri = "/";
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
      const cookies = parseCookies(request.headers);
      if (!decoded.nonce || decoded.nonce !== cookies.csrf_state) {
        return { status: "400", statusDescription: "Bad Request", body: "invalid state" };
      }
      originalUri = decoded.uri || "/";
    } catch {
      return { status: "400", statusDescription: "Bad Request", body: "invalid state" };
    }

    const redirectUri = `https://${domainName}/_callback`;
    const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

    let tokens;
    try {
      tokens = await postForm(
        cognitoDomainHost,
        "/oauth2/token",
        {
          grant_type: "authorization_code",
          client_id: config.clientId,
          code,
          redirect_uri: redirectUri,
        },
        { Authorization: `Basic ${basicAuth}` }
      );
    } catch (error) {
      console.error("Token exchange failed", error);
      return { status: "502", statusDescription: "Bad Gateway", body: "authentication failed" };
    }

    let payload;
    try {
      ({ payload } = await jwtVerify(tokens.id_token, getJwks(), {
        issuer: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
        audience: config.clientId,
      }));
    } catch (error) {
      console.error("id_token verification failed at callback", error.message);
      return forbiddenResponse();
    }
    if (!(await isAllowedEmail(payload.email))) {
      console.warn("email not allowed", payload.email);
      return forbiddenResponse();
    }

    return redirectResponse(`https://${domainName}${originalUri}`, [
      cookieString("id_token", tokens.id_token, tokens.expires_in),
      cookieString("refresh_token", tokens.refresh_token, 60 * 60 * 24 * 30),
      // 使い切ったcsrf_stateクッキーは失効させる
      cookieString("csrf_state", "", 0),
    ]);
  }

  // 通常のリクエスト: id_tokenの署名・有効期限・audience/issuerを検証し、
  // emailクレームがallowlistに含まれるかも確認する
  const payload = await verifyIdTokenFromCookie(request);
  if (payload) {
    // allowlist外の場合はログイン画面へリダイレクトしない（Googleで
    // 再ログインしても同じemailが返り無限ループになるため）
    if (await isAllowedEmail(payload.email)) {
      request.uri = normalizeUri(request.uri);
      return request;
    }
    console.warn("email not allowed on cached token", payload.email);
    return forbiddenResponse();
  }

  // 未認証: 元のパス＋CSRF対策nonceをstateに載せてCognito Hosted UIのログイン画面へ
  // リダイレクトする。nonceはcsrf_stateクッキーにも保存し、/_callback側で照合する
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ uri: request.uri, nonce }), "utf-8").toString("base64");
  const redirectUri = `https://${domainName}/_callback`;
  const authorizeUrl =
    `https://${cognitoDomainHost}/oauth2/authorize?` +
    new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      scope: "openid email profile",
      redirect_uri: redirectUri,
      state,
    }).toString();
  return redirectResponse(authorizeUrl, [cookieString("csrf_state", nonce, 300)]);
};
