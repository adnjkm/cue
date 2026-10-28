import type { Passage, SourceRef } from "@/lib/domain";

/** Strips `[S#]` markers (also `[S1, S2]`), keeps citations in order of first mention, drops ids that were not sent. */
export function parseCitations(text: string, passages: readonly Passage[]): { text: string; citations: SourceRef[] } {
  const byId = new Map(passages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const citations: SourceRef[] = [];
  const stripped = text.replace(/\s*\[(S\d+(?:\s*,\s*S\d+)*)\]/g, (_, group: string) => {
    for (const id of group.split(/\s*,\s*/)) {
      const p = byId.get(id as Passage["id"]);
      if (p && !seen.has(id)) {
        seen.add(id);
        citations.push(p.ref);
      }
    }
    return "";
  });
  return { text: stripped.replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ").trim(), citations };
}

/** The one resolver for passage ids in structured task output: unknown ids dropped, order kept, duplicates removed. */
export function refsFor(passageIds: readonly string[], passages: readonly Passage[]): SourceRef[] {
  const byId = new Map(passages.map((p) => [p.id as string, p]));
  const seen = new Set<string>();
  return passageIds.flatMap((id) => {
    const p = byId.get(id);
    if (!p || seen.has(id)) return [];
    seen.add(id);
    return [p.ref];
  });
}
