import {
  sessionClock,
  sessionElapsedMs,
  sessionTransitions,
  type EpochMs,
  type Passage,
  type PlanStep,
  type PomodoroPrefs,
  type SessionPlan,
  type SourceRef,
  type StudySession,
  type ViewerTab,
} from "@/lib/domain";
import { refsFor } from "@/lib/retrieval";
import { sourceLabel } from "@/lib/sources";
import { fmtCountdown, fmtDuration, fmtStamp } from "@/lib/time";
import { normalizeMinutes, type PlanDraft } from "./shape";

export type PageRef = Extract<SourceRef, { kind: "page" }>;
export type TranscriptRef = Extract<SourceRef, { kind: "transcript" }>;

const MIN = 60_000;
const MAX_SLIDE_SPAN = 12;

export interface FlaggedLine {
  id: `F${number}`;
  ref: TranscriptRef;
  quote: string;
  examHint: boolean;
}

export interface PlanContext {
  focusMinutes: number;
  /** Page 1 of the lecture's deck, carrying its doc facts, and the deck's slide count. */
  deck: { ref: PageRef; count: number } | null;
  flagged: readonly FlaggedLine[];
  passages: readonly Passage[];
}

function slideRef(range: PlanDraft["steps"][number]["slides"], deck: PlanContext["deck"]): PageRef | undefined {
  if (!range || !deck) return undefined;
  const clamp = (n: number) => Math.min(deck.count, Math.max(1, Math.trunc(n)));
  const from = clamp(Math.min(range.from, range.to));
  const to = Math.min(clamp(Math.max(range.from, range.to)), from + MAX_SLIDE_SPAN - 1);
  const { to: _to, ...page1 } = deck.ref;
  return to === from ? { ...page1, page: from } : { ...page1, page: from, to };
}

function atStart(ref: TranscriptRef): TranscriptRef {
  const { toMs: _toMs, ...start } = ref;
  return start;
}

/** A transcript window can run to 90 s; the moment quotes its first sentences only. */
function leadQuote(text: string, max = 240): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 40 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

/** The model's numbers and ids are never trusted as given: ranges clamp to the deck, unknown ids drop, minutes rescale. */
export function buildPlan(draft: PlanDraft, ctx: PlanContext): SessionPlan {
  const minutes = normalizeMinutes(
    draft.steps.map((s) => s.minutes),
    ctx.focusMinutes,
  );
  const steps: PlanStep[] = minutes.map((m, i) => {
    const s = draft.steps[i];
    const source = slideRef(s.slides, ctx.deck) ?? refsFor(s.source ? [s.source] : [], ctx.passages)[0];
    const check = s.check.trim();
    return { title: s.title.trim(), kind: s.kind, minutes: m, ...(source ? { source } : {}), ...(check ? { check } : {}) };
  });
  const plan: SessionPlan = { steps };
  const id = draft.moment;
  if (!id) return plan;
  const line = ctx.flagged.find((f) => f.id === id);
  if (line) return { ...plan, moment: { ref: line.ref, quote: line.quote, examHint: line.examHint } };
  const passage = ctx.passages.find((p) => p.id === id);
  if (passage?.ref.kind === "transcript") return { ...plan, moment: { ref: atStart(passage.ref), quote: leadQuote(passage.text), examHint: false } };
  return plan;
}

/** Focus time inside `elapsedMs`: Pomodoro breaks do not count toward a step. */
export function focusMs(elapsedMs: number, pomodoro: PomodoroPrefs): number {
  const focus = pomodoro.focusMin * MIN;
  const cycle = focus + pomodoro.breakMin * MIN;
  if (cycle <= 0) return elapsedMs;
  const full = Math.floor(elapsedMs / cycle);
  return full * focus + Math.min(focus, elapsedMs - full * cycle);
}

export function stepOverMs(session: StudySession, now: EpochMs, pomodoro: PomodoroPrefs): number {
  const step = session.plan?.steps[session.step];
  if (!step) return 0;
  const spent = focusMs(sessionElapsedMs(session.state, now), pomodoro) - focusMs(session.stepSince, pomodoro);
  return Math.max(0, spent - step.minutes * MIN);
}

export type StepState = "done" | "current" | "upcoming" | "skipped";

export interface StepRow {
  title: string;
  state: StepState;
  /** Current step only: "Slides 12–17 · 8 min", or "Over by 1 min" once a full minute over. */
  meta?: string;
}

export function stepMeta(step: PlanStep, overMs: number): string {
  if (overMs >= MIN) return `Over by ${Math.floor(overMs / MIN)} min`;
  return [step.source ? sourceLabel(step.source, "chip") : null, `${step.minutes} min`].filter(Boolean).join(" · ");
}

