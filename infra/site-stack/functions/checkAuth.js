"use strict";

const https = require("https");
const crypto = require("crypto");
const { createRemoteJWKSet, jwtVerify } = require("jose");
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");

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

function cookieString(name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
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

    return redirectResponse(`https://${domainName}${originalUri}`, [
      cookieString("id_token", tokens.id_token, tokens.expires_in),
      cookieString("refresh_token", tokens.refresh_token, 60 * 60 * 24 * 30),
      // 使い切ったcsrf_stateクッキーは失効させる
      cookieString("csrf_state", "", 0),
    ]);
  }

  // 通常のリクエスト: id_tokenの署名・有効期限・audience/issuerを検証する
  const cookies = parseCookies(request.headers);
  if (cookies.id_token) {
    try {
      await jwtVerify(cookies.id_token, getJwks(), {
        issuer: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
        audience: config.clientId,
      });
      return request;
    } catch (error) {
      console.warn("id_token verification failed", error.message);
    }
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
