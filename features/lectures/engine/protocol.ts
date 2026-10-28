/** NVIDIA Parakeet CTC 0.6B, as converted for transformers.js. Lower-case output without punctuation; lecture.clean adds it. */
export const PARAKEET_MODEL = "onnx-community/parakeet-ctc-0.6b-ONNX";

export type Backend = "webgpu" | "wasm";

/** WebGPU runs the 4-bit fp16 weights; WASM has no fp16 kernels, so it takes the 8-bit ones. */
export const PARAKEET_WEIGHTS: Record<Backend, { dtype: "q4f16" | "q8"; bytes: number }> = {
  webgpu: { dtype: "q4f16", bytes: 454_000_000 },
  wasm: { dtype: "q8", bytes: 611_000_000 },
};

export type ToWorker = { type: "load"; backend: Backend } | { type: "transcribe"; id: number; samples: Float32Array };

export type FromWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id?: number; stage: "download" | "runtime"; message: string };
