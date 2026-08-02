// Web Worker: kotoba-whisper（ONNX変換版）による音声認識をメインスレッドから
// 切り離して実行する（examination#73）。長尺音声の推論でメインスレッドがブロック・
// フリーズする既知の問題（transformers.js）を避けるため、推論は必ずこのワーカー内で行う
import { pipeline } from "@huggingface/transformers";

// onnxruntime-webのWASMバイナリ（gzip後約5.8MB）はViteが自動的にdistへバンドルする。
// CDN参照に切り替える選択肢もあるが、Web WorkerからのクロスオリジンWorker生成で
// CORS制約に当たる既知の問題があり、自己ホスティングの方がtransformers.js＋Vite＋
// Web Workerの組み合わせでは実績のある堅牢な構成のため、あえてそのままにする
// （examination#73）。初回アクセス時のみダウンロードが発生し、以降はブラウザに
// キャッシュされる
const MODEL_ID = "onnx-community/kotoba-whisper-v2.2-ONNX";

let transcriberPromise = null;

function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline("automatic-speech-recognition", MODEL_ID, {
      progress_callback: (progress) => {
        self.postMessage({ type: "progress", progress });
      },
    });
  }
  return transcriberPromise;
}

self.onmessage = async (event) => {
  const { type, audioUrl } = event.data;
  if (type !== "transcribe") return;
  try {
    const transcriber = await getTranscriber();
    const output = await transcriber(audioUrl, { language: "japanese" });
    self.postMessage({ type: "result", text: output.text.trim() });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
