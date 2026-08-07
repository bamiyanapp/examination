// examination#118: 静的ページ・バックエンドAPI（想定問答・模擬面接記録等の一覧）を
// Stale-While-Revalidate方式でキャッシュし、2回目以降の表示を高速化する。
// examination#72では「PWAで更新が反映されない」問題への対応として意図的に
// Service Workerを新設しない方針を採ったが、Stale-While-Revalidateはキャッシュを
// 即座に返しつつ裏側で必ず最新を取得してキャッシュを更新するため、
// 「更新が永久に反映されない」状態にはならず両立できる……はずだったが、
// ページ本体（HTMLナビゲーション）にまでStale-While-Revalidateを適用していたため、
// 表示は常に「1回前のデプロイ内容」になり、cd.ymlの`aws s3 sync --delete`で
// 削除された古いハッシュ付きJS/CSSを参照したまま壊れて見えることがあった
// （examination#133）。ページ本体はNetwork Firstに変更し、常に最新を取得する
const CACHE_VERSION = "v2";
const STATIC_CACHE = `examination-static-${CACHE_VERSION}`;
const API_CACHE = `examination-api-${CACHE_VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, API_CACHE];

// 初回インストール時にまとめて先読みキャッシュしておくページ一覧。
// 音声で面接練習ページ（examination#73、gzip約12MB超のONNXモデルを含んでいた
// 経緯があり、examination#100・#105・#112でも同様の理由で先読み対象から除外して
// きた）は今回も対象から除外する
const PRECACHE_URLS = [
  "/",
  "/education/",
  "/education/interview-questions/",
  "/education/mock-interviews/",
  "/settings/allowed-emails/",
  "/settings/line-link/",
  "/settings/profile-edit/",
];

// バックエンドAPI（bot-stackのHTTP API）のホスト名。デプロイでURLが変わった場合は
// 各アプリのsrc/pages/*.jsxとあわせてここも更新する
const BOT_API_HOSTNAME = "0yqos9utye.execute-api.us-east-1.amazonaws.com";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            // X-Precache-Requestは未認証時にcheckAuth.js（Lambda@Edge）へ「これは
            // ページ本体への実際のナビゲーションではなくバックグラウンドの先読み
            // fetchである」ことを伝えるための独自ヘッダー。ブラウザが自動付与する
            // Sec-Fetch-Modeヘッダーだけに頼ると、送信されない・ブラウザ実装依存で
            // 信頼できない場合があり（examination#143の再発）、この独自ヘッダーは
            // 自前のfetch呼び出しである限り常に確実に送信できる
            const response = await fetch(url, { headers: { "X-Precache-Request": "1" } });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch {
            // オフライン等でプリキャッシュに失敗しても致命的ではないため無視する
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

// キャッシュを即座に返しつつ、裏側でネットワーク取得してキャッシュを更新する。
// キャッシュが無い場合のみネットワークの結果を待って返す。ページ本体以外の
// サブリソース（ハッシュ付きJS/CSS等、内容が変われば別ファイル名になるもの）・
// バックエンドAPIには引き続きこの方式を使う
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await networkFetch) || Response.error();
}

// ページ本体（HTMLナビゲーション）用。まずネットワークから最新を取得し、
// 取得できた場合のみキャッシュを更新して返す。オフライン等でネットワークが
// 使えない場合のみキャッシュ（インストール時のプリキャッシュ等）にフォールバックする
// （examination#133）。Stale-While-Revalidateと異なり、表示が「1回前のデプロイ内容」
// のまま固定されることがなく、常に最新のHTMLを取得する
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // POST等（/_voice-tokenの発行、/_admin/emailsの更新等）は毎回必ず最新の
  // ネットワークリクエストが必要なためキャッシュ対象から除外する
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.hostname === BOT_API_HOSTNAME) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    // request.modeが"navigate"のリクエストはページ本体そのもの（URL直接入力・
    // リンククリック等によるフルページ遷移）を指す標準的な判定方法。それ以外の
    // 同一オリジンGET（ハッシュ付きJS/CSS等のサブリソース）はStale-While-Revalidateのまま
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, STATIC_CACHE));
    } else {
      event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    }
  }
});
