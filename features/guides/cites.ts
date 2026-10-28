import type { FootnoteSource, GuideBlock, GuideDraft, Passage, SourceRef } from "@/lib/domain";
import { refsFor } from "@/lib/retrieval";
import { footnoteText } from "@/lib/sources";
import type { CiteDraft, GuideBlockDraft } from "./schema";

type PageRef = Extract<SourceRef, { kind: "page" }>;
type SlideSource = FootnoteSource & { ref: PageRef };

const isSlide = (s: FootnoteSource): s is SlideSource => s.ref.kind === "page" && s.ref.doc.kind === "slides" && !s.note;

/** Slides 6, 7 and 8 of one deck read "Lecture 7 slides 6–8", so a deck's consecutive slides become one range. */
function mergeSlides(sources: readonly FootnoteSource[]): FootnoteSource[] {
  const out: FootnoteSource[] = [];
  const groups = new Map<string, { at: number; pages: SlideSource[] }>();
  for (const s of sources) {
    if (!isSlide(s)) {
      out.push(s);
      continue;
    }
    const key = `${s.ref.materialId}|${s.relation ?? ""}`;
    const group = groups.get(key);
    if (group) group.pages.push(s);
    else groups.set(key, { at: out.push(s) - 1, pages: [s] });
  }
  const placed = [...groups.values()].sort((a, b) => b.at - a.at);
  for (const { at, pages } of placed) {
    const sorted = [...pages].sort((a, b) => a.ref.page - b.ref.page);
    const runs: SlideSource[] = [];
    for (const s of sorted) {
      const last = runs.at(-1);
      const end = last ? (last.ref.to ?? last.ref.page) : -1;
      if (last && s.ref.page <= end + 1) {
        const to = Math.max(end, s.ref.to ?? s.ref.page);
        const { title: _title, ...ref } = last.ref;
        runs[runs.length - 1] = { ...last, ref: { ...ref, to } };
      } else runs.push(s);
    }
    out.splice(at, 1, ...runs);
  }
  return out;
}

/** One block's cites as footnote sources: unknown passages dropped, repeats removed, slide runs merged. */
export function sourcesFor(cites: readonly CiteDraft[], passages: readonly Passage[]): FootnoteSource[] {
  const seen = new Set<string>();
  const resolved = cites.flatMap((c) => {
    const [ref] = refsFor([c.passage], passages);
    const key = `${JSON.stringify(ref)}|${c.relation ?? ""}`;
    if (!ref || seen.has(key)) return [];
    seen.add(key);
    return [{ ref, ...(c.relation ? { relation: c.relation } : {}), ...(c.note ? { note: c.note } : {}) }];
  });
  return mergeSlides(resolved);
}

/** A guide block's cites become one footnote per block, numbered in reading order. Pure, so it reruns on every streamed block. */
export function numberFootnotes(drafts: readonly GuideBlockDraft[], passages: readonly Passage[]): Pick<GuideDraft, "blocks" | "footnotes"> {
  const footnotes: { n: number; sources: FootnoteSource[] }[] = [];
  const marker = (cites: readonly CiteDraft[]): number[] => {
    const sources = sourcesFor(cites, passages);
    if (sources.length === 0) return [];
    const n = footnotes.length + 1;
    footnotes.push({ n, sources });
    return [n];
  };
  const blocks = drafts.map((d): GuideBlock => (d.kind === "formula" ? { ...d, noteRefs: marker(d.noteRefs) } : { ...d, refs: marker(d.refs) }));
  return { blocks, footnotes };
}

/** One piece per source, so each can open its source; joined with spaces they equal footnoteText(sources). */
export function footnoteParts(sources: readonly FootnoteSource[]): { source: FootnoteSource; text: string }[] {
  return sources.map((source) => ({ source, text: footnoteText([source]) }));
}
