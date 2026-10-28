import {
  hashId,
  type CalendarEvent,
  type EpochMs,
  type LectureId,
  type LectureNotes,
  type LinkId,
  type Material,
  type PracticeSet,
  type QuestionId,
  type RelatedLink,
  type Segment,
  type SourceRef,
} from "@/lib/domain";
import { fmtStamp } from "@/lib/time";

export type AssessmentEvent = Extract<CalendarEvent, { kind: "test" | "deadline" }>;

/**
 * What the model may point at, numbered like passages (`A1`, `M2`) so a mention resolves to a row by id
 * instead of by fuzzy title. Assessments are tests and deadlines; materials are files and practice papers.
 */
export interface Coursework {
  assessments: readonly { id: string; event: AssessmentEvent }[];
  materials: readonly (
    | { id: string; kind: "material"; material: Material; pages: readonly { page: number; label?: string; section?: string }[] }
    | { id: string; kind: "set"; set: PracticeSet; questions: readonly { id: QuestionId; number: string }[] }
  )[];
}

export function coursework(input: {
  events: readonly CalendarEvent[];
  materials: readonly Material[];
  pages?: ReadonlyMap<string, readonly { page: number; label?: string; section?: string }[]>;
  sets?: readonly { set: PracticeSet; questions: readonly { id: QuestionId; number: string }[] }[];
  now: EpochMs;
}): Coursework {
  const upcoming = input.events
    .filter((e): e is AssessmentEvent => (e.kind === "test" || e.kind === "deadline") && e.start >= input.now - 7 * 86_400_000)
    .sort((a, b) => a.start - b.start)
    .slice(0, 20);
  return {
    assessments: upcoming.map((event, i) => ({ id: `A${i + 1}`, event })),
    materials: [
      ...input.materials.slice(0, 30).map((material) => ({ kind: "material" as const, material, pages: input.pages?.get(material.id) ?? [] })),
      ...(input.sets ?? []).slice(0, 10).map((s) => ({ kind: "set" as const, ...s })),
    ].map((m, i) => ({ ...m, id: `M${i + 1}` })),
  };
}

const KIND_WORD: Record<Material["kind"], string> = {
  slides: "slides",
  textbook: "textbook",
  handout: "handout",
  problemSet: "problem set",
  pastPaper: "past paper",
  notes: "notes",
  syllabus: "syllabus",
  other: "file",
};

/** The catalog lines the hints prompt shows, `A1 · Term Test 2 · test · Fri, Nov 13`. */
export function catalogInput(work: Coursework, timeZone: string) {
  return {
    assessments: work.assessments.map(({ id, event }) => ({ id, label: event.label, kind: event.kind, when: fmtWhen(event.start, timeZone, "weekday") })),
    materials: work.materials.map((m) => (m.kind === "set" ? { id: m.id, title: m.set.title, kind: "practice paper" } : { id: m.id, title: m.material.title, kind: KIND_WORD[m.material.kind] })),
  };
}

function fmtWhen(t: number, timeZone: string, style: "monthDay" | "weekday" | "weekdayLong"): string {
  const opts: Intl.DateTimeFormatOptions =
    style === "monthDay" ? { month: "short", day: "numeric" } : style === "weekday" ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "long" };
  // The prompt keeps the US form it was written with; what a student reads uses the day-month order of the rest of the app.
  return new Intl.DateTimeFormat(style === "monthDay" ? "en-GB" : "en-US", { ...opts, timeZone }).format(t);
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** How much of the quote a line contains: 1 when it holds the quote verbatim, else the share of its words. */
export function quoteScore(quote: string, line: string): number {
  const q = words(quote);
  if (q.length === 0) return 0;
  const l = words(line);
  if (` ${l.join(" ")} `.includes(` ${q.join(" ")} `)) return 1;
  const have = new Set(l);
  return q.filter((w) => have.has(w)).length / q.length;
}

const lineText = (s: Segment) => s.text ?? s.raw;