/** `step` is null once the session is over: no step is current, and the ones left undone read Skipped. */
export function stepRows(plan: SessionPlan, at: { step: number | null; stepsDone: readonly number[] }, overMs = 0): StepRow[] {
  return plan.steps.map((s, i) => {
    if (i === at.step) return { title: s.title, state: "current", meta: stepMeta(s, overMs) };
    if (at.stepsDone.includes(i)) return { title: s.title, state: "done" };
    return at.step === null ? { title: s.title, state: "skipped", meta: "Skipped" } : { title: s.title, state: "upcoming" };
  });
}

/** One line for the plan when there is no room for the list: "Step 2 of 5 · Re-read key slides". */
export function planSummary(rows: readonly StepRow[]): string {
  const i = rows.findIndex((r) => r.state === "current");
  if (i >= 0) return `Step ${i + 1} of ${rows.length} · ${rows[i].title}`;
  return `${rows.filter((r) => r.state === "done").length} of ${rows.length} steps done`;
}

export interface TimerView {
  /** Quantized to whole percent, so the 160px fill matches Paper's round(29%, 1px). */
  fraction: number;
  text: string;
  valueText: string;
  over: boolean;
  /** For the polite live region: changes only at a break, at 5 minutes left and at time up. */
  milestone: string;
}

