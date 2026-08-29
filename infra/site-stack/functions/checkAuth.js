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
const { incrementAndCheckDailyLimit } = require("./dailyRateLimit"); // symlink先: dev-standards#165
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");

const ALLOWED_EMAILS_TABLE = "examination-allowed-emails";
const FAMILIES_TABLE = "examination-families";
const SITUATION_MAX_LENGTH = 50;
// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合は各ページのsrc/pages/*.jsx（app/profile-edit/等）とあわせて
// ここも更新する
const BOT_API_HOSTNAME = "0yqos9utye.execute-api.us-east-1.amazonaws.com";
// 家族新規作成ページ（app/family-create/）のパス。ログイン済み（Googleアカウントの
// emailクレームが検証できること）でありさえすればisAllowedEmailの対象外として
// 個別に許可する必要があるため定数化する（examination#258、下記isFamilyCreatePath参照）
const FAMILY_CREATE_PATH_PREFIX = "/family-create/";
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
        // チャンクをBufferのまま集め、レスポンス完了後に一度だけUTF-8デコードする
        // （geminiConversation.js postJsonと同じ理由。マルチバイト文字のチャンク
        // 境界分割による文字化けを避ける）
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf-8");
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
  return {
    status: "403",
    statusDescription: "Forbidden",
    headers: { "content-type": [{ key: "Content-Type", value: "text/plain; charset=utf-8" }] },
    body: "アクセスが許可されていません",
  };
}

// emailごとの許可判定を短時間キャッシュする。Lambda@Edgeの実行環境はエッジロケーション・
// CacheBehaviorの関連付けごとに独立したコンテナのため、/_admin/emailsでの追加・削除や
// 家族の新規作成（POST /_families）はこのTTLを上限に各エッジへ順次反映される
// （即時グローバル反映はしない設計）。家族作成直後に他ページへ遷移すると別コンテナへ
// ルーティングされ、作成した本人がまだ許可されていないと判定されることがあった
// （examination#267）ため、60秒から15秒へ短縮し体感の待ち時間を減らした
const ALLOW_CACHE_TTL_MS = 15_000;
const allowCache = new Map();

function invalidateAllowCache(email) {
  allowCache.delete(String(email).toLowerCase());
}

// isAllowedEmailと同じキャッシュ・GetItemを使い、家族単位の管理API
// （examination#243）が必要とするfamilySlugもあわせて返す
async function getAllowedEmailRecord(email) {
  if (!email) return null;
  const key = String(email).toLowerCase();
  const cached = allowCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.allowed ? { familySlug: cached.familySlug || "" } : null;
  }
  let allowed = false;
  let familySlug = "";
  try {
    const result = await ddb.send(
      new GetItemCommand({
        TableName: ALLOWED_EMAILS_TABLE,
        Key: { email: { S: key } },
      })
    );
    allowed = Boolean(result.Item);
    familySlug = (allowed && result.Item.familySlug && result.Item.familySlug.S) || "";
  } catch (error) {
    console.error("DynamoDB GetItem failed", error.message);
    allowed = false;
  }
  allowCache.set(key, { allowed, familySlug, expiresAt: now + ALLOW_CACHE_TTL_MS });
  return allowed ? { familySlug } : null;
}

async function isAllowedEmail(email) {
  return Boolean(await getAllowedEmailRecord(email));
}

