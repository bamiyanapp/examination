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
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");

const ALLOWED_EMAILS_TABLE = "examination-allowed-emails";
const LINE_LINK_CODES_TABLE = "examination-line-link-codes";
const LINE_LINK_CODE_TTL_SECONDS = 60 * 10;
const CSRF_NONCES_TABLE = "examination-csrf-nonces";
const CSRF_NONCE_TTL_SECONDS = 300;
const VOICE_TOKENS_TABLE = "examination-voice-tokens";
const VOICE_TOKEN_TTL_SECONDS = 60 * 60;
const VOICE_TOKEN_ISSUANCE_TABLE = "examination-voice-token-issuance";
// 誤操作・アカウント乗っ取り等でAPI呼び出しが想定外に増えるリスクを抑えるための
// 1日あたりの発行上限（examination#69、examination#124で20→1000に見直し）。
// これはブラウザ向け各種API（voiceChat/interviewQuestions/mockInterviewsApi）
// 利用のゲートとしてのAPI発行回数の上限であり、Gemini呼び出し回数そのものの上限は
// 別途bot-stack側（examination-ai-api-issuance、examination#124）で管理する。
// 運用しながら調整できるよう定数として分離する
const VOICE_TOKEN_DAILY_LIMIT = 1000;
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

// ログインCSRF対策のnonceをサーバー側（DynamoDB）で発行する（examination#143）。
// 以前はCookie（csrf_state）に保存しstateパラメータと突き合わせていたが、
// バックグラウンドfetch・prefetchによる上書きや、ブラウザのCookieポリシー
// （Safari等のITPのバウンストラッキング対策によるCookie破棄を含む）に
// 起因すると考えられる「invalid state」の再発を繰り返した。nonce自体の
// 有効性をサーバー側で管理すれば、これらのクライアント側の要因に一切
// 依存しなくなる
async function issueCsrfNonce() {
  const nonce = crypto.randomBytes(16).toString("hex");
  await ddb.send(
    new PutItemCommand({
      TableName: CSRF_NONCES_TABLE,
      Item: {
        nonce: { S: nonce },
        expiresAt: { N: String(Math.floor(Date.now() / 1000) + CSRF_NONCE_TTL_SECONDS) },
      },
    })
  );
  return nonce;
}

