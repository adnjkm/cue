import { askStream, toApiError } from "@/lib/llm";
import { askRequestSchema } from "@/lib/schema";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = askRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: { kind: "unreadable", message: "Malformed ask request." } }, { status: 400 });
  try {
    const stream = await askStream(body.data);
    return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    const { error, status } = toApiError(e);
    return Response.json({ error }, { status });
  }
}
