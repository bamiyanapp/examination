import { useCallback, useEffect, useRef, useState } from "react";

// kotoba-whisper（ONNX Runtime Web、examination#73）による音声認識をWeb Worker
// 経由で扱うフック。旧: ブラウザ標準SpeechRecognitionを置き換える
export function useWhisper() {
  const workerRef = useRef(null);
  const pendingRef = useRef(null);
  const [modelStatus, setModelStatus] = useState("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    const worker = new Worker(new URL("./whisperWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const { type } = event.data;
      if (type === "progress") {
        setModelStatus("loading");
        const percent = event.data.progress?.progress;
        if (typeof percent === "number") {
          setDownloadProgress(Math.round(percent));
        }
      } else if (type === "result") {
        setModelStatus("ready");
        pendingRef.current?.resolve(event.data.text);
        pendingRef.current = null;
      } else if (type === "error") {
        setModelStatus("ready");
        pendingRef.current?.reject(new Error(event.data.message));
        pendingRef.current = null;
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const transcribe = useCallback((audioUrl) => {
    return new Promise((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      workerRef.current.postMessage({ type: "transcribe", audioUrl });
    });
  }, []);

  return { transcribe, modelStatus, downloadProgress };
}
