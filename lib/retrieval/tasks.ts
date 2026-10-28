import "server-only";
import { z } from "zod";
import { embedTask } from "@/lib/ai/define";
import { EMBED_DIMENSIONS } from "@/lib/ai/models";
import { hashId } from "@/lib/domain";

/** Deterministic unit vectors from text hashes. Only check-nemotron sees these: the app never embeds in mock mode. */
function mockVector(text: string): Float32Array {
  const v = new Float32Array(EMBED_DIMENSIONS);
  for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    const h = hashId(word);
    v[parseInt(h.slice(0, 6), 32) % EMBED_DIMENSIONS] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

/** `embed` has no prefix: the indexer and retrieve() share it. */
export const retrievalTasks = {
  embed: embedTask({
    input: z.object({ texts: z.array(z.string().min(1).max(8000)).min(1).max(32), as: z.enum(["document", "query"]) }),
    maxTokens: 0,
    example: { texts: ["Postorder traversal visits both subtrees before the root."], as: "document" },
    mock: ({ texts }) => ({ vectors: texts.map(mockVector) }),
  }),
};
