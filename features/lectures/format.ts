import type { Interval, Lecture, RelatedLink } from "@/lib/domain";
import { currentZone, fmtRange, zoneOf } from "@/lib/time";
import { plural } from "@/lib/plural";

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
  const said = parts.filter(([n]) => n > 0).map(([n, unit]) => plural(n, unit));
  return said.length ? said.join(" ") : "0 seconds";
}

/** A stamp's `datetime` value: `PT33M20S` for 33:20. */
export function isoDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `PT${Math.floor(s / 60)}M${s % 60}S`;
}

/** Live: newest first. Saved: exam-hint cards first, then by time. */
export function orderLinks(links: readonly RelatedLink[], style: "live" | "saved"): RelatedLink[] {
  return [...links].sort((a, b) => (style === "saved" ? Number(b.why === "hint") - Number(a.why === "hint") || a.atMs - b.atMs : b.atMs - a.atMs || a.title.localeCompare(b.title)));
}

/** `Tue 9–10am`: a lecture's slot in the device's zone. */
export function slotText(span: Interval): string {
  const zone = zoneOf(currentZone());
  return `${new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone.id }).format(span.start)} ${fmtRange(span, zone)}`;
}
