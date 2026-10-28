import type { GuideBlock } from "@/lib/domain";

/** GuideDraft.plainText: what Practice reads to write questions from a section, so it never needs GuideBlock. */
export function guidePlainText(blocks: readonly GuideBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "prose":
          return b.text;
        case "formula":
          return `${b.lhs} = ${b.numerator} ÷ ${b.denominator}. ${b.note ?? ""}`.trim();
        case "figure":
          return [...b.panels.map((p) => `${p.title}: ${p.description}`), b.caption].join(" ");
        case "callout":
          return `${b.label}${b.examHint ? ` (${b.examHint})` : ""}: ${b.text}${b.quote ? ` “${b.quote.text}” ${b.quote.attribution}` : ""}`;
      }
    })
    .join("\n\n");
}
