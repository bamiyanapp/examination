@dev-standards/CLAUDE.md

# examination固有ルール

小学校受験対策（想定問題・模擬面接記録）を管理するコンテンツリポジトリ。frontend/backendのアプリケーションコードは持たない。

- パッケージ構成: なし（`reusable-ci.yml`は`packages: '[]'`でlint/test/buildジョブを無効化し、commitlint・standards-checkのみ実行する）
- リリース運用: 行わない（配布・デプロイ対象の成果物が無いため、`.github/workflows/cd.yml`・semantic-releaseは導入しない）。詳細は`docs/cicd-pipeline-specification.md`を参照
- コンテンツ（想定問題・模擬面接記録等）の追加・更新もIssue駆動の原則の対象とする
