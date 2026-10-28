"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Mic } from "lucide-react";
import { CourseChip, ErrorLine } from "@/components/cue";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { db, useLive } from "@/lib/db";
import { ids, type BlockStatus, type CalendarEvent, type EpochMs, type Lecture, type StudyBlock, type TimedEvent, type Zone } from "@/lib/domain";
import { blockReasonText, blockTitle, loadPlanInput, planActions, schedule, usePlan } from "@/lib/plan";
import { href } from "@/lib/routes";
import { fmtRange, fmtTime } from "@/lib/time";
import { eventTitle, shortDay, type BlockLook } from "./model";
import { useNarrow } from "./narrow";
import { extraWorkSlot, extraWorkTopic, isExtraWork, rescheduleSlot } from "./slots";

const DAY = 24 * 60 * 60_000;

export type Subject =
  | { kind: "block"; block: StudyBlock; status: BlockStatus; look: BlockLook }
  | { kind: "event"; event: TimedEvent; live: boolean }
  | { kind: "deadline"; event: Extract<CalendarEvent, { kind: "deadline" }> };

export interface TriggerProps {
  className?: string;
  style?: CSSProperties;
  tabIndex?: number;
  "aria-label": string;
  "data-state"?: string;
  "data-nav"?: string;
  "data-kind"?: string;
  "data-id"?: string;
  children: ReactNode;
}

/**
 * Every block and chip is a button that opens its details: a 280px popover at the block's right, side right, align
 * start, offset 8, or a bottom drawer below 768px (calendar.md 5).
 */
export function ItemPopover({ subject, zone, now, trigger }: { subject: Subject; zone: Zone; now: EpochMs; trigger: TriggerProps }) {
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const title = subject.kind === "block" ? blockTitle(subject.block, "timeline") : subject.kind === "event" ? eventTitle(subject.event) : `${subject.event.courseId} ${subject.event.short}`;
  const details = (
    <>
      {subject.kind === "block" && <BlockDetails {...subject} zone={zone} now={now} close={close} />}
      {subject.kind === "event" && <EventDetails event={subject.event} live={subject.live} zone={zone} />}
      {subject.kind === "deadline" && <DeadlineDetails event={subject.event} zone={zone} now={now} close={close} />}
    </>
  );
  if (narrow) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger {...trigger} />
        <DrawerContent aria-label={title}>
          <div className="flex flex-col gap-3 px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] text-sm leading-5">{details}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger {...trigger} />
      <PopoverContent aria-label={title} side="right" align="start" sideOffset={8} className="w-[280px] max-w-[calc(100vw-32px)] gap-3 rounded-lg p-4 text-sm leading-5">
        {details}
      </PopoverContent>
    </Popover>
  );
}

function Header({ course, title, children }: { course?: string | null; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      {course && <CourseChip code={course} />}
      <div className="flex flex-col">
        <p className="leading-4 font-medium text-ink">{title}</p>
        {children}
      </div>
    </div>
  );
}

const Meta = ({ children }: { children: ReactNode }) => <p className="text-graphite">{children}</p>;

const STATUS_LINE: Partial<Record<BlockStatus, string>> = { done: "Done", missed: "Missed. Reschedule it, or mark it done if you studied anyway.", inProgress: "In progress" };