// nonceの検証と同時に削除する（DeleteItem + ConditionExpression）ことで、
// 有効期限内・未使用の一度きりの利用のみを許可する。同じnonceでの
// リプレイ（多重コールバック等）・期限切れ後の利用はどちらもfalseになる
async function consumeCsrfNonce(nonce) {
  if (!nonce) return false;
  try {
    await ddb.send(
      new DeleteItemCommand({
        TableName: CSRF_NONCES_TABLE,
        Key: { nonce: { S: nonce } },
        ConditionExpression: "attribute_exists(#n) AND expiresAt > :now",
        ExpressionAttributeNames: { "#n": "nonce" },
        ExpressionAttributeValues: { ":now": { N: String(Math.floor(Date.now() / 1000)) } },
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
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

// LINE botとの連携用ワンタイムコードを発行する（examination#49）。ログイン中のユーザーの
// メールアドレスと紐付けて保存し、LINE bot側（lineWebhook.js）がクロススタックで検証する
async function handleLinkLineApi(request) {
  const payload = await verifyIdTokenFromCookie(request);
  if (!payload) {
    return forbiddenResponse();
  }
  const requesterEmail = String(payload.email || "").toLowerCase();
  if (!(await isAllowedEmail(requesterEmail))) {
    return forbiddenResponse();
  }
  if (request.method !== "POST") {
    return { status: "405", statusDescription: "Method Not Allowed", body: "method not allowed" };
  }

  const code = String(crypto.randomInt(100000, 1000000));
  await ddb.send(
    new PutItemCommand({
      TableName: LINE_LINK_CODES_TABLE,
      Item: {
        code: { S: code },
        email: { S: requesterEmail },
        expiresAt: { N: String(Math.floor(Date.now() / 1000) + LINE_LINK_CODE_TTL_SECONDS) },
      },
    })
  );
  return jsonResponse(200, "OK", { code, expiresInSeconds: LINE_LINK_CODE_TTL_SECONDS });
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// メールアドレス×当日日付の発行回数をアトミックにインクリメントし、上限を超えていないか
// 確認する（examination#69）。DynamoDBのUpdateItem（ADD + ConditionExpression）は
// 単一リクエストで読み取り・条件判定・更新を行うため、同時に複数のトークン発行リクエストが
// 来ても二重カウントや上限のすり抜けが起きない
async function incrementAndCheckVoiceTokenIssuance(email) {
  const key = `${email}#${todayDateKey()}`;
  // 日付境界をまたいだ集計漏れを避けるため、TTLは1日分に余裕(1時間)を持たせる
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 25;
  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: VOICE_TOKEN_ISSUANCE_TABLE,
        Key: { emailDate: { S: key } },
        UpdateExpression: "ADD #count :one SET expiresAt = :expiresAt",
        ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: {
          ":one": { N: "1" },
          ":limit": { N: String(VOICE_TOKEN_DAILY_LIMIT) },
          ":expiresAt": { N: String(expiresAt) },
        },
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return false;
    }
    throw error;
  }
}

// ログイン中のユーザー情報（examination#150、画面上のユーザー名・アイコン表示用）。
// name・pictureはGoogleログイン時にauth-stackのAttributeMappingでCognitoの
// ユーザー属性へ反映されたものがid_tokenのクレームとして返る。未設定の場合は
// 空文字（アイコン表示側でイニシャル等へフォールバックする）
async function handleMeApi(request) {
  if (request.method !== "GET") {
    return { status: "405", statusDescription: "Method Not Allowed", body: "method not allowed" };
  }
  const payload = await verifyIdTokenFromCookie(request);
  if (!payload) {
    return forbiddenResponse();
  }
  if (!(await isAllowedEmail(payload.email))) {
    return forbiddenResponse();
  }
  return jsonResponse(200, "OK", {
    email: payload.email,
    name: payload.name || "",
    picture: payload.picture || "",
  });
}

// refresh_tokenを使ってid_tokenを再発行する（examination#150）。/_callbackの
// トークン交換と同じgrant_type違いのリクエストで、Cognitoは新しいrefresh_token
// を返さない（既存のrefresh_tokenがそのまま有効期限まで使い続けられる）ため
// refresh_tokenクッキー自体は書き換えない
async function exchangeRefreshToken(refreshToken, cognitoDomainHost) {
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  return postForm(
    cognitoDomainHost,
    "/oauth2/token",
    {
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: refreshToken,
    },
    { Authorization: `Basic ${basicAuth}` }
  );
}

// 音声対話ページ（クロスオリジンのbot-stack API）用の短期トークンを発行する
// （examination#62）。HttpOnlyのid_tokenクッキーはクロスオリジンでは送られないため、
// 同一オリジンのこのAPIでログイン中のユーザーを確認した上でBearerトークンを発行し、
// ブラウザのJSがそれをAPI Gateway経由のLambdaへ渡して認証する
async function handleVoiceTokenApi(request) {
  const payload = await verifyIdTokenFromCookie(request);
  if (!payload) {
    return forbiddenResponse();
  }
  const requesterEmail = String(payload.email || "").toLowerCase();
  if (!(await isAllowedEmail(requesterEmail))) {
    return forbiddenResponse();
  }
  if (request.method !== "POST") {
    return { status: "405", statusDescription: "Method Not Allowed", body: "method not allowed" };
  }

  // 1日あたりの発行上限チェック（examination#69）。誤操作やアカウント乗っ取り等で
  // API呼び出しが想定外に増えるリスクを抑える。Gemini呼び出し回数そのものの上限は
  // 別途bot-stack側でチェックする（examination#124）
  if (!(await incrementAndCheckVoiceTokenIssuance(requesterEmail))) {
    return jsonResponse(429, "Too Many Requests", {
      error: `本日の発行上限（${VOICE_TOKEN_DAILY_LIMIT}回）に達しました。日付が変わってからお試しください。`,
    });
  }

  const token = crypto.randomBytes(32).toString("hex");
  await ddb.send(
    new PutItemCommand({
      TableName: VOICE_TOKENS_TABLE,
      Item: {
        token: { S: token },
        email: { S: requesterEmail },
        expiresAt: { N: String(Math.floor(Date.now() / 1000) + VOICE_TOKEN_TTL_SECONDS) },
      },
    })
  );
  return jsonResponse(200, "OK", { token, expiresInSeconds: VOICE_TOKEN_TTL_SECONDS });
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

  // ログイン中のユーザー情報API（examination#150）
  if (request.uri === "/_me") {
    return handleMeApi(request);
  }

  // 許可メールアドレスの管理API
  if (request.uri === "/_admin/emails") {
    return handleAdminEmailsApi(request);
  }

  // LINE bot連携用ワンタイムコード発行API
  if (request.uri === "/_link-line") {
    return handleLinkLineApi(request);
  }

  // 音声対話ページ用の短期トークン発行API
  if (request.uri === "/_voice-token") {
    return handleVoiceTokenApi(request);
  }

  // Cognito Hosted UIからのコールバック: 認可コードをトークンに交換してCookieへ保存する
  if (request.uri === "/_callback") {
    const params = new URLSearchParams(request.querystring);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      return { status: "400", statusDescription: "Bad Request", body: "missing code or state" };
    }

    // ログインCSRF対策: 未認証時のリダイレクトでDynamoDBへ登録したnonceと、
    // stateパラメータに埋め込んだnonceが一致し、かつ未使用・有効期限内であることを
    // 確認する（第三者が発行させた認可コードをこのブラウザに横流しして紐付けさせる
    // 攻撃を防ぐ）。以前はCookie（csrf_state）で照合していたが、examination#143
    // 参照
    let originalUri = "/";
    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
    } catch {
      return { status: "400", statusDescription: "Bad Request", body: "invalid state" };
    }
    if (!(await consumeCsrfNonce(decoded.nonce))) {
      return { status: "400", statusDescription: "Bad Request", body: "invalid state" };
    }
    originalUri = decoded.uri || "/";

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

  // id_tokenが失効・無効でもrefresh_tokenが有効なら裏側で再発行し、Googleへの
  // 完全な再ログイン（アカウント選択・同意画面）を経ずにセッションを継続する
  // （examination#150）。同じURIへリダイレクトするだけの1往復で完了する
  let extraCookiesOnLoginRedirect = [];
  const cookies = parseCookies(request.headers);
  if (cookies.refresh_token) {
    try {
      const tokens = await exchangeRefreshToken(cookies.refresh_token, cognitoDomainHost);
      const { payload: refreshedPayload } = await jwtVerify(tokens.id_token, getJwks(), {
        issuer: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
        audience: config.clientId,
      });
      if (!(await isAllowedEmail(refreshedPayload.email))) {
        console.warn("email not allowed on refreshed token", refreshedPayload.email);
        return forbiddenResponse();
      }
      const originalUrl =
        `https://${domainName}${request.uri}` + (request.querystring ? `?${request.querystring}` : "");
      return redirectResponse(originalUrl, [cookieString("id_token", tokens.id_token, tokens.expires_in)]);
    } catch (error) {
      console.warn("refresh_token exchange failed", error.message);
      // refresh_token自体が失効・無効な場合は、無駄な再試行を避けるため失効させた上で
      // 通常のログインフローへフォールスルーする
      extraCookiesOnLoginRedirect = [cookieString("refresh_token", "", 0)];
    }
  }

  // Service Workerのプリキャッシュ（examination#118）・Speculation Rules API
  // （examination#105）等、ページ本体のナビゲーションを伴わない未認証の
  // バックグラウンドリクエストは、以下のいずれかのヘッダーで検出できる場合
  // Cognitoへのリダイレクト（無駄なnonce発行・往復）自体を避ける。nonceの
  // 検証自体はexamination#143でサーバー側（DynamoDB）管理に変更したため、
  // これらの判定を取りこぼしてもcsrf_stateのようなクッキー上書き競合は
  // 発生しなくなっている（あくまで効率化のための判定であり、正しさの
  // 担保はDynamoDB側のnonce管理に一本化されている）
  const isPrecacheRequest = Boolean((request.headers["x-precache-request"] || [])[0]);
  const secPurpose = (request.headers["sec-purpose"] || [])[0]?.value;
  const isSpeculativeRequest = Boolean(secPurpose && secPurpose.includes("prefetch"));
  const secFetchMode = (request.headers["sec-fetch-mode"] || [])[0]?.value;
  if (isPrecacheRequest || isSpeculativeRequest || (secFetchMode && secFetchMode !== "navigate")) {
    return { status: "401", statusDescription: "Unauthorized", body: "authentication required" };
  }

  // 未認証: 元のパス＋CSRF対策nonceをstateに載せてCognito Hosted UIのログイン画面へ
  // リダイレクトする。nonceはDynamoDBへ登録し、/_callback側で一度きりの検証・削除を
  // 行う（examination#143、クッキーには一切依存しない）
  const nonce = await issueCsrfNonce();
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
  return redirectResponse(authorizeUrl, extraCookiesOnLoginRedirect);
};
