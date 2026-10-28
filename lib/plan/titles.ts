import type { StudyBlock } from "@/lib/domain";
import { fmtDuration, weekdayOf } from "@/lib/time";
import { plural } from "@/lib/plural";

const SHORT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function courseShort(code: string): string {
  return code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? code;
}

function isFinalPush(block: StudyBlock): boolean {
  return block.anchor.kind === "work" && block.anchor.of >= 2 && block.anchor.index === block.anchor.of;
}

/** calendar: "Review · Recursion", "A2 final push"; timeline: "Review — Recursion & tree traversal"; card: "Recursion & tree traversal". */
export function blockTitle(block: StudyBlock, style: "calendar" | "timeline" | "card"): string {
  const { anchor, topic } = block;
  switch (anchor.kind) {
    case "review":
      return style === "calendar" ? `Review · ${topic.short}` : style === "timeline" ? `Review — ${topic.full}` : topic.full;
    case "midweek":
      return style === "calendar" ? `Mid-week · ${courseShort(anchor.course)}` : style === "timeline" ? `Mid-week review — ${topic.full}` : topic.full;
    case "endOfWeek":
      return "End-of-week review";
    case "testPrep":
      return style === "calendar" ? `${topic.short} prep · ${anchor.index} of ${anchor.of}` : `${topic.full} prep — ${anchor.index} of ${anchor.of}`;
    case "work":
      if (isFinalPush(block)) return `${topic.short} final push`;
      return style === "calendar" ? `Work block · ${topic.short}` : style === "timeline" ? `Work block — ${topic.full}` : topic.full;
    case "custom":
      return style === "calendar" ? topic.short : topic.full;
  }
}

function dueDay(block: StudyBlock): string {
  return block.why.anchorDay ? SHORT_WEEKDAYS[weekdayOf(block.why.anchorDay) - 1] : "soon";
}

/** trailing: "After-lecture · 45m", "Mid-week · 30m", "Due Thu · 2h"; sentence: "Review 1 day after lecture". */
export function blockReasonText(block: StudyBlock, style: "trailing" | "sentence"): string {
  const { anchor } = block;
  if (style === "trailing") {
    const reason =
      anchor.kind === "review"
        ? "After-lecture"
        : anchor.kind === "midweek"
          ? "Mid-week"
          : anchor.kind === "endOfWeek"
            ? "End of week"
            : anchor.kind === "testPrep"
              ? `Prep ${anchor.index} of ${anchor.of}`
              : anchor.kind === "work"
                ? `Due ${dueDay(block)}`
                : (block.note ?? "Study");
    return `${reason} · ${fmtDuration(block.end - block.start)}`;
  }
  switch (anchor.kind) {
    case "review": {
      const d = block.why.offsetDays;
      return d <= 0 ? "Review after lecture" : `Review ${plural(d, "day")} after lecture`;
    }
    case "midweek":
      return "Mid-week review";
    case "endOfWeek":
      return "End-of-week review";
    case "testPrep":
      return `Prep ${anchor.index} of ${anchor.of} for ${block.topic.full}`;
    case "work":
      return `Due ${dueDay(block)} · ${block.topic.full}`;
    case "custom":
      return block.note ?? block.topic.full;
  }
}

const STOP = new Set(["a", "an", "and", "the", "of", "to", "in", "on", "for", "with", "by", "vs"]);

function stem(word: string): string {
  for (const suffix of ["ing", "ed", "es", "s"]) if (word.length > suffix.length + 2 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  return word;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !STOP.has(w))
      .map(stem),
  );
}

/** Stemmed token overlap ≥ 0.5 of the smaller set: "Recursion & trees" matches "Recursion & tree traversal". */
export function topicMatch(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  const smaller = Math.min(ta.size, tb.size);
  if (smaller === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared >= smaller / 2;
}