function BlockDetails({ block, status, look, zone, now, close }: { block: StudyBlock; status: BlockStatus; look: BlockLook; zone: Zone; now: EpochMs; close: () => void }) {
  const [busy, setBusy] = useState<"reschedule" | "done" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const day = zone.dayOf(block.start);
  const minutes = Math.round((block.end - block.start) / 60_000);
  const finished = status === "done" && look !== "done";

  async function reschedule() {
    setBusy("reschedule");
    setError(null);
    try {
      const slot = rescheduleSlot(await loadPlanInput(), block, status, Math.max(now, Date.now()) as EpochMs);
      if (!slot) {
        const limit = block.anchor.kind === "work" ? "before it's due" : block.anchor.kind === "testPrep" ? "before the test" : "in the next 7 days";
        setError(`No free ${minutes}-minute slot ${limit}. Mark it done, or clear some time and try again.`);
        return;
      }
      await planActions.move(block.id, slot);
      close();
      toast.add({ title: `Moved to ${shortDay(zone.dayOf(slot.start))}, ${fmtRange(slot, zone)}.` });
    } catch {
      setError("Couldn't move this block. Reload the page and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleDone() {
    setBusy("done");
    try {
      if (look === "done") await planActions.restore(block.id);
      else await planActions.markDone(block.id);
      close();
    } catch {
      setError("Couldn't save that. Reload the page and try again.");
    } finally {
      setBusy(null);
    }
  }

  const start = (
    <Link key="start" href={href.study(block.id, { start: true })} className={buttonVariants({ variant: status === "missed" ? "secondary" : "default" })}>
      {status === "inProgress" ? "Resume session" : "Start session"}
    </Link>
  );
  const move = (
    <Button key="move" variant={status === "missed" ? "default" : "secondary"} disabled={busy !== null} onClick={reschedule}>
      Reschedule
    </Button>
  );
  const done = (
    <Button key="done" variant="ghost" disabled={busy !== null} onClick={toggleDone}>
      {look === "done" ? "Mark not done" : "Mark done"}
    </Button>
  );
  const actions = finished
    ? [
        <Link key="open" href={href.study(block.id)} className={buttonVariants({ variant: "secondary" })}>
          Open session
        </Link>,
      ]
    : look === "done"
      ? [start, done]
      : status === "missed"
        ? [move, start, done]
        : [start, move, done];

  return (
    <>
      <Header course={block.courseId} title={blockTitle(block, "timeline")}>
        <Meta>
          {shortDay(day)} · {fmtRange(block, zone)}
          {status === "now" ? " · now" : ""}
        </Meta>
      </Header>
      <div className="flex flex-col">
        <Meta>{blockReasonText(block, "sentence")}</Meta>
        {block.note && <Meta>{block.note}</Meta>}
        {(STATUS_LINE[status] || look === "done") && <p className="text-ink">{look === "done" ? "Marked done" : STATUS_LINE[status]}</p>}
      </div>
      {error && <ErrorLine title={error} />}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </>
  );
}

function EventDetails({ event, live, zone }: { event: TimedEvent; live: boolean; zone: Zone }) {
  const day = zone.dayOf(event.start);
  const meta = `${shortDay(day)} · ${fmtRange(event, zone)}${event.location ? ` · ${event.location}` : ""}${live ? " · now" : ""}`;
  return (
    <>
      <Header course={"courseId" in event ? event.courseId : null} title={eventTitle(event)}>
        <Meta>{meta}</Meta>
      </Header>
      {event.kind === "lecture" && <LectureDetails event={event} />}
      {event.kind === "test" && <PlannedFor anchor={event} kind="testPrep" until={event.start} zone={zone} empty="No prep sessions planned yet." />}
      {event.kind === "busy" && <Meta>Busy time from your calendar. Cue plans no study over it.</Meta>}
    </>
  );
}

function LectureDetails({ event }: { event: Extract<TimedEvent, { kind: "lecture" }> }) {
  const lectureId = ids.lectureForEvent(event.id);
  const lecture = useLive<Lecture | null>(async () => (await db.lectures.get(lectureId)) ?? null, [lectureId]);
  const saved = lecture?.state.status === "saved";
  const topic = lecture?.topic ?? event.topic;
  const line = [event.number !== undefined ? `Lecture ${event.number}` : null, topic?.full].filter(Boolean).join(" · ");
  return (
    <>
      {line && <Meta>{line}</Meta>}
      <div className="flex flex-wrap gap-2">
        <Link href={href.lecture(lectureId)} className={buttonVariants()}>
          <Mic data-icon="inline-start" className="size-4" strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
          {saved ? "Open notes" : "Take notes"}
        </Link>
      </div>
    </>
  );
}

/** The study blocks planned for a test or deadline, read from the plan around it. */
function PlannedFor({ anchor, kind, until, zone, empty }: { anchor: CalendarEvent; kind: "testPrep" | "work"; until: EpochMs; zone: Zone; empty: string }) {
  const plan = usePlan({ start: (until - 15 * DAY) as EpochMs, end: until });
  const blocks =
    plan?.blocks.filter(
      (b) => (b.anchor.kind === "work" && b.anchor.deadline === anchor.id) || (b.anchor.kind === "testPrep" && b.anchor.test === anchor.id) || (anchor.kind === "deadline" && isExtraWork(b, anchor)),
    ) ?? [];
  if (!plan) return null;
  if (blocks.length === 0) return <Meta>{empty}</Meta>;
  return (
    <ul aria-label={kind === "work" ? "Work blocks" : "Prep sessions"} className="flex flex-col">
      {blocks.map((b) => (
        <li key={b.id} className="text-graphite">
          <span className="text-ink">{blockTitle(b, "calendar")}</span> · {shortDay(zone.dayOf(b.start))}, {fmtRange(b, zone)}
        </li>
      ))}
    </ul>
  );
}

const MORE_EFFORT = { small: "medium", medium: "large" } as const;

const NO_ROOM = (short: string) => `Cue couldn't fit another work block before ${short} is due. Move a block to make room, then try again.`;

function DeadlineDetails({ event, zone, now, close }: { event: Extract<CalendarEvent, { kind: "deadline" }>; zone: Zone; now: EpochMs; close: () => void }) {
  const [busy, setBusy] = useState(false);
  const day = zone.dayOf(event.start);

  /** Raises the effort while it can, so the scheduler spreads the work; past the largest effort it adds an hour. */
  async function planMore() {
    setBusy(true);
    try {
      if (event.effort !== "large") {
        const count = async () => schedule(await loadPlanInput()).blocks.filter((b) => b.anchor.kind === "work" && b.anchor.deadline === event.id).length;
        const before = await count();
        await db.events.put({ ...event, effort: MORE_EFFORT[event.effort] });
        const added = (await count()) - before;
        close();
        toast.add({ title: added > 0 ? `Cue planned ${added} more work block${added === 1 ? "" : "s"} for ${event.short}.` : NO_ROOM(event.short) });
        return;
      }
      const slot = extraWorkSlot(await loadPlanInput(), event, Math.max(now, Date.now()) as EpochMs);
      close();
      if (!slot) {
        toast.add({ title: NO_ROOM(event.short) });
        return;
      }
      await planActions.addCustom({ course: event.courseId, topic: extraWorkTopic(event), at: slot });
      toast.add({ title: `Cue planned another work block for ${event.short}: ${shortDay(zone.dayOf(slot.start))}, ${fmtRange(slot, zone)}.` });
    } catch {
      toast.add({ title: "Couldn't plan more time. Reload the page and try again.", timeout: 0 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header course={event.courseId} title={`${event.courseId} ${event.short}`}>
        <Meta>
          Due {shortDay(day)}, {fmtTime(event.start, zone)}
        </Meta>
      </Header>
      <PlannedFor anchor={event} kind="work" until={event.start} zone={zone} empty="No work blocks planned for it." />
      {event.start > now && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={planMore}>
            Plan more time
          </Button>
        </div>
      )}
    </>
  );
}