function spoken(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const parts = [m ? `${m} minute${m === 1 ? "" : "s"}` : "", s % 60 ? `${s % 60} second${s % 60 === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" ") || "0 seconds";
}

export function timerView(session: StudySession, now: EpochMs, pomodoro: PomodoroPrefs): TimerView {
  const clock = sessionClock(session, now, pomodoro);
  const paused = session.state.status === "paused";
  const pct = (f: number) => Math.round(Math.min(1, Math.max(0, f)) * 100) / 100;
  if (clock.phase === "over") return { fraction: 1, text: "Time's up", valueText: "Time's up", over: true, milestone: "Time's up." };
  const prefix = paused ? "Paused · " : "";
  if (clock.phase === "break") {
    const breakMs = pomodoro.breakMin * MIN;
    return {
      fraction: pct(breakMs > 0 ? 1 - clock.phaseLeftMs / breakMs : 1),
      text: `${prefix}Break · ${fmtCountdown(clock.phaseLeftMs)} left`,
      valueText: `Break, ${spoken(clock.phaseLeftMs)} left`,
      over: false,
      milestone: `Break. ${spoken(clock.phaseLeftMs)}.`,
    };
  }
  return {
    fraction: pct(clock.fraction),
    text: `${prefix}${fmtCountdown(clock.leftMs)} left`,
    valueText: `${paused ? "Paused, " : ""}${spoken(clock.leftMs)} left of ${session.minutes} minutes`,
    over: false,
    milestone: clock.leftMs <= 5 * MIN ? "5 minutes left." : "",
  };
}

export const isLive = (session: StudySession): boolean => session.state.status === "running" || session.state.status === "paused";

export type Advance = "next" | "finish";

export const ADVANCE_LABEL: Record<Advance, string> = { next: "Next step", finish: "Finish session" };

/** The check row's button finishes the session on the last step, and on any step once time is up. */
export function advanceKind(session: StudySession, now: EpochMs, pomodoro: PomodoroPrefs): Advance {
  const last = session.step >= (session.plan?.steps.length ?? 0) - 1;
  return last || sessionClock(session, now, pomodoro).phase === "over" ? "finish" : "next";
}

/** Finishing counts the step on screen as done, the same as Next step would. */
export function finishSession(session: StudySession, now: EpochMs): StudySession {
  if (!isLive(session)) return session;
  const stepsDone = session.stepsDone.includes(session.step) ? session.stepsDone : [...session.stepsDone, session.step].sort((a, b) => a - b);
  return sessionTransitions.end({ ...session, stepsDone }, now);
}

export function endSummary(session: StudySession, now: EpochMs): string {
  const total = session.plan?.steps.length ?? 0;
  const after = Math.max(0, total - session.step - 1);
  const leftMs = session.minutes * MIN - sessionElapsedMs(session.state, now);
  const left = leftMs > 0 ? fmtCountdown(leftMs) : "time's up";
  if (total === 0) return leftMs > 0 ? `${left} left` : "Time's up";
  return after === 0 ? `Last step · ${leftMs > 0 ? `${left} left` : left}` : `${after} step${after === 1 ? "" : "s"} left · ${left}`;
}

export function finishedSummary(session: StudySession): string {
  const studied = fmtDuration(sessionElapsedMs(session.state, session.updatedAt));
  return `${session.state.status === "completed" ? "Completed" : "Ended"} · ${studied} studied`;
}

/** Each tab remembers its own place, so going back to Slides finds slide 14 again. */
export interface ViewerState {
  tab: ViewerTab;
  slides?: PageRef;
  transcript?: TranscriptRef;
  textbook?: PageRef;
  handout?: PageRef;
}

export function tabFor(ref: SourceRef): ViewerTab | null {
  if (ref.kind === "transcript") return "transcript";
  if (ref.kind !== "page") return null;
  switch (ref.doc.kind) {
    case "slides":
      return "slides";
    case "textbook":
    case "notes":
      return "textbook";
    case "handout":
      return "handout";
    default:
      return null;
  }
}

/** Points the viewer at a ref; null when the viewer cannot show it (a question, a past paper), so SourcePeek takes it. */
export function showRef(v: ViewerState, ref: SourceRef): ViewerState | null {
  const tab = tabFor(ref);
  if (ref.kind === "transcript") return { ...v, tab: "transcript", transcript: atStart(ref) };
  if (ref.kind !== "page") return null;
  switch (tab) {
    case "slides": {
      const { to: _to, ...one } = ref;
      return { ...v, tab, slides: one };
    }
    case "textbook":
      return { ...v, tab, textbook: ref };
    case "handout":
      return { ...v, tab, handout: ref };
    default:
      return null;
  }
}

export function stepSlide(v: ViewerState, delta: number, count: number): ViewerState {
  if (!v.slides || count < 1) return v;
  const page = Math.min(count, Math.max(1, v.slides.page + delta));
  return page === v.slides.page ? v : { ...v, slides: { ...v.slides, page } };
}

/** The tab's own name: Paper's `Textbook §5.2` names the reading tab by role; the header names the document. */
export function tabLabel(tab: ViewerTab, v: ViewerState): string {
  switch (tab) {
    case "slides":
      return "Slides";
    case "transcript":
      return "Transcript";
    case "textbook":
      return ["Textbook", v.textbook?.section].filter(Boolean).join(" ");
    case "handout":
      return v.handout ? sourceLabel(v.handout, "chip") : "Handout";
  }
}

export function viewerLabel(v: ViewerState, slideCount: number | undefined): string {
  switch (v.tab) {
    case "slides":
      return v.slides ? `Slide ${v.slides.page}${slideCount ? ` of ${slideCount}` : ""}` : "Slides";
    case "transcript":
      return v.transcript ? `Transcript · ${fmtStamp(v.transcript.atMs)}` : "Transcript";
    case "textbook":
    case "handout": {
      const ref = v[v.tab];
      if (!ref) return tabLabel(v.tab, v);
      return [[ref.doc.short ?? ref.doc.title, ref.section].filter(Boolean).join(" "), ref.label].filter(Boolean).join(" · ");
    }
  }
}

export function flagLabel(assessment: string | undefined): string {
  if (!assessment) return "Flagged";
  return /^(midterm|exam|final|quiz)$/i.test(assessment) ? `Flagged · on the ${assessment.toLowerCase()}` : `Flagged · on ${assessment}`;
}

const TABS: readonly ViewerTab[] = ["slides", "transcript", "textbook", "handout"];

/** Tabs with something to show, in Paper's order; a handout tab exists only once a handout was opened. */
export function availableTabs(v: ViewerState): ViewerTab[] {
  return TABS.filter((t) => v[t] !== undefined);
}

export interface ViewerSources {
  deck: { ref: PageRef } | null;
  lecture: { ref: TranscriptRef } | null;
  reading: PageRef | null;
  handout: PageRef | null;
}

/**
 * Where the viewer opens before the student touches it: the next step that names material, then the place a
 * started session last saved, then the `?tab=` a link asked for.
 */
export function defaultViewer(
  src: ViewerSources,
  plan: SessionPlan | undefined,
  step: number,
  opts: { tab?: ViewerTab; saved?: StudySession["viewer"] } = {},
): ViewerState {
  const steps = plan?.steps ?? [];
  const planReading = steps.map((s) => s.source).find((r): r is PageRef => r?.kind === "page" && tabFor(r) === "textbook");
  const moment = plan?.moment?.ref;
  const reading = planReading ?? src.reading;
  let v: ViewerState = {
    tab: "slides",
    ...(src.deck ? { slides: src.deck.ref } : {}),
    ...(src.lecture ? { transcript: moment?.lectureId === src.lecture.ref.lectureId ? moment : src.lecture.ref } : {}),
    ...(reading ? { textbook: reading } : {}),
    ...(opts.tab === "handout" && src.handout ? { handout: src.handout } : {}),
  };
  v = { ...v, tab: availableTabs(v)[0] ?? "slides" };
  const next = steps.slice(step).find((s) => s.source && tabFor(s.source))?.source;
  if (next) v = showRef(v, next) ?? v;
  if (opts.saved?.ref) v = showRef(v, opts.saved.ref) ?? v;
  if (opts.tab && v[opts.tab]) v = { ...v, tab: opts.tab };
  return v;
}

export function viewerForStep(v: ViewerState, step: PlanStep | undefined): ViewerState {
  return step?.source ? (showRef(v, step.source) ?? v) : v;
}
