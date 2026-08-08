## [1.2.3](https://github.com/bamiyanapp/examination/compare/v1.2.2...v1.2.3) (2026-08-08)


### Bug Fixes

* **auth:** CSRF対策のnonce検証をCookieからDynamoDBへ変更する ([#154](https://github.com/bamiyanapp/examination/issues/154)) ([d351a5e](https://github.com/bamiyanapp/examination/commit/d351a5e6a31f138c10cbd1574d439ed7fd8b25aa)), closes [#143](https://github.com/bamiyanapp/examination/issues/143)

## [1.2.2](https://github.com/bamiyanapp/examination/compare/v1.2.1...v1.2.2) (2026-08-08)


### Bug Fixes

* **auth:** Speculation Rules APIの先読みによるinvalid state再発を修正 ([#153](https://github.com/bamiyanapp/examination/issues/153)) ([fe34292](https://github.com/bamiyanapp/examination/commit/fe342927b69c7201173ec1400dbad6d8966f0750)), closes [#143](https://github.com/bamiyanapp/examination/issues/143)

## [1.2.1](https://github.com/bamiyanapp/examination/compare/v1.2.0...v1.2.1) (2026-08-08)


### Bug Fixes

* **auth:** UserPoolClientのReadAttributesにname・pictureを明示する ([#152](https://github.com/bamiyanapp/examination/issues/152)) ([a3d22e7](https://github.com/bamiyanapp/examination/commit/a3d22e79abd4ec9286fd27ea5ebda036b7344b0d)), closes [#150](https://github.com/bamiyanapp/examination/issues/150)

# [1.2.0](https://github.com/bamiyanapp/examination/compare/v1.1.1...v1.2.0) (2026-08-08)


### Features

* **auth:** ログインユーザー表示・ログアウト導線とセッション自動延長を追加 ([#151](https://github.com/bamiyanapp/examination/issues/151)) ([d9c111b](https://github.com/bamiyanapp/examination/commit/d9c111ba78bb2e05c16182dab671e3ff4963e054)), closes [#150](https://github.com/bamiyanapp/examination/issues/150)

## [1.1.1](https://github.com/bamiyanapp/examination/compare/v1.1.0...v1.1.1) (2026-08-07)


### Bug Fixes

* **pwa:** Safari/iOSでのinvalid state再発とPWA更新未検知を修正 ([#149](https://github.com/bamiyanapp/examination/issues/149)) ([7445a40](https://github.com/bamiyanapp/examination/commit/7445a40a25609cff7fadf4f8640b9c902fbc3f2f)), closes [#143](https://github.com/bamiyanapp/examination/issues/143) [#122](https://github.com/bamiyanapp/examination/issues/122)

# [1.1.0](https://github.com/bamiyanapp/examination/compare/v1.0.3...v1.1.0) (2026-08-07)


### Features

* **interview:** 練習の回答から模範解答・面接官への印象を生成し想定問答へ反映する ([#148](https://github.com/bamiyanapp/examination/issues/148)) ([c63e91d](https://github.com/bamiyanapp/examination/commit/c63e91d0b418c763b4f66ef6e86ada41cb775b74)), closes [#147](https://github.com/bamiyanapp/examination/issues/147)

## [1.0.3](https://github.com/bamiyanapp/examination/compare/v1.0.2...v1.0.3) (2026-08-07)


### Bug Fixes

* **auth:** 未認証のバックグラウンドfetchがcsrf_stateを上書きしないようにする ([#146](https://github.com/bamiyanapp/examination/issues/146)) ([c71ea18](https://github.com/bamiyanapp/examination/commit/c71ea188c1e7c5f5ad4e6072488bf58b7147c2eb)), closes [#143](https://github.com/bamiyanapp/examination/issues/143)

## [1.0.2](https://github.com/bamiyanapp/examination/compare/v1.0.1...v1.0.2) (2026-08-07)


### Bug Fixes

* **ui:** 残っていたテキストのみのローディング表現をスピナーに統一する ([#145](https://github.com/bamiyanapp/examination/issues/145)) ([3c1b66f](https://github.com/bamiyanapp/examination/commit/3c1b66f9a2f48c3a4af5883dabe2fa595440179d)), closes [#107](https://github.com/bamiyanapp/examination/issues/107)

## [1.0.1](https://github.com/bamiyanapp/examination/compare/v1.0.0...v1.0.1) (2026-08-07)


### Bug Fixes

* **auth:** 動的エンドポイントをCloudFrontのキャッシュ対象から除外する ([#144](https://github.com/bamiyanapp/examination/issues/144)) ([e586529](https://github.com/bamiyanapp/examination/commit/e586529628105a2f0b72a5278a913401d1a23418)), closes [#143](https://github.com/bamiyanapp/examination/issues/143)

# 1.0.0 (2026-08-07)


### Bug Fixes

* **bot-stack:** LINE WebhookをLambda Function URLからAPI Gateway経由へ変更 ([#59](https://github.com/bamiyanapp/examination/issues/59)) ([8bdf564](https://github.com/bamiyanapp/examination/commit/8bdf56469b667aca1f17ec0451b72677798a339f))
* **cd:** permissions不足によるstartup_failureを修正 ([#141](https://github.com/bamiyanapp/examination/issues/141)) ([73cb8c0](https://github.com/bamiyanapp/examination/commit/73cb8c0a0001e401e34f9b8c95ee7b94b36fa10c)), closes [#140](https://github.com/bamiyanapp/examination/issues/140)
* **ci:** reusable-ci.ymlの参照タグをv1.14.1へ更新 ([1f04a4b](https://github.com/bamiyanapp/examination/commit/1f04a4b5deab8fb5ea2c60b9b45b24db59c7dce5))
* **ci:** reusable-ci.ymlの参照タグをv1.14.2へ更新 ([#22](https://github.com/bamiyanapp/examination/issues/22)) ([248c649](https://github.com/bamiyanapp/examination/commit/248c64925f0820db2f2bb6cdab59f51b5a773d79))
* **deploy:** S3同期時にCache-Controlを明示指定しPWAでの更新反映漏れを解消する ([#98](https://github.com/bamiyanapp/examination/issues/98)) ([ffada5b](https://github.com/bamiyanapp/examination/commit/ffada5bc1c45408c810b57107d9d5ad243ebb479)), closes [#72](https://github.com/bamiyanapp/examination/issues/72)
* **deploy:** serverless deployに--forceを付与し設定反映漏れを防ぐ ([#53](https://github.com/bamiyanapp/examination/issues/53)) ([7f4aaca](https://github.com/bamiyanapp/examination/commit/7f4aaca2f7b72390175cf4f5ae0dac65143e8538))
* **deploy:** ステップ名のコロンによるYAML構文エラーを修正する ([#99](https://github.com/bamiyanapp/examination/issues/99)) ([f93353e](https://github.com/bamiyanapp/examination/commit/f93353e7be9ff90bc88c9fc1b6ad753537663c34)), closes [#92](https://github.com/bamiyanapp/examination/issues/92)
* Gemini APIの廃止済みモデルgemini-2.0-flashをgemini-2.5-flashへ変更 ([#75](https://github.com/bamiyanapp/examination/issues/75)) ([c12fa4b](https://github.com/bamiyanapp/examination/commit/c12fa4b016e1cb1457a64e88b37f85e0739651a5))
* **infra:** CloudFront AllowedMethodsの指定を有効な組み合わせに修正 ([#42](https://github.com/bamiyanapp/examination/issues/42)) ([3c682bc](https://github.com/bamiyanapp/examination/commit/3c682bc66c96f5b907288f2a8d4a136b9e6081ee))
* **infra:** jose v6化による本番503を修正しv5系に固定する ([#34](https://github.com/bamiyanapp/examination/issues/34)) ([a6ed4f7](https://github.com/bamiyanapp/examination/commit/a6ed4f78f5f03193d1ee86767a507e0028031698))
* **infra:** serverlessをv3 OSS版に戻しRenovateの再提案を防止 ([#27](https://github.com/bamiyanapp/examination/issues/27)) ([874be19](https://github.com/bamiyanapp/examination/commit/874be1946fefb19980a7ad9c4b3fd35a20f8b5fb))
* **infra:** ディレクトリ形式URLへのアクセスが404になる不具合を修正 ([#38](https://github.com/bamiyanapp/examination/issues/38)) ([fc2aa69](https://github.com/bamiyanapp/examination/commit/fc2aa69cec2d218ab1942a117f7cb05c342f7601))
* **pwa:** ページ本体のキャッシュ戦略をNetwork Firstへ変更する ([#134](https://github.com/bamiyanapp/examination/issues/134)) ([9d69fde](https://github.com/bamiyanapp/examination/commit/9d69fde66f0ef535fbf67ac0638e322e1828cda5)), closes [#133](https://github.com/bamiyanapp/examination/issues/133)
* **pwa:** 新しいバージョン検知時に更新を促すバナーを表示する ([#123](https://github.com/bamiyanapp/examination/issues/123)) ([b4008e7](https://github.com/bamiyanapp/examination/commit/b4008e7bceaddd5221d7f66f72b04e604bed758a)), closes [#122](https://github.com/bamiyanapp/examination/issues/122)
* **voice-chat:** 会話開始時にGemini APIが400を返す不具合を修正 ([#71](https://github.com/bamiyanapp/examination/issues/71)) ([05ddf65](https://github.com/bamiyanapp/examination/commit/05ddf6537562775ba9ec9dacdb53b3de5bb01921))


### Features

* **app/top:** トップページを/へ採用し不要セクションを削除 ([#86](https://github.com/bamiyanapp/examination/issues/86)) ([9ec7e2f](https://github.com/bamiyanapp/examination/commit/9ec7e2f04fc6a61c7185cd9b195b078b4588dcc2)), closes [#82](https://github.com/bamiyanapp/examination/issues/82)
* **bot-stack:** LINEアカウントとGoogleアカウントの紐付けを追加 ([#50](https://github.com/bamiyanapp/examination/issues/50)) ([6a4bdf4](https://github.com/bamiyanapp/examination/commit/6a4bdf4a39e06bad7957696937bcc81a745a2d66))
* **bot-stack:** 模擬面接記録をDynamoDBへ永続化し練習終了時に自動サマリー化する ([#94](https://github.com/bamiyanapp/examination/issues/94)) ([6f637fb](https://github.com/bamiyanapp/examination/commit/6f637fb9440a4b7065f8887214e4119f3cf18446)), closes [#93](https://github.com/bamiyanapp/examination/issues/93)
* **bot-stack:** 面接練習フィードバックをテキスト用・音声用の2形式にする ([#91](https://github.com/bamiyanapp/examination/issues/91)) ([48d5b8e](https://github.com/bamiyanapp/examination/commit/48d5b8eb96d22cbd8066ad000886a1df9334e984)), closes [#89](https://github.com/bamiyanapp/examination/issues/89)
* **bot-stack:** 面接練習開始時に本人/父/母のロールを確認する ([#61](https://github.com/bamiyanapp/examination/issues/61)) ([50feac2](https://github.com/bamiyanapp/examination/commit/50feac20795d4855e6d451919b7dfd4842e4659f))
* **bot:** API発行上限を1000回、AI API呼び出し上限を100回に設定する ([#128](https://github.com/bamiyanapp/examination/issues/128)) ([af616ea](https://github.com/bamiyanapp/examination/commit/af616ea5a9e842b76473daffe9d8ac52d365af25)), closes [examination#69](https://github.com/examination/issues/69) [#124](https://github.com/bamiyanapp/examination/issues/124)
* **bot:** 面接官AIが同じ話題を深掘りする追加質問をできるようにする ([#130](https://github.com/bamiyanapp/examination/issues/130)) ([187f659](https://github.com/bamiyanapp/examination/commit/187f6598bbd22bfdc320f897ace27ad70f7aea65)), closes [#126](https://github.com/bamiyanapp/examination/issues/126)
* **cd:** semantic-releaseを導入しトップページにセマンティックバージョンを表示する ([#138](https://github.com/bamiyanapp/examination/issues/138)) ([4ddaca4](https://github.com/bamiyanapp/examination/commit/4ddaca403935aa0c7ca65e0e018143b6df19805b)), closes [#137](https://github.com/bamiyanapp/examination/issues/137)
* **ci:** bot-stack LambdaのCloudWatchログを確認する診断ワークフローを追加 ([#54](https://github.com/bamiyanapp/examination/issues/54)) ([8136a9b](https://github.com/bamiyanapp/examination/commit/8136a9b6d5bd02ae4f74c48668b8409b6902b48c))
* **ci:** 診断ワークフローにAWS Organizations所属確認を追加 ([#56](https://github.com/bamiyanapp/examination/issues/56)) ([32ad43c](https://github.com/bamiyanapp/examination/commit/32ad43c3dc5ccbaeef06868ef70e7cf1ff3302f7))
* **ci:** 診断ワークフローにFunction URL直接疎通確認を追加 ([#55](https://github.com/bamiyanapp/examination/issues/55)) ([b0c5e09](https://github.com/bamiyanapp/examination/commit/b0c5e09de2db6f3a745ffc0254eb4c4b02ab210b))
* **ci:** 診断ワークフローにLambdaアカウント設定とCloudTrail確認を追加 ([#57](https://github.com/bamiyanapp/examination/issues/57)) ([bc95aaa](https://github.com/bamiyanapp/examination/commit/bc95aaad4b36f9bacca887715af9127009d78060))
* **ci:** 診断ワークフローにvoiceChat Lambdaのログ表示を追加 ([#66](https://github.com/bamiyanapp/examination/issues/66)) ([80df640](https://github.com/bamiyanapp/examination/commit/80df640a736c7c459b141e17cbcd22034799a469))
* **education-overview:** 教育の概要ページをReact化し鈴木家固有情報を排除する ([#96](https://github.com/bamiyanapp/examination/issues/96)) ([75bd947](https://github.com/bamiyanapp/examination/commit/75bd9472dde35e716139f28a17b3eb5dd5cb9b48)), closes [#92](https://github.com/bamiyanapp/examination/issues/92)
* **education:** 想定問答をReactの1画面に統合し対象者データを追加する ([#87](https://github.com/bamiyanapp/examination/issues/87)) ([e5d82d9](https://github.com/bamiyanapp/examination/commit/e5d82d9f499a96c1b7c63390f2fe1911d6008d63)), closes [#77](https://github.com/bamiyanapp/examination/issues/77)
* **infra:** AWS配信基盤（S3 + CloudFront + Cognito Google認証）を構築 ([fd642bf](https://github.com/bamiyanapp/examination/commit/fd642bf57446f795e293c1207dd4c1789ccf983d))
* **infra:** LINE botによる面接練習・想定問答登録機能を追加する ([#48](https://github.com/bamiyanapp/examination/issues/48)) ([1121a4d](https://github.com/bamiyanapp/examination/commit/1121a4d458d40d599f244e2a36e90e5075efd5d5))
* **infra:** サイト閲覧を許可メールアドレスのみに制限する ([#36](https://github.com/bamiyanapp/examination/issues/36)) ([39d8d0d](https://github.com/bamiyanapp/examination/commit/39d8d0ddba8c9a6bada90d176a3e6ced369af15c))
* **infra:** 閲覧許可メールアドレスをDynamoDBで管理し既存ユーザーが登録・削除できるようにする ([#40](https://github.com/bamiyanapp/examination/issues/40)) ([0ca9471](https://github.com/bamiyanapp/examination/commit/0ca94718a83e1e02767db3d6e1ee62937dd7dcb9))
* **knowledge:** MkDocs Materialサイトの構築とコンテンツ移行 ([a72b246](https://github.com/bamiyanapp/examination/commit/a72b2462fbcf50f11f364ce399bae33de749f930))
* LINE連携ページをReact(Vite)アプリへ移行する第一歩を実装 ([#79](https://github.com/bamiyanapp/examination/issues/79)) ([0955db4](https://github.com/bamiyanapp/examination/commit/0955db4a0d57d35a8b860f6588637ccd6d8d7177))
* **mock-interviews:** 模擬面接記録の閲覧画面をReact化しDynamoDBのデータを表示する ([#104](https://github.com/bamiyanapp/examination/issues/104)) ([273e4d3](https://github.com/bamiyanapp/examination/commit/273e4d322f4f6eb47ed05a102261d8c2911f4ac2)), closes [#103](https://github.com/bamiyanapp/examination/issues/103)
* **nav:** Speculation Rules APIで他ページを先読みし遷移を高速化する ([#106](https://github.com/bamiyanapp/examination/issues/106)) ([5b90e27](https://github.com/bamiyanapp/examination/commit/5b90e27acc37061eb7ef6e8e50c0369674f0bac9)), closes [#105](https://github.com/bamiyanapp/examination/issues/105)
* **nav:** ページ遷移中のローディング表示と全ページ共通の戻る導線を追加する ([#101](https://github.com/bamiyanapp/examination/issues/101)) ([d12b6e1](https://github.com/bamiyanapp/examination/commit/d12b6e184525627136ef49337ca237ced51c8391)), closes [#100](https://github.com/bamiyanapp/examination/issues/100)
* **practice:** 面接練習に「その他前提情報」の自由記述欄を追加する ([#110](https://github.com/bamiyanapp/examination/issues/110)) ([f4e5a07](https://github.com/bamiyanapp/examination/commit/f4e5a0785b88e2f1bef13be25e05b49f63541786)), closes [#76](https://github.com/bamiyanapp/examination/issues/76)
* **profile:** シチュエーションの編集もプロフィール編集画面へ移設する ([#136](https://github.com/bamiyanapp/examination/issues/136)) ([fcce7b0](https://github.com/bamiyanapp/examination/commit/fcce7b088e620d8ae2ce2c1d3dbfc476498c6e08)), closes [#135](https://github.com/bamiyanapp/examination/issues/135)
* **profile:** 志望先の特色・その他前提情報の編集をプロフィール編集画面へ移設する ([#129](https://github.com/bamiyanapp/examination/issues/129)) ([7832a1f](https://github.com/bamiyanapp/examination/commit/7832a1f89ffc396c0d434381ca89f3bfd8264cef)), closes [#125](https://github.com/bamiyanapp/examination/issues/125)
* **pwa:** Service Workerで静的ページ・バックエンドAPIをキャッシュする ([#120](https://github.com/bamiyanapp/examination/issues/120)) ([7f0910b](https://github.com/bamiyanapp/examination/commit/7f0910b1cb3ebfac910488835e1dbce2c07ebda6)), closes [#118](https://github.com/bamiyanapp/examination/issues/118)
* **pwa:** バックエンドAPIの一覧取得をバックグラウンドで先読みしキャッシュを温める ([#121](https://github.com/bamiyanapp/examination/issues/121)) ([2632f62](https://github.com/bamiyanapp/examination/commit/2632f62d21f4bac1fb83eb6cb627598c32962b15)), closes [#118](https://github.com/bamiyanapp/examination/issues/118)
* **site-stack:** 音声対話トークン発行に1日あたりの上限を設ける ([#109](https://github.com/bamiyanapp/examination/issues/109)) ([9fb36ec](https://github.com/bamiyanapp/examination/commit/9fb36ecdcf95329369b4d8da14db2b564c4d98cd)), closes [#count](https://github.com/bamiyanapp/examination/issues/count) [#count](https://github.com/bamiyanapp/examination/issues/count) [#69](https://github.com/bamiyanapp/examination/issues/69)
* **site:** ファビコンを🏫に、タイトルを「小学校受験対策」に変更する ([#68](https://github.com/bamiyanapp/examination/issues/68)) ([db8cf46](https://github.com/bamiyanapp/examination/commit/db8cf46265d8ef081a54eb80c42c4790aafd243e))
* **top:** トップページにビルドバージョン・更新日時を表示する ([#132](https://github.com/bamiyanapp/examination/issues/132)) ([62578ee](https://github.com/bamiyanapp/examination/commit/62578ee9f19637f5f9ffea46a8d9ac2b5079807f)), closes [#131](https://github.com/bamiyanapp/examination/issues/131)
* **ui:** 全ページにTailwind CSS + daisyUIを導入し見た目を整える ([#115](https://github.com/bamiyanapp/examination/issues/115)) ([5334fcc](https://github.com/bamiyanapp/examination/commit/5334fcc0e85ce5a23afd9e186f28bb9d012851ea)), closes [#114](https://github.com/bamiyanapp/examination/issues/114)
* **voice-chat:** ブラウザ音声認識・合成による面接練習機能を追加 ([#65](https://github.com/bamiyanapp/examination/issues/65)) ([8b73337](https://github.com/bamiyanapp/examination/commit/8b73337ee7f50cfd998563dd3501bd3a51a6c4fa))
* **voice-practice:** 音声認識・音声合成をONNX Runtime Web+Piperへ変更する ([#90](https://github.com/bamiyanapp/examination/issues/90)) ([dc259a0](https://github.com/bamiyanapp/examination/commit/dc259a017716f327ec2fadf9e36e986da2ed200b)), closes [#73](https://github.com/bamiyanapp/examination/issues/73)
* 想定問答データをMarkdownからDynamoDBへ移行する ([#84](https://github.com/bamiyanapp/examination/issues/84)) ([f336c2c](https://github.com/bamiyanapp/examination/commit/f336c2ce2576e9c52cabbd536d6c3849424ee2e3))
* 新トップページをReactで実装し/top/へプレビュー配置する ([#85](https://github.com/bamiyanapp/examination/issues/85)) ([c47d8ce](https://github.com/bamiyanapp/examination/commit/c47d8ce0d2a592384f3c13883612794445a510a6))
* 閲覧許可メールアドレス管理ページをReact(Vite)アプリへ移行する ([#80](https://github.com/bamiyanapp/examination/issues/80)) ([a6de540](https://github.com/bamiyanapp/examination/commit/a6de540ebbbacc063bbc029c6b8005a46a4dfb37))
* 音声で面接練習ページをReact化しシチュエーション自由入力とチャットUIを追加 ([#81](https://github.com/bamiyanapp/examination/issues/81)) ([1f3ba3d](https://github.com/bamiyanapp/examination/commit/1f3ba3db86c710efc53f020bf336b67fa21860fd)), closes [examination#78](https://github.com/examination/issues/78)


### Reverts

* **voice-practice:** 音声認識・音声合成をブラウザ標準APIへ戻す ([#113](https://github.com/bamiyanapp/examination/issues/113)) ([32acaad](https://github.com/bamiyanapp/examination/commit/32acaad11f6239497aac1e1d2e8c93a6b0b52104)), closes [#112](https://github.com/bamiyanapp/examination/issues/112)
