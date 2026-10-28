import { EMBEDDER } from "@/lib/domain";
import { aiModeFromEnv } from "@/lib/ai/server/env";
import { spendStatus } from "@/lib/ai/server/run";

export const dynamic = "force-dynamic";

/** AI mode, embedder and spend. The walkthrough refuses to run unless mode is "mock". */
export async function GET() {
  const mode = aiModeFromEnv(process.env);
  if (typeof mode !== "string") return Response.json({ mode: "mock", embedder: null, error: "missing_key" }, { status: 500 });
  const spend = mode === "token-factory" ? await spendStatus().catch(() => null) : null;
  return Response.json(
    { mode, embedder: mode === "token-factory" ? EMBEDDER : null, ...(spend ? { spend } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