/** The segment a quote came from, or null when no segment holds at least 60% of its words. */
export function segmentForQuote<S extends Segment>(quote: string, segments: readonly S[]): S | null {
  let best: S | null = null;
  let bestScore = 0.6 - 1e-9;
  for (const s of segments) {
    const score = quoteScore(quote, lineText(s));
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

export interface HintsOutput {
  hints: readonly { quote: string; assessment: string | null }[];
  tasks: readonly { text: string; ref: string | null; part: string | null }[];
  mentions: readonly { ref: string; quote: string; title: string | null; part: string | null; note: string | null }[];
}

export interface LinkContext {
  lectureId: LectureId;
  timeZone: string;
  /** "Prof. Chen", for "Prof. Chen says this will be on it". */
  professor: string | null;
}

export function linkId(lectureId: LectureId, target: SourceRef): LinkId {
  return `lnk_${hashId(`${lectureId}|${JSON.stringify(target)}`)}` as LinkId;
}

function assessmentRef(event: AssessmentEvent): SourceRef {
  return { kind: "assessment", eventId: event.id, label: event.label, at: event.start };
}

/** Parses "4–9", "slides 4 to 9", "p. 482", "Q3–Q6" into the first and last number it names. */
export function partRange(part: string | null): { from: number; to?: number } | null {
  if (!part) return null;
  const n = part.match(/\d+/g)?.map(Number) ?? [];
  if (n.length === 0) return null;
  return n.length > 1 && n[1] > n[0] ? { from: n[0], to: n[1] } : { from: n[0] };
}

function materialTarget(m: Extract<Coursework["materials"][number], { kind: "material" }>, part: string | null): SourceRef {
  const { material } = m;
  const doc = { kind: material.kind, title: material.title, ...(material.short ? { short: material.short } : {}), ...(material.lecture ? { lectureNumber: material.lecture.number } : {}) };
  const range = partRange(part);
  const section = part?.match(/§\s?[\d.]+/)?.[0]?.replace(/\s/g, "");
  if (material.kind === "slides" && range) return { kind: "page", materialId: material.id, doc, page: range.from, ...(range.to ? { to: range.to } : {}) };
  const byLabel = range ? m.pages.find((p) => p.label && words(p.label).includes(String(range.from))) : undefined;
  const bySection = section ? m.pages.find((p) => p.section === section) : undefined;
  const page = byLabel ?? bySection;
  return {
    kind: "page",
    materialId: material.id,
    doc,
    page: page?.page ?? 1,
    ...(part ? { label: part } : {}),
    ...(section ? { section } : {}),
  };
}

/**
 * One related card from a model mention, built only from rows the catalog holds. Titles and metas follow
 * Paper: "Problem Set 5, Q3–Q6" / "Due Thursday · same technique", "Integration by parts" / "Textbook · §7.1, LIATE on p. 482".
 */
export function linkFromMention(
  ctx: LinkContext,
  work: Coursework,
  mention: { ref: string; title: string | null; part: string | null; note: string | null },
  atMs: number,
  why: RelatedLink["why"],
): RelatedLink | null {
  const note = mention.note?.trim() || null;
  const part = mention.part?.trim() || null;
  const assessment = work.assessments.find((a) => a.id === mention.ref);
  if (assessment) {
    const e = assessment.event;
    const target = assessmentRef(e);
    const meta =
      e.kind === "deadline"
        ? [`Due ${fmtWhen(e.start, ctx.timeZone, "weekdayLong")}`, note].filter(Boolean).join(" · ")
        : [fmtWhen(e.start, ctx.timeZone, "monthDay"), note ?? (why === "hint" ? `${ctx.professor ?? "Your professor"} says this will be on it` : "mentioned in this lecture")].join(" · ");
    return { id: linkId(ctx.lectureId, target), lectureId: ctx.lectureId, atMs, target, title: part ? `${e.label}, ${part}` : e.label, meta, why };
  }
  const entry = work.materials.find((m) => m.id === mention.ref);
  if (!entry) return null;
  if (entry.kind === "set") {
    const range = partRange(part);
    const q = range ? entry.questions.find((x) => x.number === String(range.from)) : undefined;
    if (!q) return null;
    const target: SourceRef = { kind: "question", setId: entry.set.id, questionId: q.id, setTitle: entry.set.title, number: q.number };
    return { id: linkId(ctx.lectureId, target), lectureId: ctx.lectureId, atMs, target, title: `${entry.set.title}, Q${q.number}`, meta: ["Practice", note].filter(Boolean).join(" · "), why };
  }
  const { material } = entry;
  const target = materialTarget(entry, part);
  const titled = mention.title?.trim();
  let title: string;
  let meta: string;
  switch (material.kind) {
    case "problemSet":
    case "handout": {
      const due = work.assessments.find((a) => a.event.kind === "deadline" && words(a.event.label).join(" ") === words(material.title).join(" "));
      title = part ? `${material.title}, ${part}` : material.title;
      meta = [due ? `Due ${fmtWhen(due.event.start, ctx.timeZone, "weekdayLong")}` : KIND_WORD[material.kind].replace(/^./, (c) => c.toUpperCase()), note].filter(Boolean).join(" · ");
      break;
    }
    case "textbook":
      title = titled || material.title;
      meta = ["Textbook", [part, note].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
      break;
    default:
      title = titled || material.title;
      meta = [material.title, part?.replace(/^(slides?|pages?|pp?\.)\s*/i, "") ?? note].filter(Boolean).join(" · ");
  }
  return { id: linkId(ctx.lectureId, target), lectureId: ctx.lectureId, atMs, target, title, meta, why };
}

export interface HintResult {
  /** Segments to flag, by seq. */
  flags: { seq: number; flag: NonNullable<Segment["flag"]> }[];
  /** New related cards, deduped by id. */
  links: RelatedLink[];
}

/**
 * Turns one lecture.hints answer over a 60 s window into segment flags and related cards. A hint flags the
 * segment holding its quote once: a segment already flagged (by the model or the student), or one the
 * student unflagged, keeps its state, so overlapping windows that repeat a quote change nothing.
 */
export function applyHints(
  ctx: LinkContext,
  work: Coursework,
  windowSegments: readonly Segment[],
  out: HintsOutput,
  opts: { dismissed?: ReadonlySet<number>; existingLinks?: ReadonlySet<string> } = {},
): HintResult {
  const flags: HintResult["flags"] = [];
  const links = new Map<string, RelatedLink>();
  const taken = new Set<number>();
  const fallbackAt = windowSegments.length ? windowSegments[windowSegments.length - 1].atMs : 0;
  const addLink = (link: RelatedLink | null) => {
    if (link && !links.has(link.id) && !opts.existingLinks?.has(link.id)) links.set(link.id, link);
  };

  for (const hint of out.hints) {
    const seg = segmentForQuote(hint.quote, windowSegments);
    if (!seg || seg.flag || taken.has(seg.seq) || opts.dismissed?.has(seg.seq)) continue;
    taken.add(seg.seq);
    const a = hint.assessment ? work.assessments.find((x) => x.id === hint.assessment) : undefined;
    flags.push({ seq: seg.seq, flag: { by: "model", assessment: a ? { label: a.event.label, eventId: a.event.id } : null } });
    if (a) addLink(linkFromMention(ctx, work, { ref: a.id, title: null, part: null, note: null }, seg.atMs, "hint"));
  }
  for (const m of out.mentions) {
    const seg = segmentForQuote(m.quote, windowSegments);
    addLink(linkFromMention(ctx, work, m, seg?.atMs ?? fallbackAt, "mention"));
  }
  for (const task of out.tasks) {
    if (!task.ref) continue;
    const seg = segmentForQuote(task.text, windowSegments);
    addLink(linkFromMention(ctx, work, { ref: task.ref, title: null, part: task.part, note: task.text }, seg?.atMs ?? fallbackAt, "mention"));
  }
  return { flags, links: [...links.values()] };
}

/** The label under a flagged line: `Flagged · on Term Test 2` while live, `on Term Test 2` in saved notes. */
export function flagLabel(flag: NonNullable<Segment["flag"]>, style: "live" | "saved"): string {
  if (flag.by === "user") return "Flagged by you";
  if (flag.assessment) return style === "live" ? `Flagged · on ${flag.assessment.label}` : `on ${flag.assessment.label}`;
  return style === "live" ? "Flagged · exam hint" : "Exam hint";
}

/** "33:20" or "1:02:03" to milliseconds; null for anything else. */
export function parseStamp(stamp: string): number | null {
  const m = stamp.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [h, min, s] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
  if (s > 59 || (m[1] !== undefined && min > 59)) return null;
  return ((h * 60 + min) * 60 + s) * 1000;
}

/** The transcript the notes prompt reads: one `[33:20] text` line per segment, newest dropped first past the cap. */
export function transcriptForNotes(segments: readonly Segment[], cap = 60_000): string {
  const lines = [...segments].sort((a, b) => a.seq - b.seq).map((s) => `[${fmtStamp(s.atMs)}]${s.flag ? " (exam hint)" : ""} ${lineText(s)}`);
  let total = 0;
  const kept: string[] = [];
  for (const line of lines) {
    if (total + line.length + 1 > cap) break;
    kept.push(line);
    total += line.length + 1;
  }
  return kept.join("\n");
}

/** Model key points carry "33:20" stamps; each is pinned to the transcript line at or just before it. */
export function notesFrom(out: { summary: string; keyPoints: readonly { at: string; text: string }[] }, segments: readonly Segment[], now: EpochMs): LectureNotes {
  const starts = [...segments].map((s) => s.atMs).sort((a, b) => a - b);
  const pin = (ms: number) => {
    let best = starts[0] ?? ms;
    for (const t of starts) if (t <= ms + 999) best = t;
    return best;
  };
  const seen = new Set<string>();
  const keyPoints = out.keyPoints
    .map((k) => ({ atMs: pin(parseStamp(k.at) ?? 0), text: k.text.trim() }))
    .filter((k) => k.text && !seen.has(k.text) && seen.add(k.text))
    .sort((a, b) => a.atMs - b.atMs);
  return { summary: out.summary.trim(), keyPoints, generatedAt: now };
}
