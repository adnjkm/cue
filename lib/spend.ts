import path from "node:path";
import { ids, type EpochMs, type MicroUsd } from "@/lib/domain";
import { HOLD_TTL_MS, IMAGE_TOKENS } from "@/lib/ai/models";
import { capFromEnv } from "@/lib/ai/server/env";
import { FileLedger } from "@/lib/ai/server/ledger-file";

// Adapter for the pre-shell /api/parse, /api/solve and /api/ask routes, so they share the LedgerStore file
// with /api/ai until Practice moves onto the gateway and these routes are deleted.

const LEDGER = new FileLedger(path.join(process.cwd(), ".data", "spend-ledger.json"));

const PRICES: Record<string, [number, number]> = {
  "nvidia/Nemotron-3.5-Super-VL": [0.3, 0.9],
  "nvidia/Nemotron-3_5-Lightning": [0.06, 0.24],
  "nvidia/Nemotron-3-Ultra-550b-a55b": [1, 3],
};
const FALLBACK_PRICE: [number, number] = [1, 3];

export class BudgetExceeded extends Error {
  constructor(
    readonly spentUsd: number,
    readonly capUsd: number,
  ) {
    super(`Spending cap reached: $${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)} used.`);
  }
}

function costMicro(model: string, inputTokens: number, outputTokens: number): MicroUsd {
  const [i, o] = PRICES[model] ?? FALLBACK_PRICE;
  return Math.ceil(inputTokens * i + outputTokens * o) as MicroUsd;
}

export function estimateInputTokens(texts: string[], images = 0): number {
  return Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 3) + images * IMAGE_TOKENS;
}

export type Reservation = { settle(usage?: { prompt_tokens?: number; completion_tokens?: number } | null): Promise<void> };

export async function reserve(model: string, inputTokens: number, maxOutputTokens: number): Promise<Reservation> {
  const cap = capFromEnv(process.env);
  if (cap === null) throw new BudgetExceeded(0, 0);
  const worst = costMicro(model, inputTokens, maxOutputTokens);
  const id = ids.hold();
  const now = Date.now() as EpochMs;
  const r = await LEDGER.reserve({ id, amount: worst, expiresAt: (now + HOLD_TTL_MS) as EpochMs }, cap, now);
  if (!r.ok) throw new BudgetExceeded(r.spent / 1e6, cap / 1e6);
  let settled = false;
  return {
    settle: async (usage) => {
      if (settled) return;
      settled = true;
      const actual = usage ? costMicro(model, usage.prompt_tokens ?? inputTokens, usage.completion_tokens ?? maxOutputTokens) : worst;
      await LEDGER.settle(id, actual);
    },
  };
}
