# 音声で面接練習（examination app）

声に出しながら面接練習ができるReact（Vite）アプリ（[Issue #62](https://github.com/bamiyanapp/examination/issues/62)、[Issue #76](https://github.com/bamiyanapp/examination/issues/76)、[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）。

MkDocs静的サイトの`/education/voice-practice/`パスへビルド成果物を上書き配置する。実装本体は`src/pages/VoicePractice.jsx`。

- チャット風UIでユーザー自身の発言（音声認識結果）とAI応答の両方を表示する
- シチュエーション・志望先の特色・その他前提情報（[Issue #76](https://github.com/bamiyanapp/examination/issues/76)）を自由入力でき、小学校受験に限らない汎用的な面接練習に対応する
- 音声認識（STT）・音声合成（TTS）はブラウザ標準API（`SpeechRecognition`/`SpeechSynthesis`）を使う。一時期ブラウザ内AIモデル（ONNX Runtime Web + Piper、[Issue #73](https://github.com/bamiyanapp/examination/issues/73)）へ置き換えたが、実機での動作未検証のまま公開してしまい実際には動作せず、読み込みも重くなっていたため[Issue #112](https://github.com/bamiyanapp/examination/issues/112)でブラウザ標準APIへ戻した。対応ブラウザはGoogle Chrome・Microsoft Edge等（Safari・Firefoxは音声認識に対応していない場合がある）
- 「練習を終える」ボタンを押すと、会話履歴をAIが振り返り「よかった点」「改善が必要な点」「次回までのアクション」形式のサマリーを生成してDynamoDB（`examination-mock-interviews`）へ保存する（[Issue #93](https://github.com/bamiyanapp/examination/issues/93)）。何も答えないまま終了した場合は保存しない

## ローカル確認

```
npm install
npm run dev
```

## 検証

```
npm run lint
npm run test
npm run build
```
