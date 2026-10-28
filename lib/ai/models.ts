import type { MicroUsd } from "@/lib/domain";

/** Closed set: Super 120B and Nano cannot be named. */
export type ModelKey = "superVL" | "ultra" | "lightning" | "qwenEmbed";

export interface ModelSpec {
  tokenFactory: string;
  /** Literal free-tier ids only, so the uncapped path cannot reach a paid model. null: not offered. */
  openRouter: `${string}:free` | null;
  usdPerM: { input: number; output: number };
}

/** The only place model ids and prices appear. */
export const MODELS = {
  superVL: { tokenFactory: "nvidia/Nemotron-3.5-Super-VL", openRouter: "nvidia/nemotron-3.5-super-vl:free", usdPerM: { input: 0.3, output: 0.9 } },
  ultra: { tokenFactory: "nvidia/Nemotron-3-Ultra-550b-a55b", openRouter: "nvidia/nemotron-3-ultra-550b-a55b:free", usdPerM: { input: 1, output: 3 } },
  lightning: { tokenFactory: "nvidia/Nemotron-3_5-Lightning", openRouter: "nvidia/nemotron-3.5-lightning:free", usdPerM: { input: 0.06, output: 0.24 } },
  qwenEmbed: { tokenFactory: "Qwen/Qwen3-Embedding-8B", openRouter: null, usdPerM: { input: 0.01, output: 0 } },
} as const satisfies Record<ModelKey, ModelSpec>;

/** Measured: one image costs up to 3,317 prompt tokens; 3,500 keeps the hold a true worst case. */
export const IMAGE_TOKENS = 3500;
/** Routes set maxDuration 300; every attempt, retry and repair of one call fits inside this. */
export const ROUTE_BUDGET_MS = 280_000;
/** Longer than ROUTE_BUDGET_MS, so a hold outlives any live call. An expired unsettled hold is charged in full. */
export const HOLD_TTL_MS = 600_000;
export const EMBED_DIMENSIONS = 1024;

export type ChatProfileKey = "vision" | "reason" | "chat" | "fast";
export type ProfileKey = ChatProfileKey | "embed";

export type Profile =
  | { kind: "chat"; model: Exclude<ModelKey, "qwenEmbed">; thinking: boolean; temperature: number }
  | { kind: "embed"; model: "qwenEmbed"; dimensions: 1024 };

export const PROFILES = {
  vision: { kind: "chat", model: "superVL", thinking: false, temperature: 0.1 },
  reason: { kind: "chat", model: "ultra", thinking: true, temperature: 0.6 },
  chat: { kind: "chat", model: "ultra", thinking: false, temperature: 0.4 },
  fast: { kind: "chat", model: "lightning", thinking: false, temperature: 0.2 },
  embed: { kind: "embed", model: "qwenEmbed", dimensions: 1024 },
} as const satisfies Record<ProfileKey, Profile>;

/** Tokens times USD per million tokens is exactly micro-dollars. Rounded up so the ledger errs high. */
export function costMicro(model: ModelKey, inputTokens: number, outputTokens: number): MicroUsd {
  const p = MODELS[model].usdPerM;
  return Math.ceil(inputTokens * p.input + outputTokens * p.output) as MicroUsd;
}
