import { z } from "zod";
import type { Passage, SourceRef } from "@/lib/domain";

/** Passages sent to the model are capped, which keeps every request body far under Vercel's 4.5 MB limit. */
export const PASSAGE_CHAR_CAP = 24_000;

const sourceRef = z.custom<SourceRef>((v) => typeof v === "object" && v !== null && typeof (v as { kind?: unknown }).kind === "string");

export const passagesSchema = z
  .array(z.object({ id: z.custom<Passage["id"]>((v) => typeof v === "string" && /^S\d+$/.test(v)), ref: sourceRef, label: z.string(), text: z.string() }))
  .max(40)
  .refine((ps) => ps.reduce((n, p) => n + p.text.length, 0) <= PASSAGE_CHAR_CAP, `Passages exceed ${PASSAGE_CHAR_CAP} characters`);

/** `[S1] Lecture 8 slides · Slide 17\n<text>`, the one shape every prompt shows passages in. */
export function passagesBlock(passages: readonly Pick<Passage, "id" | "label" | "text">[]): string {
  if (passages.length === 0) return "(no course material found)";
  return passages.map((p) => `[${p.id}] ${p.label}\n${p.text}`).join("\n\n");
}

export const STYLE = "Write plain text. Put code in backticks and math in Unicode (x², ≤, ∫), never LaTeX.";