// 家族単位のメンバー管理（examination#243）。familySlugが一致する行のみを返す。
// AllowedEmailsTableのPKはemailのためQueryは使えず、Scan＋FilterExpressionで
// 絞り込む（家族の人数規模ではこれで十分、interviewQuestionsStore.js等と同じ方針）
async function listAllowedEmails(familySlug) {
  const result = await ddb.send(
    new ScanCommand({
      TableName: ALLOWED_EMAILS_TABLE,
      FilterExpression: "familySlug = :slug",
      ExpressionAttributeValues: { ":slug": { S: familySlug } },
    })
  );
  return (result.Items || [])
    .map((item) => ({
      email: item.email && item.email.S,
      addedBy: (item.addedBy && item.addedBy.S) || "",
      addedAt: (item.addedAt && item.addedAt.S) || "",
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

// familySlugは家族新規作成（examination#242）からのみ渡される。既存の
// /_admin/emailsからの呼び出し（家族単位化はexamination#243で対応）は
// familySlugを渡さず、これまで通りfamilySlug無しのレコードのままにする
async function addAllowedEmail(email, addedBy, familySlug) {
  const key = String(email).toLowerCase();
  const item = {
    email: { S: key },
    addedBy: { S: String(addedBy || "") },
    addedAt: { S: new Date().toISOString() },
  };
  if (familySlug) {
    item.familySlug = { S: familySlug };
  }
  await ddb.send(new PutItemCommand({ TableName: ALLOWED_EMAILS_TABLE, Item: item }));
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

// 家族新規作成ページ（/family-create/）は、まだどの家族にも所属していない
// ログイン済みユーザーがアクセスする入口のため、isAllowedEmailの対象外として
// 個別に許可する（examination#258。以前は招待済みメールアドレスのみに限定して
// いたが、公開サービスとして構わないとの判断により誰でも作成できるようにした）
function isFamilyCreatePath(uri) {
  return uri === "/family-create" || uri.startsWith(FAMILY_CREATE_PATH_PREFIX);
}

// slug自体はランダムな短縮IDとし、入力内容から機械的に導出しない
function generateFamilySlug() {
  return crypto.randomBytes(6).toString("hex");
}

// 新しい家族が作成されたことをbot-stackの内部API（新規家族登録の通知、
// examination#259）へ知らせる。同じ呼び出しで、入力されたシチュエーションを
// examination-family-profileへ種として保存する（examination#305、家族名と
// シチュエーションの統合。以降は/settings/profile-edit/で編集できる）。
// site-stackとbot-stackは別Serverless serviceのため、共有シークレット
// （X-Internal-Secretヘッダー）で認証する。ベストエフォートであり、失敗しても
// 家族作成自体は成功として扱う（呼び出し元はawaitするだけでよく、例外は投げない）。
// Lambda@Edgeの実行時間予算を圧迫しないよう3秒でタイムアウトする
function notifyFamilyCreated(email, situation, familySlug) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ email, situation, familySlug });
    const req = https.request(
      {
        hostname: BOT_API_HOSTNAME,
        path: "/internal/notify-family-created",
        method: "POST",
        timeout: 3000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Internal-Secret": config.internalApiSecret,
        },
      },
      (res) => {
        res.resume(); // ボディを読み捨ててソケットを解放する（内容は使わない）
        resolve();
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", (error) => {
      console.warn("Family-created notification failed", error.message);
      resolve();
    });
    req.end(body);
  });
}

// 家族の退会（最後の1人が自分自身を削除する操作）に伴うデータ全削除を
// bot-stackの内部API（examination#284）へ依頼する。notifyFamilyCreatedと
// 異なりこちらは破壊的操作の一部であり、失敗時は呼び出し元が家族の削除自体を
// 中断できるよう成否をboolean で返す（例外は投げない）。QueryとDeleteItemを
// 複数回繰り返すため、通知（3秒）より長めの8秒でタイムアウトする
function deleteFamilyDataRemote(familySlug, email) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ familySlug, email });
    const req = https.request(
      {
        hostname: BOT_API_HOSTNAME,
        path: "/internal/delete-family-data",
        method: "POST",
        timeout: 8000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Internal-Secret": config.internalApiSecret,
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", (error) => {
      console.error("Family data deletion failed", error.message);
      resolve(false);
    });
    req.end(body);
  });
}

async function deleteFamily(slug) {
  await ddb.send(new DeleteItemCommand({ TableName: FAMILIES_TABLE, Key: { slug: { S: slug } } }));
}

