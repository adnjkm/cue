import { parseChunk, toApiError } from "@/lib/llm";
import { parseRequestSchema } from "@/lib/schema";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = parseRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: { kind: "unreadable", message: "Malformed parse request." } }, { status: 400 });
  try {
    return Response.json(await parseChunk(body.data));
  } catch (e) {
    const { error, status } = toApiError(e);
    return Response.json({ error }, { status });
  }
}
