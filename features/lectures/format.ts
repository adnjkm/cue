import type { Lecture, RelatedLink } from "@/lib/domain";

/** `MAT137 · Integration by parts`, `MAT137 · Lecture 9`, or `CSC148 · New lecture` until the notes name it. */
export function lectureTitle(l: Pick<Lecture, "courseId" | "topic" | "number">): string {
  return `${l.courseId} · ${l.topic?.full ?? (l.number !== undefined ? `Lecture ${l.number}` : "New lecture")}`;
}

/** What a screen reader says for a stamp: `38 minutes 12 seconds`, `50 minutes`, `1 hour 2 minutes`. */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const parts: [number, string][] = [
    [Math.floor(total / 3600), "hour"],
    [Math.floor((total % 3600) / 60), "minute"],
    [total % 60, "second"],
  ];
  const said = parts.filter(([n]) => n > 0).map(([n, unit]) => `${n} ${unit}${n === 1 ? "" : "s"}`);
  return said.length ? said.join(" ") : "0 seconds";
}

/** Live: newest first. Saved: exam-hint cards first, then by time. */
export function orderLinks(links: readonly RelatedLink[], style: "live" | "saved"): RelatedLink[] {
  return [...links].sort((a, b) => (style === "saved" ? Number(b.why === "hint") - Number(a.why === "hint") || a.atMs - b.atMs : b.atMs - a.atMs || a.title.localeCompare(b.title)));
}
