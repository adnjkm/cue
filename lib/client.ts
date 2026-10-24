import type { ApiError, AskRequest, PageInput, ParseResult, Question, Solution } from "./types";

export class ClientApiError extends Error {
  constructor(readonly api: ApiError) {
    super(api.message);
  }
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ClientApiError({ kind: "upstream", message: "Could not reach the server." });
  }
  if (res.ok) return res;
  const payload = (await res.json().catch(() => null)) as { error?: ApiError } | null;
  if (payload?.error) throw new ClientApiError(payload.error);
  if (res.status === 413) throw new ClientApiError({ kind: "too_large", message: "Request body too large." });
  throw new ClientApiError({ kind: "upstream", message: `Server returned ${res.status}.` });
}

const MAX_CHUNK_PAGES = 3;
const MAX_CHUNK_CHARS = 3_600_000;

/** Groups pages into requests of at most 3 pages that stay well under Vercel's 4.5 MB body limit. */
export function chunkPages(pages: PageInput[]): PageInput[][] {
  const chunks: PageInput[][] = [];
  let current: PageInput[] = [];
  let size = 0;
  for (const p of pages) {
    const s = p.image.length + p.text.length;
    if (current.length && (current.length === MAX_CHUNK_PAGES || size + s > MAX_CHUNK_CHARS)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(p);
    size += s;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Parses every chunk that has no result yet with at most 3 requests in flight. Writes into `results`
 * in place so a retry after a failure only resends the chunks that are still missing.
 */
export async function parseChunks(
  chunks: PageInput[][],
  totalPages: number,
  results: (ParseResult | undefined)[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<ParseResult[]> {
  const pending = chunks.map((_, i) => i).filter((i) => !results[i]);
  let failure: unknown;
  const report = () => onProgress(results.filter(Boolean).length, chunks.length);
  report();
  const worker = async () => {
    while (pending.length && !failure) {
      const i = pending.shift()!;
      try {
        const res = await post("/api/parse", { pages: chunks[i], totalPages }, signal);
        results[i] = (await res.json()) as ParseResult;
        report();
      } catch (e) {
        failure ??= e;
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  if (failure) throw failure;
  return results as ParseResult[];
}

let solving = 0;
const solveQueue: (() => void)[] = [];

export async function fetchSolution(q: Question): Promise<Solution> {
  if (solving >= 3) await new Promise<void>((r) => solveQueue.push(r));
  solving++;
  try {
    const { number, topic, prompt, options, answer } = q;
    const res = await post("/api/solve", { question: { number, topic, prompt, options, answer } });
    return (await res.json()) as Solution;
  } finally {
    solving--;
    solveQueue.shift()?.();
  }
}

export async function streamAsk(req: AskRequest, onText: (text: string) => void): Promise<void> {
  const res = await post("/api/ask", req);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
    onText(text);
  }
}
