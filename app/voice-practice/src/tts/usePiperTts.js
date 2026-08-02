import { useCallback, useRef, useState } from "react";
import { PiperPlus } from "piper-plus";
// onnxruntime-webはpiper-plusのpeer dependency。ortインスタンスを明示的に渡さないと
// 「onnxruntime-web is required. Pass it via options.ort or load it globally.」で
// 失敗する（examination#73、ビルド後のPlaywrightスモークテストで発見）
import * as ort from "onnxruntime-web";

// css10（パブリックドメイン）由来の日本語モデル（examination#73）。
// ライセンス調査の結果、つくよみちゃんコーパス系（CC BY-SA、クレジット表記必須）より
// クリーンなため採用した
const MODEL = "ayousanz/piper-plus-css10-ja-6lang";

// Piper（ブラウザ内実行、examination#73）による音声合成フック。
// 旧: ブラウザ標準SpeechSynthesisを置き換える
export function usePiperTts() {
  const piperRef = useRef(null);
  const [modelStatus, setModelStatus] = useState("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);

  const getPiper = useCallback(async () => {
    if (!piperRef.current) {
      setModelStatus("loading");
      piperRef.current = await PiperPlus.initialize({
        model: MODEL,
        ort,
        onProgress: (info) => {
          if (typeof info.progress === "number") {
            setDownloadProgress(Math.round(info.progress));
          }
        },
      });
      setModelStatus("ready");
    }
    return piperRef.current;
  }, []);

  const speak = useCallback(
    async (text) => {
      const piper = await getPiper();
      const result = await piper.synthesize(text, { language: "ja" });
      await result.play();
    },
    [getPiper]
  );

  return { speak, prepare: getPiper, modelStatus, downloadProgress };
}
