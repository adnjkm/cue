import fs from "node:fs/promises";
import path from "node:path";

// Nebius budgets only send alerts, so the hard cap lives here. Every paid call reserves its
// worst case before it is sent, then settles to the real usage, so concurrent calls cannot
// overshoot the cap together.

const CAP_USD = Number(process.env.SPEND_CAP_USD || 30);
const LEDGER = path.join(process.cwd(), ".data", "spend-ledger.json");

// USD per million tokens [input, output]. Unknown models are priced like Ultra so the cap errs high.
const PRICES: Record<string, [number, number]> = {
  "nvidia/Nemotron-3.5-Super-VL": [0.3, 0.9],
  "nvidia/Nemotron-3_5-Lightning": [0.06, 0.24],
  "nvidia/Nemotron-3-Ultra-550b-a55b": [1, 3],
  "nvidia/nemotron-3-super-120b-a12b": [0.3, 0.9],
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": [0.06, 0.24],
};
const FALLBACK_PRICE: [number, number] = [1, 3];
const IMAGE_TOKENS = 3000;

// A hold whose call never settled (the server restarted mid-call) stops counting after this long.
const HOLD_TTL_MS = 10 * 60_000;

type Ledger = { spentUsd: number; calls: number; holds: Record<string, { usd: number; at: number }>; updatedAt: string };

function liveHolds(l: Ledger, now = Date.now()): Ledger["holds"] {
  return Object.fromEntries(Object.entries(l.holds ?? {}).filter(([, h]) => now - h.at < HOLD_TTL_MS));
}

function reservedUsd(l: Ledger): number {
  return Object.values(liveHolds(l)).reduce((n, h) => n + h.usd, 0);
}

export class BudgetExceeded extends Error {
  constructor(readonly spentUsd: number, readonly capUsd: number) {
    super(`Spending cap reached: $${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)} used.`);
  }
}

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function read(): Promise<Ledger> {
  try {
    return JSON.parse(await fs.readFile(LEDGER, "utf8")) as Ledger;
  } catch {
    return { spentUsd: 0, calls: 0, holds: {}, updatedAt: new Date().toISOString() };
  }
}

async function write(l: Ledger): Promise<void> {
  await fs.mkdir(path.dirname(LEDGER), { recursive: true });
  const tmp = `${LEDGER}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ ...l, updatedAt: new Date().toISOString() }, null, 2));
  await fs.rename(tmp, LEDGER);
}

function cost(model: string, inputTokens: number, outputTokens: number): number {
  const [i, o] = PRICES[model] ?? FALLBACK_PRICE;
  return (inputTokens * i + outputTokens * o) / 1_000_000;
}

export function estimateInputTokens(texts: string[], images = 0): number {
  return Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 3) + images * IMAGE_TOKENS;
}

export type Reservation = { settle(usage?: { prompt_tokens?: number; completion_tokens?: number } | null): Promise<void> };

/** Reserve the worst-case cost of one call, or throw BudgetExceeded if it could cross the cap. */
export function reserve(model: string, inputTokens: number, maxOutputTokens: number): Promise<Reservation> {
  const worst = cost(model, inputTokens, maxOutputTokens);
  return serialized(async () => {
    const l = await read();
    if (l.spentUsd + reservedUsd(l) + worst > CAP_USD) throw new BudgetExceeded(l.spentUsd, CAP_USD);
    const id = crypto.randomUUID();
    await write({ ...l, holds: { ...liveHolds(l), [id]: { usd: worst, at: Date.now() } } });
    let settled = false;
    return {
      settle: (usage) => {
        if (settled) return Promise.resolve();
        settled = true;
        // Without a usage report, charge the worst case rather than nothing.
        const actual = usage ? cost(model, usage.prompt_tokens ?? inputTokens, usage.completion_tokens ?? maxOutputTokens) : worst;
        return serialized(async () => {
          const cur = await read();
          const holds = liveHolds(cur);
          delete holds[id];
          await write({ ...cur, spentUsd: cur.spentUsd + actual, calls: cur.calls + 1, holds });
        });
      },
    };
  });
}

export async function spendStatus(): Promise<{ spentUsd: number; reservedUsd: number; capUsd: number; calls: number }> {
  const l = await read();
  return { spentUsd: l.spentUsd, reservedUsd: reservedUsd(l), capUsd: CAP_USD, calls: l.calls };
}
