# infra（AWS配信基盤）

Issue #6（AWS配信基盤: S3 + CloudFront + Cognito Google認証）のインフラ定義。Serverless Framework v3系（OSS版、Serverless Dashboardへのログイン不要）を使用する。

## 構成

- `auth-stack/`: Amazon Cognito（User Pool・Google Identity Provider・User Pool Client・Cognitoドメイン）
- `site-stack/`: S3バケット（MkDocsビルド成果物の格納先）・CloudFrontディストリビューション（Origin Access Control経由でS3へアクセス）・Lambda@Edge（`functions/checkAuth.js`、CloudFrontの`viewer-request`イベントで全リクエストの認証チェックを行う）

デプロイは`.github/workflows/deploy.yml`が`main`へのpush時に自動実行する。

## なぜ2つのスタックに分けているか

CloudFrontのドメイン名（`*.cloudfront.net`）はディストリビューション作成後は不変だが、作成前には分からない。一方Cognito User Pool ClientのCallback URL / Logout URLには実際のCloudFrontドメインを含める必要がある（一致しないとCognitoが認可リクエストを拒否する）。この循環依存を解消するため、`deploy.yml`は以下の順序でデプロイする。

1. 既存の`site-stack`があれば、そのCloudFrontドメインを取得する（無ければプレースホルダー`TBD.cloudfront.net`）
2. その値で`auth-stack`をデプロイし、Cognitoの各種IDとシークレットを取得する
3. 取得した値からLambda@Edge用の設定ファイル（`site-stack/functions/configuration.json`、gitには含めない）を生成する
4. `site-stack`をデプロイし、実際のCloudFrontドメインを取得する
5. 手順1で使ったドメインと実際のドメインが異なる場合（＝初回ブートストラップ時のみ）、実ドメインで`auth-stack`をもう一度デプロイし、Callback URL / Logout URLを確定させる

2回目以降の通常デプロイでは、手順1で既に正しいドメインが取れているため、手順5は実行されない（何も変更が無いため`serverless deploy`は差分なしで即座に完了する）。

## 認証フロー（Lambda@Edge: `functions/checkAuth.js`）

CloudFrontの`viewer-request`イベント（キャッシュヒット時も含め全リクエストで実行される）で動作する。

1. リクエストに有効な`id_token`Cookieが無い/検証に失敗した場合、元のパスを`state`パラメータに乗せてCognito Hosted UIのログイン画面へリダイレクトする
2. Googleでログインすると、Cognitoが`/_callback`へ認可コード付きでリダイレクトしてくる。このLambdaが認可コードをトークン（`id_token`・`refresh_token`）に交換し、HttpOnly・Secure・SameSite=LaxのCookieとして保存した上で、`state`に保存しておいた元のパスへリダイレクトする
3. 以降のリクエストは`id_token`Cookieの署名（Cognito JWKS）・有効期限・audience/issuerを検証し、有効であればそのままS3オリジンへ通す
4. `/_logout`へアクセスすると、Cookieを失効させた上でCognito自体のセッションも切って`/`へ戻す

`id_token`の有効期限が切れると再度Cognito Hosted UIへリダイレクトされるが、Cognito Hosted UI自体のセッションが有効な間（既定1時間、User Pool設定で変更可）はGoogleへの再ログインを求められず自動的にコードが発行される。専用のトークンリフレッシュ処理は実装していない（個人利用規模でのシンプルさを優先した）。

## 必要なGitHub Secrets / Variables

参照側リポジトリ（このリポジトリ）の Settings → Secrets and variables → Actions で設定する。

### Secrets（機密情報）

| 名前 | 用途 |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | GitHub ActionsからAWSリソースを操作するIAMユーザーのアクセスキー |
| `AWS_SECRET_ACCESS_KEY` | 同シークレットアクセスキー |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud ConsoleでCognito連携用に作成したOAuthクライアントID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 同クライアントシークレット |

### Variables（必須）

| 名前 | 用途 |
| --- | --- |
| `ALLOWED_EMAILS` | サイトの閲覧を許可するGoogleアカウントのメールアドレス（カンマ区切り）。`checkAuth.js`がid_tokenの`email`クレームと照合し、含まれないアカウントは403で拒否する |

### Variables（任意、既定値あり）

| 名前 | 既定値 | 用途 |
| --- | --- | --- |
| `SITE_BUCKET_NAME` | `bamiyanapp-examination-knowledge` | サイト配信用S3バケット名（**全AWSアカウント間でグローバルに一意**である必要がある。既定値が既に使われている場合はここで別名を指定する） |
| `COGNITO_DOMAIN_PREFIX` | `bamiyanapp-examination` | Cognito Hosted UIのドメインprefix（**リージョン内でグローバルに一意**である必要がある） |

## 初回デプロイ時によくある失敗

- **S3バケット名/Cognitoドメインprefixの重複**: エラーメッセージに`already exists`と出た場合、上記Variablesで別名を指定して再実行する
- **Lambda@Edgeの反映の遅延**: Lambda@Edge関数の作成・更新はCloudFrontの全エッジロケーションへ複製されるまで数分〜十数分かかることがある。デプロイ直後にアクセスして想定と異なる挙動になる場合は、少し時間を置いてから再度確認する
- **IAMユーザーの権限不足**: `AWS_ACCESS_KEY_ID`のIAMユーザーには、S3・CloudFront・Cognito・Lambda・IAM（Lambda実行ロール作成用）・CloudFormationへの十分な権限が必要
