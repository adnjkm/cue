import { solve, toApiError } from "@/lib/llm";
import { solveRequestSchema } from "@/lib/schema";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = solveRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: { kind: "unreadable", message: "Malformed solve request." } }, { status: 400 });
  try {
    return Response.json(await solve(body.data));
  } catch (e) {
    const { error, status } = toApiError(e);
    return Response.json({ error }, { status });
  }
}
