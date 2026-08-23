# infra（AWS配信基盤）

Issue #6（AWS配信基盤: S3 + CloudFront + Cognito Google認証）のインフラ定義。Serverless Framework v3系（OSS版、Serverless Dashboardへのログイン不要）を使用する。

## 構成

- `auth-stack/`: Amazon Cognito（User Pool・Google Identity Provider・User Pool Client・Cognitoドメイン）
- `site-stack/`: S3バケット（MkDocsビルド成果物の格納先）・CloudFrontディストリビューション（Origin Access Control経由でS3へアクセス）・Lambda@Edge（`functions/checkAuth.js`、CloudFrontの`viewer-request`イベントで全リクエストの認証チェックを行う）・DynamoDBテーブル（`examination-allowed-emails`＝閲覧許可メールアドレス一覧、`examination-families`＝家族登録簿、`examination-family-invites`＝家族新規作成の招待一覧。複数家族対応は下記「複数家族対応」参照）
- `bot-stack/`: LINE bot（面接練習・想定問答の登録。[Issue #43](https://github.com/bamiyanapp/examination/issues/43)）。Lambda（`functions/lineWebhook.js`）をLambda Function URLで公開し、LINE Messaging APIのWebhookを受ける。DynamoDBテーブル（`examination-interview-questions`・`examination-bot-sessions`）を持つ

デプロイは`.github/workflows/cd.yml`の`deploy`ジョブが`main`へのpush時に自動実行する。`deploy`ジョブは同じワークフロー内の`release`ジョブ（semantic-release、[Issue #137](https://github.com/bamiyanapp/examination/issues/137)。詳細は`docs/cicd-pipeline-specification.md`参照）に依存（`needs: release`）しており、`release`ジョブが確定させた`package.json`のバージョンを読み取ってから実行される。

## なぜ2つのスタックに分けているか

CloudFrontのドメイン名（`*.cloudfront.net`）はディストリビューション作成後は不変だが、作成前には分からない。一方Cognito User Pool ClientのCallback URL / Logout URLには実際のCloudFrontドメインを含める必要がある（一致しないとCognitoが認可リクエストを拒否する）。この循環依存を解消するため、`cd.yml`は以下の順序でデプロイする。

1. 既存の`site-stack`があれば、そのCloudFrontドメインを取得する（無ければプレースホルダー`TBD.cloudfront.net`）
2. その値で`auth-stack`をデプロイし、Cognitoの各種IDとシークレットを取得する
3. 取得した値からLambda@Edge用の設定ファイル（`site-stack/functions/configuration.json`、gitには含めない）を生成する
4. `site-stack`をデプロイし、実際のCloudFrontドメインを取得する
5. 手順1で使ったドメインと実際のドメインが異なる場合（＝初回ブートストラップ時のみ）、実ドメインで`auth-stack`をもう一度デプロイし、Callback URL / Logout URLを確定させる

2回目以降の通常デプロイでは、手順1で既に正しいドメインが取れているため、手順5は実行されない（何も変更が無いため`serverless deploy`は差分なしで即座に完了する）。

## サイトのキャッシュ戦略（[Issue #72](https://github.com/bamiyanapp/examination/issues/72)）

`.github/workflows/cd.yml`の「Sync site to S3」ステップは、`aws s3 sync`を2回に分けて実行し、ファイル種別ごとに異なる`Cache-Control`ヘッダーを明示的に付与する（静的サイト配信の標準的な戦略）。

- `*assets/*`配下（各Reactアプリ・MkDocs Materialテーマのハッシュ付きJS/CSS。ただし`favicon`は除く）: `public, max-age=31536000, immutable`。内容が変わればファイル名（コンテンツハッシュ）自体が変わるため、長期不変キャッシュにしてよい
- それ以外（`index.html`・`search/search_index.json`・`favicon.svg`等）: `no-cache`。内容が変わってもファイル名が変わらないため、CloudFront・ブラウザともに使用前に必ずオリジンへ再検証（条件付きGET）させる

**このヘッダーを明示的に指定していなかったこと自体が、PWAとして開いた際にサイト更新が反映されない不具合の根本原因だった**（[Issue #72](https://github.com/bamiyanapp/examination/issues/72)）。S3はデフォルトで`Cache-Control`を付与せず、CloudFrontの`DefaultCacheBehavior`（`Managed-CachingOptimized`）はオリジンがヘッダーを返さない場合`DefaultTTL`（1日）でエッジキャッシュする。デプロイ時の`aws cloudfront create-invalidation --paths "/*"`はCloudFrontのエッジキャッシュのみを無効化し、ユーザーのブラウザ本体のキャッシュ（ホーム画面に追加した状態では通常のリロード操作が効きにくい）までは無効化しない。この問題はこの時点ではService Worker等を新設せず、キャッシュヘッダーの是正のみで解消する方針とした。

### 動的エンドポイントはキャッシュ対象から除外する（[Issue #143](https://github.com/bamiyanapp/examination/issues/143)）

`checkAuth.js`（Lambda@Edge）が処理する`/_callback`・`/_logout`・`/_admin/emails`・`/_link-line`・`/_voice-token`は、リクエストのたびに結果が変わる動的エンドポイントである。しかしCloudFrontの`DefaultCacheBehavior`（`Managed-CachingOptimized`）はこれら全パスにも適用されており、このポリシーのキャッシュキーは**クエリ文字列・Cookieを含まずURLパスのみ**のため、あるリクエストへの応答（`/_callback?code=...&state=...`へのリダイレクトや、一時的なエラー）が同じパスへの別のリクエストにもそのまま返り得る状態になっていた。これがログイン後に「invalid state」と表示され続け、TTLが切れるまで誰がログインしても復旧しない不具合の原因だった。

対応として、`site-stack/serverless.yml`の`SiteDistribution`に上記5パスそれぞれの`CacheBehaviors`（`CachingDisabled`、AWSマネージドポリシー）を追加し、`checkAuth`関数の`lambdaAtEdge`もこれらのパスへ関連付けた（1つのLambda関数を複数のキャッシュビヘイビアへ関連付ける場合、`@silvermine/serverless-plugin-cloudfront-lambda-edge`の`lambdaAtEdge`は配列で指定し、各要素の`pathPattern`が対応する`CacheBehaviors`の`PathPattern`と完全一致する必要がある）。

### Service Workerによる先読み・APIキャッシュ（[Issue #118](https://github.com/bamiyanapp/examination/issues/118)）

[Issue #105](https://github.com/bamiyanapp/examination/issues/105)のSpeculation Rules APIはChromium系ブラウザ限定で、Safari（iOS含む）では効果が無い。より確実にページ遷移を高速化するため、`app/top/public/sw.js`（`/sw.js`としてサイトルートから配信）でService Workerを導入した。上記のキャッシュヘッダー方針とは異なり、今回は意図的にStale-While-Revalidate方式を採用する。

- **静的ページの先読み**: `install`イベントで、主要ページ（音声で面接練習ページを除く。理由はexamination#100・#105・#112と同じ）をまとめてキャッシュへ格納する
- **バックエンドAPIのキャッシュ**: `GET /interview-questions`・`GET /mock-interviews`等（`bot-stack`のHTTP API）へのGETリクエストをキャッシュする。POST等の非GETリクエスト（`/_voice-token`発行等）はキャッシュ対象から除外する
- **Stale-While-Revalidate**: キャッシュがあれば即座に返しつつ、裏側で必ずネットワーク取得してキャッシュを更新する。Issue #72で問題になった「更新が永久に反映されない」状態にはならず、[Issue #72](https://github.com/bamiyanapp/examination/issues/72)の方針と両立する……はずだったが、これをページ本体（HTMLナビゲーション）にまで適用していたため、表示が常に「1回前のデプロイ内容」で固定される問題があった（下記「ページ本体はNetwork First」参照）
- **ページ本体はNetwork First**（[Issue #133](https://github.com/bamiyanapp/examination/issues/133)）: `request.mode === "navigate"`（フルページ遷移の標準的な判定方法）のリクエストのみ、Stale-While-Revalidateではなく**Network First**（まずネットワークから取得し、オフライン時のみキャッシュにフォールバック）にする。Stale-While-Revalidateのままだと、`cd.yml`の`aws s3 sync --delete`で削除された古いハッシュ付きJS/CSSを参照する古い`index.html`がキャッシュされ続け、更新後も1回前の内容が表示され続ける（ひどい場合はアセットの404で壊れて見える）ことがあった。ハッシュ付きJS/CSS等のサブリソース・バックエンドAPIは引き続きStale-While-Revalidateのまま（速度優先で問題ない）
- キャッシュ名にはバージョン番号を含め（`examination-static-v1`等）、`activate`イベントで古いバージョンのキャッシュを削除する
- `sw.js`自体はハッシュ付きファイル名ではないため、既存のCache-Control分類上「それ以外」（`no-cache`）に自動的に該当し、追加のcd.yml変更は不要
- 登録は各アプリへ共通コンポーネント（`ServiceWorkerRegistration.jsx`）として複製する既存方針（`NavigationOverlay`等と同様）を踏襲する
- **バックエンドAPIのプロアクティブなウォームアップ**: 上記のバックエンドAPIキャッシュは「そのページを一度でも開いた後にキャッシュされる」受動的な仕組みのため、どのページを最初に開いても`BackendCacheWarmer.jsx`（同じく各アプリへ複製）がバックグラウンドで`/interview-questions`・`/mock-interviews`を先に取得し、Service Workerのキャッシュを温めておく。`/_voice-token`の発行回数には1日あたりの上限がある（[Issue #69](https://github.com/bamiyanapp/examination/issues/69)、20回/日）ため、`sessionStorage`でブラウザセッションあたり1回だけ実行するよう制御し、通常の閲覧だけで上限を消費しないようにしている
- **更新の通知**（[Issue #122](https://github.com/bamiyanapp/examination/issues/122)）: Service Worker導入後、新しいバージョンが有効化されても表示中のページには自動的に反映されず、PWA（ホーム画面に追加した状態）で更新に気づけずホーム画面からの削除・再追加が必要になる問題が起きた。`UpdateNotifier.jsx`（同じく各アプリへ複製）が`navigator.serviceWorker`の`controllerchange`イベントを監視し、ページ読み込み時点で既に有効なService Workerの制御下にあった場合（＝初回インストールではなく既存バージョンからの切り替わりの場合）のみ「新しいバージョンがあります」というバナーを表示する。タップで`location.reload()`する方式とし、入力中のフォーム等を妨げる自動リロードは行わない
- **ビルドバージョン・更新日時の表示**（[Issue #131](https://github.com/bamiyanapp/examination/issues/131)、セマンティックバージョンは[Issue #137](https://github.com/bamiyanapp/examination/issues/137)）: 上記の更新通知はService Workerが切り替わった時にしか出ないプッシュ型のため、任意のタイミングで「今表示されているのはどのバージョンか」を確認する手段として、トップページ（`app/top/src/pages/TopPage.jsx`）のフッターにセマンティックバージョン・ビルドSHA・ビルド日時を表示する。`cd.yml`の`deploy`ジョブ（`release`ジョブに依存）の`app/top`ビルドステップで、`VITE_BUILD_VERSION`（`release`ジョブが更新した`package.json`のバージョン）・`VITE_BUILD_SHA`（`git rev-parse --short HEAD`）・`VITE_BUILD_TIME`（ビルド時刻のUTC ISO8601）を環境変数として設定し、Viteが自動的に`import.meta.env.VITE_*`として公開する仕組みをそのまま利用する（追加のビルド設定は不要）。全アプリを同一コミットから一括ビルドするデプロイのため、トップページのビルド情報をサイト全体のバージョンとして扱う。`docs`/`chore`等バージョンが上がらないコミットではセマンティックバージョンがデプロイのたびには変わらないため、実際に最新がデプロイされたかの確認にはビルドSHA・日時をあわせて使う。ローカル開発時（`npm run dev`）は環境変数が未設定のため「開発版」とフォールバック表示する

## 認証フロー（Lambda@Edge: `functions/checkAuth.js`）

CloudFrontの`viewer-request`イベント（キャッシュヒット時も含め全リクエストで実行される）で動作する。

1. リクエストに有効な`id_token`Cookieが無い/検証に失敗した場合、まず`refresh_token`Cookieがあれば裏側で`grant_type=refresh_token`によりid_tokenの再発行を試みる（下記「セッションの自動延長」参照）。それも無い/失敗した場合は、元のパスを`state`パラメータに乗せてCognito Hosted UIのログイン画面へリダイレクトする
2. Googleでログインすると、Cognitoが`/_callback`へ認可コード付きでリダイレクトしてくる。このLambdaが認可コードをトークン（`id_token`・`refresh_token`）に交換し、HttpOnly・Secure・SameSite=LaxのCookieとして保存した上で、`state`に保存しておいた元のパスへリダイレクトする
3. 以降のリクエストは`id_token`Cookieの署名（Cognito JWKS）・有効期限・audience/issuerを検証し、さらに`email`クレームがDynamoDBテーブル`examination-allowed-emails`に登録されているかを確認する。登録されていれば、MkDocsのディレクトリ形式URL（例: `/education/`）を`index.html`付きのパスへ正規化した上でS3オリジンへ通す。未登録の場合でも、アクセス先が家族新規作成ページ（`/family-create/`）かつ招待済みメールアドレスであれば例外的に通す（下記「複数家族対応」参照）
4. `/_logout`へアクセスすると、Cookieを失効させた上でCognito自体のセッションも切って`/`へ戻す

### ログインCSRF対策のnonce管理（[Issue #143](https://github.com/bamiyanapp/examination/issues/143)）

未認証時のログインリダイレクトでは、第三者が発行させた認可コードをこのブラウザに横流しして紐付けさせる攻撃（ログインCSRF）を防ぐため、`state`パラメータにnonceを埋め込みCognitoから戻ってきた際に照合する。

当初はこのnonceをCookie（`csrf_state`）に保存し照合していたが、以下の要因による「invalid state」再発を繰り返し経験した。

- Service Workerのプリキャッシュ・Speculation Rules APIの先読み等、未認証状態のバックグラウンドリクエストがcsrf_stateクッキーを新しいnonceで上書きしてしまう
- ログアウト直後の再ログイン（Cognito・Googleのセッションが直前まで有効なため認証の往復が高速に完了する）で、Safari等のITP（Intelligent Tracking Prevention、バウンストラッキング対策）がクロスサイトリダイレクト直後のCookieを破棄する影響を受けていたと考えられる

これらはいずれもCSRF検証をブラウザのCookieに依存させていること自体に起因する構造的な脆弱さのため、nonce自体をDynamoDBテーブル`examination-csrf-nonces`（パーティションキー: `nonce`、TTLで自動失効）でサーバー側管理する方式へ変更した。未認証時のリダイレクトでnonceをPutItemし、`/_callback`で`ConditionExpression`付き`DeleteItem`により一度きりの検証・削除を行う（存在しない・期限切れ・使用済みのいずれの場合も「invalid state」として扱う）。ブラウザのCookieの生存・上書きに一切依存しないため、上記のいずれの要因からも影響を受けない。

### セッションの自動延長（refresh_token、[Issue #150](https://github.com/bamiyanapp/examination/issues/150)）

`id_token`（Cognitoの既定で有効期限1時間）が失効しても、`refresh_token`Cookie（Max-Age 30日）が有効な間は、Googleへの完全な再ログイン（アカウント選択・同意画面）を経ずにセッションを継続する。

- `id_token`検証に失敗したリクエストで`refresh_token`Cookieがあれば、`grant_type=refresh_token`でCognitoの`/oauth2/token`へ再発行をリクエストする（`/_callback`の認可コード交換と同じエンドポイント、grant_typeのみ異なる）
- Cognitoは再発行時に新しい`refresh_token`を返さない仕様のため、`refresh_token`Cookie自体は書き換えない
- 再発行に成功したら、新しい`id_token`Cookieを設定した上で元のURIへリダイレクトする（1往復のみで、外部のCognito Hosted UI・Googleへは遷移しない）
- `refresh_token`自体が失効・無効な場合（30日超過、Cognito側での失効等）は再発行を諦め、無駄な再試行を避けるため`refresh_token`Cookie自体を失効させた上で、通常のログインフロー（Cognito Hosted UI経由）へフォールバックする

### ログイン中のユーザー表示・ログアウト（`/_me`、`UserMenu.jsx`、Issue #150）

- `checkAuth.js`が`GET /_me`として、ログイン中のユーザーの`email`・`name`・`picture`（Googleアカウントのプロフィール画像URL）をJSONで返す。`name`・`picture`は`auth-stack`のGoogleIdentityProvider `AttributeMapping`で追加した属性で、Googleログイン時にCognitoのユーザー属性へ反映されたものがid_tokenのクレームとして返る（未設定の場合は空文字）
- 各アプリ共通のReactコンポーネント`UserMenu.jsx`（`NavigationOverlay`等と同様、ファイルコピーで複製）が`/_me`を取得し、画面右上にアイコン・名前を表示するドロップダウンメニューを出す。`picture`が無い場合は名前・emailの頭文字にフォールバックする
- メニューの「ログアウト」は既存の`/_logout`（Cognito自体のセッションも切る）へのリンク

## 閲覧許可メールアドレスの管理（DynamoDB + `/_admin/emails`）

サイトの閲覧を許可するメールアドレスはDynamoDBテーブル`examination-allowed-emails`（パーティションキー: `email`、`familySlug`属性で所属家族を表す）で管理する。GitHub Secrets/Variablesではなく、既に許可されたユーザー自身がサイト上から追加・削除できる。複数家族対応（[Issue #44](https://github.com/bamiyanapp/examination/issues/44)）により、一覧・追加・削除はいずれも**自分の所属家族のメンバーの範囲**に限定される（下記「複数家族対応」参照）。

- 管理UI: サイト内の「設定 → 閲覧許可メールアドレス管理」ページ（Reactアプリ`app/allowed-emails/src/pages/AllowedEmails.jsx`。旧`knowledge/settings/allowed-emails.md`の埋め込みJSから移植、[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）。同じ画面から家族新規作成の招待（下記「複数家族対応」参照）も発行・取り消しできる
- API: `checkAuth.js`が`GET/POST /_admin/emails`として提供する（既に許可されているアカウントでログイン中のみ利用可能）
  - `GET`: 自分の所属家族のメンバー一覧（`emails`）と、保留中の家族新規作成招待一覧（`invites`）を返す
  - `POST {"action":"add","email":"..."}`: 自分の家族へ追加する（既に何らかの家族に所属しているメールアドレスは追加不可。1メール=1家族のv1制約）
  - `POST {"action":"remove","email":"..."}`: 自分の家族から削除する（自分自身、および自分の家族に所属していないメールアドレスは削除不可）
  - `POST {"action":"invite-family-creator","email":"..."}` / `{"action":"revoke-invite","email":"..."}`: 家族新規作成の招待を発行・取り消しする（家族単位ではなく全メンバー共通の操作）
- 初期値: `cd.yml`の「Seed initial allowed emails」ステップが、テーブルが空の場合のみ投入する（既存ユーザーが削除した後の再デプロイで復活することはない。全件削除された場合のみ、締め出し防止のため次回デプロイで初期値に戻る）
- 反映タイミング: `checkAuth.js`はLambda@Edgeの実行環境（エッジロケーションごとに独立）内で許可判定を60秒キャッシュするため、追加・削除は最大60秒程度で全世界に反映される（即時ではない）

## 複数家族対応（[Issue #44](https://github.com/bamiyanapp/examination/issues/44)）

自分の親戚・知人など限定的な範囲を想定した複数家族対応。不特定多数向けの公開サービスは目指さないため、Googleアカウントさえあれば誰でも家族を作成できる設計は採らず、**招待制**にしている。

- **URLは変更しない**: 8つの独立ビルドReactアプリ・MkDocs・Service Worker・PWA manifestがすべて固定パスを前提に実装済みのため、URLに家族を埋め込む設計（`/families/<slug>/...`）は採らない。v1では「1メール=1家族」に限定されるため、**ログインすること自体が実質的な家族選択**になる
- **データモデル**:
  - `examination-families`（パーティションキー: `slug`＝作成時にランダム生成する短縮ID）: 家族の登録簿。属性`name`（表示名、一意性をアプリ側でチェック）・`createdBy`・`createdAt`
  - `examination-allowed-emails`の`familySlug`属性: そのメールアドレスがどの家族に所属するか
  - プロフィール（`examination-family-profile`）・想定問答（`examination-interview-questions`）・模擬面接記録（`examination-mock-interviews`）は、いずれも`familySlug`をパーティションキー（または属性）に持ち、家族単位でデータが分離される
- **家族解決**: `bot-stack`の`apiAuth.js`（`verifyBearerEmail`）・`lineWebhook.js`（`getAllowedEmailRecord`）、`site-stack`の`checkAuth.js`（`getAllowedEmailRecord`）は、いずれも許可判定のために行っている`examination-allowed-emails`への`GetItem`の結果から`familySlug`もあわせて返す（追加のDB往復は発生しない）。各データアクセス関数（`familyProfile.js`・`interviewQuestionsStore.js`・`interviewQuestions.js`・`mockInterviews.js`）は呼び出し元から`familySlug`を引数で受け取る。旧`familyConfig.js`（`FAMILY_SLUG`固定値）は撤去済み
- **家族の新規作成（招待制）**:
  1. 既存メンバーが「設定 → 閲覧許可メールアドレス管理」から新しい家族を作りたい相手のメールアドレスを「招待する」（`examination-family-invites`パーティションキー: `email`へ登録。招待メール送信のような別チャネルは使わない）
  2. 招待されたメールアドレスでGoogleログインすると、`checkAuth.js`は（`examination-allowed-emails`にまだ存在しないため）通常は403にする代わりに、アクセス先が`/family-create/`かつ招待済みであることを確認した上で例外的に通す（ログイン直後の`/_callback`・通常リクエスト・`refresh_token`再発行の3箇所すべてで同じ判定をする）
  3. `/family-create/`（Reactアプリ`app/family-create/`。他アプリと異なりPWA化・`UserMenu`等の共通コンポーネントは持たない。理由は`src/App.jsx`のコメント参照）で家族名を入力すると、`POST /_families`（`checkAuth.js`の`createFamily`）が招待済み・未所属・家族名ユニークを確認した上で`examination-families`へ新規行を作成し、作成者自身を`examination-allowed-emails`へ追加する。招待は成功時に消費（削除）される一度きりの利用
- **メンバー管理**: 上記「閲覧許可メールアドレスの管理」の通り、一覧・追加・削除は自分の所属家族の範囲に限定される
- **初期データ**: `cd.yml`の「Seed families table and backfill familySlug」ステップが、`examination-families`が空の場合のみ初期家族（`chofu-suzuki`＝調布の鈴木家）を投入し、`familySlug`属性が未設定の既存の許可メールアドレスへ同じslugをバックフィルする（冪等）
- 一部の一度きりの移行スクリプト（`scripts/seed-interview-questions.js`・`scripts/seed-mock-interviews.js`）は、旧Markdownファイルに由来する調布の鈴木家固有のデータを移行するものであり、意図的に`chofu-suzuki`をハードコードしたまま残している（他家族の作成・運用には影響しない）

## LINE bot（`bot-stack/`）

面接練習・想定問答の登録をLINEから行える。`site-stack`とは独立したスタックだが、`site-stack`が所有するテーブル（`examination-line-link-codes`・`examination-allowed-emails`）へのクロスリージョンアクセスを無くすため、`site-stack`と同じ`us-east-1`にデプロイする（[Issue #63](https://github.com/bamiyanapp/examination/issues/63)。`bot-stack`自体にはLambda@Edgeのようなリージョン制約は無いが、統一した方がシンプルなため）。Webhookは**API Gateway（HTTP API）**経由で公開する（認証はLINEの署名検証`X-Line-Signature`で行う）。

> 当初はLambda Function URL（`AuthType: NONE`）で直接公開していたが、このAWSアカウントではFunction URLの匿名アクセスがAWS側で`403 Forbidden`（`AccessDeniedException`）を返す状態にあり、`AuthType`・リソースベースポリシー・関数の状態はすべて正しいにもかかわらず解消しなかった（[Issue #52](https://github.com/bamiyanapp/examination/issues/52)）。同一アカウントでAPI Gateway経由の公開エンドポイントは実績があるため、HTTP APIへ切り替えた。HTTP APIのペイロード形式（payload format 2.0）はFunction URLと同一のため、`functions/lineWebhook.js`のハンドラー側の変更は不要だった。

- 会話フロー: 「面接練習」で「本人」「父」「母」のいずれの練習かを確認した上で、保存済みのプロフィール（シチュエーション・志望先の特色・その他前提情報、[Issue #125](https://github.com/bamiyanapp/examination/issues/125)・[Issue #135](https://github.com/bamiyanapp/examination/issues/135)。下記「プロフィール編集」参照）を参照してGemini APIとのマルチターン会話（質問→回答→フィードバックと次の質問、を繰り返す）を開始する「練習モード」。以前はロール選択に続けてシチュエーション・志望先の特色・その他前提情報もLINE上で毎回自由入力させていたが、練習の度に入力し直すものではないため、プロフィール編集画面での編集に一本化しロール選択の直後に練習を開始するようにした（ロール自体は練習のたびに変わり得るため引き続きLINE上で選ぶ）。「終了」と送ると練習を終了する。会話ロジックは音声対話（`voiceChat.js`）と共通化しており（`geminiConversation.js`、[Issue #76](https://github.com/bamiyanapp/examination/issues/76)）、AIがその場で質問を生成するため、練習の出題内容自体は`examination-interview-questions`のデータに依存しない。もう1つは「質問を登録」で自由文からGemini APIが想定問答を抽出し確認の上DynamoDBへ保存する「登録モード」（いずれもLINEアカウントの連携が完了している場合のみ利用可能。下記参照）
- **深掘り質問**（[Issue #126](https://github.com/bamiyanapp/examination/issues/126)）: 以前は必ず1問1答（フィードバック後は必ず新しい話題の質問へ進む）だったが、`buildSystemPrompt`の指示に、相手の回答が抽象的・具体性に欠ける場合は新しい話題に移る代わりに同じ話題を掘り下げる追加質問をしてよい旨を追加した。同じ話題への深掘りが延々と続かないよう「続けて2回まで」という上限も明示している
- フィードバックの内容: 回答に対するフィードバックは、模範解答・改善ポイントを含む内容にしている（[Issue #89](https://github.com/bamiyanapp/examination/issues/89)）。音声（読み上げ・チャット表示）とLINE（テキスト表示）で最適な情報量が異なるため、`geminiConversation.js`の`buildSystemPrompt`が1回のGemini呼び出しで「voice」（読み上げ用の簡潔な話し言葉）・「text」（模範解答・改善ポイントを含む詳しい内容）の2種類をJSON形式で生成させ、`parseDualReply`でパースする。音声対話ページは`voice`を表示・読み上げの両方に使い、LINEは`text`をそのまま返信に使う。次ターンのGeminiへの入力コンテキスト（会話履歴）にはどちらのチャネルも`text`を記録する。Geminiが厳密なJSON以外を返した場合は生テキストを両方にフォールバックさせる
- データ: `examination-interview-questions`（登録モードで蓄積する想定問答本体。練習モードの出題には現在使用していない）・`examination-bot-sessions`（会話状態。練習モード中は選択したロール・保存済みプロフィールから読み込んだシチュエーション・志望先特色・会話履歴を`practiceState`属性にJSON文字列として保持し、TTLで自動失効）・`examination-line-links`（LINEアカウントとGoogleアカウントの紐付け、下記参照）・`examination-mock-interviews`（模擬面接記録、下記参照）・`examination-family-profile`（プロフィール、下記「プロフィール編集」参照）
- **模擬面接記録の自動サマリー化**（[Issue #93](https://github.com/bamiyanapp/examination/issues/93)）: 練習モード終了時（LINEの「終了」コマンド／音声対話ページの「練習を終える」ボタン）、それまでの会話履歴をGeminiが振り返り「よかった点」「改善が必要な点」「次回までのアクション」の3項目でサマリーを生成し、`examination-mock-interviews`（`familySlug`・`sessionId`をキーとする新規テーブル）へ保存する（`geminiConversation.js`の`summarizeMockInterview`、`mockInterviews.js`の`saveMockInterviewSummary`）。ユーザーの発言が1件も無い（誤操作等の）セッションは記録の対象外とする（`hasMeaningfulContent`）。旧`knowledge/education/mock-interviews.md`の既存記録2件は`scripts/seed-mock-interviews.js`で一度きり同じテーブルへ移行し、以降このMarkdownファイルは更新しない（記録の閲覧画面は下記「模擬面接記録の閲覧」を参照）
- **想定問答データはDynamoDB（`examination-interview-questions`）を唯一の正本とする**（[Issue #77](https://github.com/bamiyanapp/examination/issues/77)）。`knowledge/education/interview-*.md`は今後の追記・編集は行わず、`cd.yml`の「Sync interview questions from Markdown」ステップ（`scripts/seed-interview-questions.js`）が毎回のデプロイでMarkdownの内容をDynamoDBへ同期する。`familySlug`・`category`・`question`から決定的な`questionId`（SHA-256ハッシュ）を生成しているため、同じ行を何度でも安全に上書きでき、LINE botの登録モード（`saveQuestion`、時刻+ランダム値のID）で追加された行とはID体系が異なり衝突しない。各行の属性: `category`・`targetPerson`（対象者: 本人/父/母。閲覧画面のフィルタリング用、下記参照）・`question`・`answer`（回答の要点）・`example`（盛り込む具体例、無い場合は空文字）・`impression`（面接官への印象、無い場合は空文字）・`modelAnswer`（AIによる模範解答。現時点では空文字のプレースホルダーで、生成ロジックは未実装）。想定問答の閲覧画面（React、1画面統合）は下記「想定問答の閲覧」を参照
- 複数家族対応は上記「複数家族対応」を参照
- 初回デプロイ後、Job Summaryに表示されるWebhook URL（`<HTTP APIのURL>/webhook`）を、LINE Developers ConsoleのMessaging APIチャネル設定でWebhook URLとして登録する必要がある（URLが変わった場合のみ再登録が必要）

## LINEアカウントとGoogleアカウントの紐付け（[Issue #49](https://github.com/bamiyanapp/examination/issues/49)）

LINE botはLINEアカウント自体に閲覧許可の概念を持たない（誰でもLINE公式アカウントを友だち追加できてしまう）ため、botの機能（練習・登録）を使う前にサイトの閲覧許可（Google/Cognitoログイン）済みアカウントとの紐付けを必須とする。ワンタイムコード方式で、既存のCognito認証をそのまま流用する。

1. サイトの「設定 → LINE連携」ページ（Reactアプリ`app/src/pages/LineLink.jsx`。旧`knowledge/settings/line-link.md`の埋め込みJSから移植、[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）で「コードを発行」を押すと、`site-stack`（`checkAuth.js`）の`POST /_link-line` APIが呼ばれる。ログイン中のメールアドレスと紐付けた6桁のワンタイムコードを発行し、DynamoDBテーブル`examination-line-link-codes`（パーティションキー: `code`、TTL 10分）へ保存する
2. 発行されたコードをLINE公式アカウントのトークへ送信すると、`bot-stack`（`lineWebhook.js`）が`examination-line-link-codes`をクロススタックで検証し、有効であれば消費（削除）した上で、そのメールアドレスが`examination-allowed-emails`に存在するかを確認する。許可されていれば`examination-line-links`（パーティションキー: `lineUserId`）へLINEユーザーIDとメールアドレスの紐付けを保存する
3. 以降、そのLINEアカウントからのメッセージは`examination-line-links`で紐付け先メールアドレスを引き、`examination-allowed-emails`での許可を都度確認した上で練習・登録機能を提供する。未連携のアカウント、コードが無効/期限切れの場合、紐付け先メールアドレスの許可が取り消された場合は、それぞれ案内メッセージを返して機能を提供しない
4. `bot-stack`のLambda実行ロールには、`site-stack`が所有する`examination-line-link-codes`・`examination-allowed-emails`への最小権限（コード側はGetItem/DeleteItem、許可メール側はGetItemのみ）を、別Serverless serviceへのARNを`Fn::Sub`で直接組み立てて付与している（同一CloudFormationスタックでないためExportsは使えない。`bot-stack`を`site-stack`と同じ`us-east-1`に統一済み（Issue #63）のため、クロススタックではあるがクロスリージョンではない）

## 音声で面接練習（[Issue #62](https://github.com/bamiyanapp/examination/issues/62)）

サイトのページ（Reactアプリ`app/voice-practice/src/pages/VoicePractice.jsx`。旧`knowledge/education/voice-practice.md`の埋め込みJSから移植、[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）から、声で面接練習ができる。LINE botの練習モードとは別の、ブラウザだけで完結する会話形式の機能。チャット風UIでユーザー自身の発言（音声認識結果）とAI応答の両方を表示する。

- 音声認識（STT）・音声合成（TTS）: ブラウザ標準API（`SpeechRecognition`/`SpeechSynthesis`）を使う。ブラウザ実装への依存・認識精度のばらつきを解消するため、一時期ブラウザ内で動作するAIモデル（STT: `@huggingface/transformers` + `onnx-community/kotoba-whisper-v2.2-ONNX`、TTS: `piper-plus` + `ayousanz/piper-plus-css10-ja-6lang`）へ置き換えた（[Issue #73](https://github.com/bamiyanapp/examination/issues/73)）。しかしサンドボックス環境から外部ネットワーク（huggingface.co等）への実アクセスを確認できないまま公開してしまい、実際のユーザー環境では音声認識・合成のいずれも動作せず、onnxruntime-webのWASMバイナリ（gzip後約12MB超）により読み込みも重くなっていたことが判明したため、[Issue #112](https://github.com/bamiyanapp/examination/issues/112)でブラウザ標準APIへ戻した。いずれの方式でもブラウザ内（クライアント）で完結し、バックエンドとのやり取りは引き続きテキストのみ
- リアルタイム音声ストリーミング（OpenAI Realtime API等）は採用しない。AI利用料が数倍になる、WebRTC等の実装・運用が複雑になる、Lambdaベースの現在構成との親和性が低い、家族利用規模では費用対効果が低いため。バックエンドとの通信は常にテキストとし、音声処理はブラウザ側（クライアント）に寄せる設計とした
- 認証: `bot-stack`のAPI（`voiceChat.js`、`POST /voice-chat`）はブラウザから直接呼ばれるクロスオリジンのAPIで、`site-stack`のHttpOnly Cookie（`id_token`）はクロスオリジンでは自動送信されないため、専用の短期トークン方式を採る
  1. サイトの音声練習ページを開いた状態で「会話を始める」を押すと、同一オリジンの`site-stack`（`checkAuth.js`）の`POST /_voice-token` APIがログイン中のユーザーを確認した上で短期トークン（有効期限1時間）を発行し、`examination-voice-tokens`（パーティションキー: `token`、TTLで自動失効）へ保存する
  2. ブラウザのJSがそのトークンをBearerトークンとして`bot-stack`の`POST /voice-chat`へ送る。`voiceChat.js`がトークンを検証（クロススタック、有効期限確認）した上で、紐づくメールアドレスが`examination-allowed-emails`に存在するかを確認する
  3. 認証済みのリクエストのみ、選択されたロール（本人/父/母）・保存済みプロフィール（シチュエーション・志望先の特色・その他前提情報、[Issue #76](https://github.com/bamiyanapp/examination/issues/76)・[Issue #125](https://github.com/bamiyanapp/examination/issues/125)・[Issue #135](https://github.com/bamiyanapp/examination/issues/135)。`voiceChat.js`がサーバー側で`examination-family-profile`から直接解決し、クライアントからの送信値は使わない。小学校受験に限らない汎用的な面接練習に対応する）に応じたシステムプロンプトとともにGemini API（LINE botと同じ`GEMINI_API_KEY`を使い回す。新規Secretは不要）へ会話履歴を送り、応答テキストを返す。会話履歴はサーバー側では保持せず、ブラウザ側のJSが保持して毎回送り直す（ステートレス設計）
- `bot-stack`のHTTP APIはCORSを有効化している（`provider.httpApi.cors: true`）。LINE Webhook（`/webhook`）はサーバー間通信のためCORSヘッダーの付与自体は影響しない
- **`/_voice-token`の1日あたりの発行上限**（[Issue #69](https://github.com/bamiyanapp/examination/issues/69)、上限値は[Issue #124](https://github.com/bamiyanapp/examination/issues/124)で見直し）: 誤操作・アカウント乗っ取り等でAPI呼び出しが想定外に増えるリスクを抑えるため、メールアドレスごとに1日あたり1000回（`checkAuth.js`の`VOICE_TOKEN_DAILY_LIMIT`定数、運用しながら調整可能）まで発行を許可する。`examination-voice-token-issuance`（パーティションキー: `emailDate`＝`email#YYYY-MM-DD`の複合文字列、TTLで自動失効）へ`UpdateItem`（`ADD` + `ConditionExpression`）でアトミックにインクリメント・上限判定し、上限超過時は429を返す
- **Gemini API呼び出し回数そのものの1日あたりの上限**（[Issue #124](https://github.com/bamiyanapp/examination/issues/124)）: `/_voice-token`の発行回数上限とは別に、1回のトークン（有効期限1時間）で理論上何度でも呼べてしまうGemini呼び出し自体を、アカウント（email）ごとに1日あたり100回（`bot-stack/functions/aiApiLimit.js`の`AI_API_DAILY_LIMIT`定数）まで許可する。上記と同じ`UpdateItem`（`ADD` + `ConditionExpression`）パターンで新規テーブル`examination-ai-api-issuance`（bot-stack所有）へアトミックにインクリメント・上限判定する。音声対話ページ（`voiceChat.js`）・LINE bot（`lineWebhook.js`）の両チャネルが同じアカウント単位でカウントを共有するため、`voiceChat.js`はBearerトークンから解決したemailを、`lineWebhook.js`は`examination-line-links`で解決した連携先emailを使う。上限超過時、音声対話ページは429を、LINE botは案内メッセージを返す（会話・登録どちらの起点のGemini呼び出しにも適用する）

## 想定問答の閲覧（[Issue #77](https://github.com/bamiyanapp/examination/issues/77)）

サイトのページ（Reactアプリ`app/interview-questions/src/pages/InterviewQuestions.jsx`）から、想定問答（本人/父/母の全件）を1画面で閲覧できる。旧: `knowledge/education/interview-yosuke.md`（父）・`interview-tomoyo.md`（母）・`interview-ritsu.md`（本人）の3ページに分かれていたMkDocs表示をやめ、対象者ごとにページを分割せず1画面へ統合した。

- データ: `examination-interview-questions`を唯一の正本とし、各行に`targetPerson`（本人/父/母）属性を持つ。既存の`category`属性（面接種別、例:「父の保護者面接」）とは別の項目で、フィルタリング・表示専用。Markdown由来の131件は`scripts/seed-interview-questions.js`が`category`から`targetPerson`を導出してバックフィルし、LINE bot登録モード（`saveQuestion`）で新規追加される行も同様に導出して保存する
- API: `bot-stack`の`GET /interview-questions`（`functions/interviewQuestions.js`）が familySlug配下の全件を返す。認証は音声対話と同じ短期トークン方式（`apiAuth.js`に共通化。トークン名は`/_voice-token`のままだが、音声対話専用ではなく「ログイン済み・許可済みユーザーであることの証明」として複数のAPIで共用する）
- 画面: 対象者（すべて/本人/父/母）でのフィルタボタンを持つが、ページ自体は1つのみ（本人/父/母でURL・ファイルを分割しない）

## 模擬面接記録の閲覧（[Issue #103](https://github.com/bamiyanapp/examination/issues/103)）

サイトのページ（Reactアプリ`app/mock-interviews/src/pages/MockInterviews.jsx`）から、蓄積された模擬面接記録（AIサマリー）を作成日時の降順で一覧閲覧できる。旧: `knowledge/education/mock-interviews.md`への手書き記録をMkDocsで表示していたのをやめ、DynamoDB（`examination-mock-interviews`）を唯一の正本とする画面へ置き換えた。

- API: `bot-stack`の`GET /mock-interviews`（`functions/mockInterviewsApi.js`、`mockInterviews.js`の`listMockInterviewSummaries`）が familySlug配下の全件を`ScanIndexForward: false`で新しい順に返す。認証は想定問答の閲覧画面と同じ短期トークン方式（`/_voice-token`）
- 画面: 役割・状況（シチュエーション）・志望先の特色・記録日時・サマリー本文をカード形式で表示する。記録が0件の場合は空状態メッセージを表示する

## プロフィール編集（[Issue #125](https://github.com/bamiyanapp/examination/issues/125)、[Issue #135](https://github.com/bamiyanapp/examination/issues/135)）

サイトのページ（Reactアプリ`app/profile-edit/src/pages/ProfileEdit.jsx`）から、面接練習（音声対話ページ・LINE bot）で使う「シチュエーション」「志望先の特色」「その他前提情報」を編集・保存できる。以前は音声対話ページの練習開始フォーム・LINEの練習開始フローの両方で毎回自由入力させていたが、練習の度に入力し直すものではないため、この専用画面へ編集機能を一本化した（ロール〈本人/父/母〉は練習のたびに変わり得るため、引き続き練習画面側で選ぶ）。

- データ: `examination-family-profile`（familySlugをパーティションキーとし、家族単位で1件のみ保持する）を唯一の正本とする。属性は`situation`・`schoolCharacteristics`・`otherContext`（いずれも最大500文字）・`updatedBy`・`updatedAt`。`situation`は未設定時`DEFAULT_SITUATION`（「小学校受験の面接」）にフォールバックする
- API: `bot-stack`の`GET/POST /family-profile`（`functions/familyProfileApi.js`、データアクセスは`functions/familyProfile.js`に切り出し）。認証は想定問答の閲覧画面と同じ短期トークン方式（`/_voice-token`）。`GET`は現在の値（`schoolCharacteristics`・`otherContext`は未設定時空文字）を返し、`POST`は`{situation, schoolCharacteristics, otherContext}`を受け取り上書き保存する
- 参照側:
  - 音声対話ページ（`voiceChat.js`）は練習開始・各ターンのGemini呼び出しのたびにサーバー側で`getFamilyProfile()`から直接値を解決する。クライアント（`VoicePractice.jsx`）から`situation`・`schoolCharacteristics`・`otherContext`を送ることはできず、送っても無視される。画面には参照用に読み込み専用で現在の値を表示し、「プロフィール編集で変更する」リンクで編集画面へ誘導する
  - LINE bot（`lineWebhook.js`）は練習開始時（ロール選択の直後）にサーバー側で`getFamilyProfile()`から値を解決する。以前あった「シチュエーション」「志望先の特色」「その他前提情報」をLINE上で追加入力させる3ステップは撤去し、ロール選択の直後に練習が始まる
- 家族向けサイトのためユーザーごとではなく家族（`familySlug`）単位で1件のみ保持する（複数家族対応は上記「複数家族対応」参照）

## 必要なGitHub Secrets / Variables

参照側リポジトリ（このリポジトリ）の Settings → Secrets and variables → Actions で設定する。

### Secrets（機密情報）

| 名前 | 用途 |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | GitHub ActionsからAWSリソースを操作するIAMユーザーのアクセスキー |
| `AWS_SECRET_ACCESS_KEY` | 同シークレットアクセスキー |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud ConsoleでCognito連携用に作成したOAuthクライアントID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 同クライアントシークレット |
| `LINE_CHANNEL_SECRET` | LINE Developers ConsoleでMessaging APIチャネルを作成して取得するChannel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | 同チャネルのChannel Access Token（長期） |
| `GEMINI_API_KEY` | Google AI Studioで発行するGemini APIキー（LINE bot・音声対話機能の両方で使用） |

### Variables（任意、既定値あり）

| 名前 | 既定値 | 用途 |
| --- | --- | --- |
| `SITE_BUCKET_NAME` | `bamiyanapp-examination-knowledge` | サイト配信用S3バケット名（**全AWSアカウント間でグローバルに一意**である必要がある。既定値が既に使われている場合はここで別名を指定する） |
| `COGNITO_DOMAIN_PREFIX` | `bamiyanapp-examination` | Cognito Hosted UIのドメインprefix（**リージョン内でグローバルに一意**である必要がある） |

## 初回デプロイ時によくある失敗

- **S3バケット名/Cognitoドメインprefixの重複**: エラーメッセージに`already exists`と出た場合、上記Variablesで別名を指定して再実行する
- **Lambda@Edgeの反映の遅延**: Lambda@Edge関数の作成・更新はCloudFrontの全エッジロケーションへ複製されるまで数分〜十数分かかることがある。デプロイ直後にアクセスして想定と異なる挙動になる場合は、少し時間を置いてから再度確認する
- **IAMユーザーの権限不足**: `AWS_ACCESS_KEY_ID`のIAMユーザーには、S3・CloudFront・Cognito・Lambda・DynamoDB・IAM（Lambda実行ロール作成用）・CloudFormationへの十分な権限が必要
