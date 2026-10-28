import { env, pipeline, type ProgressInfo } from "@huggingface/transformers";
import { PARAKEET_MODEL, PARAKEET_WEIGHTS, type FromWorker, type ToWorker } from "./protocol";

env.allowLocalModels = false;
env.useBrowserCache = true;

type Transcriber = (audio: Float32Array) => Promise<{ text: string } | { text: string }[]>;

let transcriber: Transcriber | null = null;
const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === "load") {
    try {
      const { dtype } = PARAKEET_WEIGHTS[msg.backend];
      const asr = await pipeline("automatic-speech-recognition", PARAKEET_MODEL, {
        device: msg.backend,
        dtype,
        progress_callback: (p: ProgressInfo) => {
          if (p.status === "progress_total") post({ type: "progress", loaded: p.loaded, total: p.total });
        },
      });
      transcriber = asr as unknown as Transcriber;
      post({ type: "ready" });
    } catch (err) {
      post({ type: "error", stage: "download", message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (!transcriber) {
    post({ type: "error", id: msg.id, stage: "runtime", message: "The speech model is not loaded." });
    return;
  }
  try {
    const out = await transcriber(msg.samples);
    const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text;
    post({ type: "result", id: msg.id, text: text.trim() });
  } catch (err) {
    post({ type: "error", id: msg.id, stage: "runtime", message: err instanceof Error ? err.message : String(err) });
  }
};
