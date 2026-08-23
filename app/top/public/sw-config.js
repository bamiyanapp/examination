// examination固有のService Worker設定（dev-standards#157、shared/pwa/sw.jsが
// importScripts("./sw-config.js")で読み込む）。examination#118・#133・#143の
// 経緯はdev-standardsのdocs/service-worker-update-pattern.md参照
self.SW_CONFIG = {
  // キャッシュ戦略・precacheUrls等を変更した際は必ず値を変更し、activate時に
  // 旧キャッシュを確実に破棄させること
  cacheVersion: "v3",
  // 初回インストール時にまとめて先読みキャッシュしておくページ一覧。
  // 音声で面接練習ページ（examination#73、gzip約12MB超のONNXモデルを含んでいた
  // 経緯があり、examination#100・#105・#112でも同様の理由で先読み対象から除外して
  // きた）は今回も対象から除外する
  precacheUrls: [
    "/",
    "/education/",
    "/education/interview-questions/",
    "/education/mock-interviews/",
    "/settings/allowed-emails/",
    "/settings/line-link/",
    "/settings/profile-edit/",
  ],
  // バックエンドAPI（bot-stackのHTTP API）のホスト名。デプロイでURLが変わった場合は
  // 各アプリのsrc/pages/*.jsx・App.jsxとあわせてここも更新する
  apiHostnames: ["0yqos9utye.execute-api.us-east-1.amazonaws.com"],
  // Cookie（id_token）セッションに依存し、ログイン中アカウントによってレスポンスが
  // 変わる同一オリジンAPI（/_me等、checkAuth.jsが処理するAPIは全て/_で始まる）を
  // Service Workerのキャッシュ対象から除外する（examination#277、dev-standards#284）。
  // これが無いと、家族が同じ端末でアカウントを切り替えた際に、前のアカウントの
  // レスポンス（アイコン画像等）がキャッシュされたまま返り続けてしまう
  noCacheSameOriginPrefixes: ["/_"],
};