// 家族の新規作成（examination#44・#258）。未所属であれば、examination-families
// へ新規行を作成し、作成者自身を新しい家族の最初のメンバーとして
// examination-allowed-emailsへ追加する。公開サービスとして構わないとの判断の
// ため、招待の有無は問わずログイン済みであれば実行できる。
//
// 入力するのは「家族名」ではなく「シチュエーション」（例:
// 「小学校受験の面接」）とする（examination#305、家族名とシチュエーションの
// 統合）。以前は家族名の一意性をここでチェックしていたが、シチュエーションは
// 複数家族で重複しても問題ない自由記述のため一意性チェックは行わない。
// examination-familiesにはシチュエーション自体を保存せず（重複した状態を
// 持たせないため）、slug・作成者情報のみを保持する。シチュエーションの正本は
// examination-family-profile（bot-stack）で、成功時に呼ぶbot-stackの内部API
// （notifyFamilyCreated、サイト運営者へのLINE通知も兼ねる、examination#259）が
// 種として保存する
async function createFamily({ email, situation }) {
  if (await isAllowedEmail(email)) {
    return { status: 400, error: "既に家族に所属しています" };
  }
  const trimmedSituation = String(situation || "").trim().slice(0, SITUATION_MAX_LENGTH);
  if (!trimmedSituation) {
    return { status: 400, error: "シチュエーションを入力してください" };
  }
  const slug = generateFamilySlug();
  await ddb.send(
    new PutItemCommand({
      TableName: FAMILIES_TABLE,
      Item: {
        slug: { S: slug },
        createdBy: { S: email },
        createdAt: { S: new Date().toISOString() },
      },
      ConditionExpression: "attribute_not_exists(slug)",
    })
  );
  await addAllowedEmail(email, email, slug);
  await notifyFamilyCreated(email, trimmedSituation, slug);
  return { slug, situation: trimmedSituation };
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

// 許可メールアドレスの一覧・追加・削除API。既に許可されているユーザーのみ利用でき、
// 閲覧・追加・削除は自分の所属家族のメンバーに限定する（examination#243）。
// 家族の新規作成は招待制ではなく公開登録制のため（examination#258）、この
// APIに招待関連の操作は無い
async function handleAdminEmailsApi(request) {
  const payload = await verifyIdTokenFromCookie(request);
  if (!payload) {
    return forbiddenResponse();
  }
  const requesterEmail = String(payload.email || "").toLowerCase();
  const requesterRecord = await getAllowedEmailRecord(requesterEmail);
  if (!requesterRecord) {
    return forbiddenResponse();
  }
  const familySlug = requesterRecord.familySlug;

  if (request.method === "GET") {
    return jsonResponse(200, "OK", { emails: await listAllowedEmails(familySlug) });
  }

  if (request.method === "POST") {
    const body = parseJsonBody(request);
    const targetEmail = body && typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const action = body && body.action;

    if (!targetEmail || !EMAIL_PATTERN.test(targetEmail)) {
      return jsonResponse(400, "Bad Request", { error: "メールアドレスが不正です" });
    }

    if (action === "add") {
      // v1は1メール=1家族に限定する（examination#44）。既に別の家族（または自分の
      // 家族）に所属しているメールアドレスをそのまま追加すると、familySlugが
      // 上書きされ他家族から静かに引き抜く形になってしまうため拒否する
      if (await isAllowedEmail(targetEmail)) {
        return jsonResponse(400, "Bad Request", { error: "そのメールアドレスは既に何らかの家族に所属しています" });
      }
      await addAllowedEmail(targetEmail, requesterEmail, familySlug);
      return jsonResponse(200, "OK", { emails: await listAllowedEmails(familySlug) });
    }

    if (action === "remove") {
      if (targetEmail === requesterEmail) {
        // 自分自身の削除は、家族の最後の1人である場合のみ許可し、退会と同時に
        // 家族の全データ（想定問答・模擬面接記録・プロフィール・LINE連携・家族
        // レコード自体）を削除する（examination#284）。他のメンバーが残っている
        // 状態で許可すると、その人たちのデータを本人の同意なく消してしまうため拒否する
        const current = await listAllowedEmails(familySlug);
        if (current.length > 1) {
          return jsonResponse(400, "Bad Request", {
            error: "他のメンバーが残っているため、自分を削除できません。先に他のメンバーを削除してください",
          });
        }
        const deleted = await deleteFamilyDataRemote(familySlug, requesterEmail);
        if (!deleted) {
          return jsonResponse(502, "Bad Gateway", {
            error: "家族データの削除に失敗しました。しばらくしてから再度お試しください",
          });
        }
        await removeAllowedEmail(requesterEmail);
        await deleteFamily(familySlug);
        return jsonResponse(200, "OK", { emails: [], familyDeleted: true });
      }
      // 自分の家族に実際に所属しているメールアドレスかどうかを確認する
      // （examination#243、他家族のメンバーを誤って・意図的に削除できないようにする）。
      const current = await listAllowedEmails(familySlug);
      if (!current.some((item) => item.email === targetEmail)) {
        return jsonResponse(404, "Not Found", { error: "そのメールアドレスは自分の家族に所属していません" });
      }
      await removeAllowedEmail(targetEmail);
      return jsonResponse(200, "OK", { emails: await listAllowedEmails(familySlug) });
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

// 家族の新規作成API（examination#242・#258）。他の管理系APIと異なり、意図的に
// isAllowedEmailのチェックを行わない（このAPIの対象者はまだ許可されていない
// ユーザーそのものであるため）。ログイン済み（Googleアカウントのemailクレームが
// 検証できること）でありさえすれば実行できる（公開登録制、招待は不要）
async function handleFamiliesApi(request) {
  const payload = await verifyIdTokenFromCookie(request);
  if (!payload) {
    return forbiddenResponse();
  }
  if (request.method !== "POST") {
    return { status: "405", statusDescription: "Method Not Allowed", body: "method not allowed" };
  }
  const requesterEmail = String(payload.email || "").toLowerCase();
  const body = parseJsonBody(request);
  const situation = body && typeof body.situation === "string" ? body.situation : "";
  const result = await createFamily({ email: requesterEmail, situation });
  if (result.error) {
    const statusDescription = result.status === 403 ? "Forbidden" : "Bad Request";
    return jsonResponse(result.status, statusDescription, { error: result.error });
  }
  return jsonResponse(200, "OK", { slug: result.slug, situation: result.situation });
}

async function incrementAndCheckVoiceTokenIssuance(email) {
  return incrementAndCheckDailyLimit({
    ddb,
    UpdateItemCommand,
    tableName: VOICE_TOKEN_ISSUANCE_TABLE,
    keyAttribute: "emailDate",
    identifier: email,
    limit: VOICE_TOKEN_DAILY_LIMIT,
  });
}

// ログイン中のユーザー情報（examination#150、画面上のユーザー名・アイコン表示用）。
// name・pictureはGoogleログイン時にauth-stackのAttributeMappingでCognitoの
// ユーザー属性へ反映されたものがid_tokenのクレームとして返る。未設定の場合は
// 空文字（アイコン表示側でイニシャル等へフォールバックする）
// familySlugに対応する家族名を取得する（examination#285、トップページの見出し表示用）
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

  // サインアウト: 自前のCookieを失効させた上でCognito自体のセッションも切る。
  // CognitoのHosted UIログアウトは配下のGoogleセッションまでは終了させないため
  // （examination#271）、logout_uriを直接トップページにはせず、Googleセッションも
  // 終了させる中継ページ（/_logout-complete）へ向ける
  if (request.uri === "/_logout") {
    const logoutUrl =
      `https://${cognitoDomainHost}/logout?` +
      new URLSearchParams({
        client_id: config.clientId,
        logout_uri: `https://${domainName}/_logout-complete`,
      }).toString();
    return redirectResponse(logoutUrl, [cookieString("id_token", "", 0), cookieString("refresh_token", "", 0)]);
  }

  // ログアウトの中継ページ（examination#271）。CognitoのHosted UIログアウトは
  // 配下のGoogleセッションまでは終了させないため、このまま次にログインすると
  // Googleが自身のセッションを検知して確認画面無しに同じアカウントで再ログイン
  // させてしまう。非表示の<img>でGoogleの/Logoutエンドポイントへリクエストを
  // 送る（いわゆる「ログアウトピクセル」パターン）ことで、レスポンスの内容に
  // 依存せずCookie失効という副作用のみを利用してGoogleセッションも終了させた上で
  // トップページへ戻る。この中継先URLはauth-stackのLogoutURLsに登録済みである
  // 必要がある
  if (request.uri === "/_logout-complete") {
    return {
      status: "200",
      statusDescription: "OK",
      headers: { "content-type": [{ key: "Content-Type", value: "text/html; charset=utf-8" }] },
      body: [
        "<!doctype html>",
        '<html lang="ja"><head><meta charset="utf-8"><title>ログアウト中...</title></head>',
        "<body>",
        "<p>ログアウトしています...</p>",
        '<img src="https://accounts.google.com/Logout" alt="" style="display:none" ' +
          "onload=\"location.href='/'\" onerror=\"location.href='/'\">",
        "<script>setTimeout(function () { location.href = '/'; }, 2000);</script>",
        "</body></html>",
      ].join("\n"),
    };
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

  // 家族の新規作成API（公開登録制、examination#242・#258）
  if (request.uri === "/_families") {
    return handleFamiliesApi(request);
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
    // 家族新規作成ユーザー（examination#242・#258）は、ログイン直後の時点では
    // まだisAllowedEmailを満たさない。公開登録制のため、この場合に403で
    // 行き止まりにするのではなく、家族新規作成ページへ案内する（examination#264。
    // 未登録ユーザーは/family-create/というURLをそもそも知らないため、元々
    // 別のページへ向かおうとしていた場合もそちらへは通さない）
    const destinationUri =
      (await isAllowedEmail(payload.email)) || isFamilyCreatePath(originalUri) ? originalUri : "/family-create/";

    return redirectResponse(`https://${domainName}${destinationUri}`, [
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
    // 家族新規作成ページ（examination#242・#258）は、まだどの家族にも属さない
    // ユーザーがログイン直後にアクセスする入口のため、isAllowedEmailの
    // 対象外として個別に許可する
    if (isFamilyCreatePath(request.uri)) {
      request.uri = normalizeUri(request.uri);
      return request;
    }
    // 公開登録制（examination#258）のため、未登録ユーザーを403で行き止まりに
    // せず家族新規作成ページへ誘導する（examination#264。/family-create/という
    // URLを新規ユーザーが事前に知っている前提は成り立たない）
    return redirectResponse(`https://${domainName}/family-create/`, []);
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
      // 未登録ユーザーは家族新規作成ページへ誘導する（examination#258・#264、
      // 上記/_callback・通常リクエストの2箇所と同じ方針）
      const isAllowed = await isAllowedEmail(refreshedPayload.email);
      const destinationUrl =
        isAllowed || isFamilyCreatePath(request.uri)
          ? `https://${domainName}${request.uri}` + (request.querystring ? `?${request.querystring}` : "")
          : `https://${domainName}/family-create/`;
      return redirectResponse(destinationUrl, [cookieString("id_token", tokens.id_token, tokens.expires_in)]);
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
