"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SampleSemesterButton } from "@/components/cue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { EpochMs, PlanView, StudyBlock } from "@/lib/domain";
import { planActions, usePlan } from "@/lib/plan";
import { href } from "@/lib/routes";
import { dayInterval, fmtDay, fmtDuration, fmtTime, useNow } from "@/lib/time";
import { cn } from "@/lib/utils";
import { briefInput, isRemaining, ruleBrief, summaryText, type BriefFacts } from "./brief";
import { NextUpCard } from "./NextUpCard";
import { timelineRows, type TodayRow, type Trailing } from "./rows";
import { Timeline } from "./Timeline";
import { useBriefSubline, useTodayFacts } from "./use-today";

const DAY = 24 * 60 * 60_000;
/** How far ahead the card looks for the next session once today has none left. */
const LOOKAHEAD_DAYS = 14;

/** Paper's main column: 61 top and 80/56 at 1440, narrowing with the viewport (today.md section 5). */
function Column({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div
      aria-busy={busy || undefined}
      className="flex w-full flex-col gap-8 px-5 pt-6 pb-10 md:gap-10 md:px-10 md:pt-[61px] md:pb-12 lg:pr-10 lg:pl-12 xl:pr-12 xl:pl-16 min-[90rem]:pr-14 min-[90rem]:pl-20 [&>*]:max-w-[1072px]"
    >
      {children}
    </div>
  );
}

function Header({ headline, subline, headlineRef }: { headline: string; subline: ReactNode; headlineRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <div className="flex flex-col gap-3.5 md:min-h-32 md:shrink-0">
      <h1 ref={headlineRef} tabIndex={-1} className="max-w-[700px] text-2xl font-normal tracking-display text-balance text-ink outline-none max-md:text-[24px] max-md:leading-[30px]">
        {headline}
      </h1>
      <p className="max-w-[560px] text-base text-pretty text-graphite">{subline}</p>
    </div>
  );
}

/** Shown only after 150ms, so a fast IndexedDB answer never flashes it. Keeps every box Paper draws, so nothing shifts. */
function TodaySkeleton() {
  return (
    <Column busy>
      <div className="flex animate-in flex-col gap-3.5 fill-mode-both delay-150 duration-150 fade-in md:h-32" aria-hidden="true">
        <Skeleton className="h-8 w-full max-w-[520px]" />
        <div className="flex flex-col gap-2 pt-1">
          <Skeleton className="h-3.5 w-full max-w-[560px]" />
          <Skeleton className="h-3.5 w-3/4 max-w-[420px]" />
        </div>
      </div>
      <Card className="animate-in gap-3.5 fill-mode-both px-5 py-5 delay-150 duration-150 fade-in md:h-[152px] md:px-7 md:py-6" aria-hidden="true">
        <Skeleton className="h-[22px] w-80 max-w-full" />
        <Skeleton className="h-6 w-60 max-w-full" />
        <Skeleton className="h-7 w-[420px] max-w-full" />
      </Card>
      <div className="flex animate-in flex-col fill-mode-both delay-150 duration-150 fade-in" aria-hidden="true">
        <div className="border-b border-ink pb-3">
          <Skeleton className="h-[18px] w-16" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-b border-rule py-3.5">
            <Skeleton className="h-[22px] w-full max-w-[640px]" />
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        Loading today
      </span>
    </Column>
  );
}

/** No calendar yet: the next-up card's slot becomes an Empty holding the two ways in. "Add schedule" stays a button because the boot step asserts the role. */
function FirstRun({ onStart }: { onStart: () => void }) {
  const router = useRouter();
  return (
    <Column>
      <Header headline="Add your schedule to plan today." subline="Upload a course timetable or any calendar file. Cue fits study sessions around it." />
      <Card className="gap-0 py-0">
        <Empty className="gap-0 rounded-none p-5 md:min-h-[150px] md:px-7 md:py-6">
          {/* Capture runs before the sample button's own handler, so focus can follow the data in. */}
          <EmptyContent className="max-w-none gap-2 max-md:items-stretch md:w-auto md:flex-row" onClickCapture={onStart}>
            <Button className="max-md:h-11" onClick={() => router.push(href.calendar({ add: true }))}>
              Add schedule
            </Button>
            <SampleSemesterButton className="max-md:h-11" />
          </EmptyContent>
        </Empty>
      </Card>
    </Column>
  );
}

/**
 * Where focus goes once a move lands, since the control that started it unmounts: the block's row once the list shows
 * it at `at`, or the headline when the block leaves today.
 */
type FocusTarget = { kind: "row"; key: string; at: EpochMs } | { kind: "headline" };

function useRescheduleAction(plan: PlanView, now: EpochMs, focus: (target: FocusTarget) => void) {
  const router = useRouter();
  /**
   * Base UI hands focus back only to where an F6 jump started, so closing a toast from inside it (Escape, its close
   * button, its action) would leave focus on the page body. Send it to `target`, unless Base UI moved it to another toast.
   */
  const returnFocusTo = (target: FocusTarget) => () => {
    const closing = document.activeElement?.closest('[data-slot="toast"]');
    if (!closing) return;
    queueMicrotask(() => {
      if (closing.contains(document.activeElement)) focus(target);
    });
  };
  return async ({ block }: Extract<Trailing, { kind: "missed" }>) => {
    const minutes = fmtDuration(block.end - block.start);
    const unmoved: FocusTarget = { kind: "row", key: block.id, at: block.start };
    let moved;
    try {
      moved = await planActions.reschedule(block.id, { after: now });
    } catch {
      toast.add({ title: "Couldn’t move this block.", description: "Reload the page and try again.", timeout: 0, onClose: returnFocusTo(unmoved) });
      return;
    }
    const openCalendar = { children: "Open calendar", onClick: () => router.push(href.calendar({ view: "day", date: plan.zone.dayOf(now) })) };
    if (!moved) {
      toast.add({
        title: `No free ${minutes} slot in the next 7 days.`,
        description: "Open the calendar to move this block by hand.",
        timeout: 0,
        actionProps: openCalendar,
        onClose: returnFocusTo(unmoved),
      });
      return;
    }
    const { zone } = plan;
    const today = zone.dayOf(now);
    const day = zone.dayOf(moved.start);
    const time = fmtTime(moved.start, zone);
    const when = day === today ? time : day === zone.addDays(today, 1) ? `tomorrow at ${time}` : `${fmtDay(day, zone, "weekdayShort")} at ${time}`;
    const landed: FocusTarget = day === today ? { kind: "row", key: block.id, at: moved.start } : { kind: "headline" };
    const movedToast = toast.add({
      title: `Moved to ${when}.`,
      timeout: 0,
      onClose: returnFocusTo(landed),
      actionProps: {
        children: "Undo",
        onClick: () => {
          toast.close(movedToast);
          planActions.move(block.id, { start: block.start, end: block.end }).then(
            () => focus(unmoved),
            () => {
              toast.add({
                title: "Couldn’t move it back.",
                description: "That time now overlaps another event. Open the calendar to pick a slot.",
                timeout: 0,
                actionProps: openCalendar,
                onClose: returnFocusTo(landed),
              });
              focus(landed);
            },
          );
        },
      },
    });
    focus(landed);
  };
}

/** The screen once there is data: brief, next-up card, and the day list. `later` is the next session after today. */
function TodayView({ day, now, later, focusHeadline, onHeadlineFocused }: { day: PlanView; now: EpochMs; later: StudyBlock | undefined; focusHeadline: boolean; onHeadlineFocused: () => void }) {
  const lectureEvents = day.agenda.flatMap((i) => (i.kind === "event" && i.event.kind === "lecture" ? [i.event.id] : []));
  const shown = later ? [...day.blocks, later] : day.blocks;
  const facts = useTodayFacts(shown, lectureEvents);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const pendingFocus = useRef<FocusTarget | null>(null);
  const latestRows = useRef<readonly TodayRow[]>([]);
  const applyFocus = useCallback(() => {
    const target = pendingFocus.current;
    if (!target) return;
    if (target.kind === "row") {
      if (!latestRows.current.some((r) => r.key === target.key && r.start === target.at)) return;
      links.current.get(target.key)?.focus();
    } else headlineRef.current?.focus();
    pendingFocus.current = null;
  }, []);
  const reschedule = useRescheduleAction(day, now, (target) => {
    pendingFocus.current = target;
    applyFocus();
  });

  const next = day.blocks.find((b) => isRemaining(day.status(b)));
  const cardBlock = next ?? later;
  const briefFacts: BriefFacts | null = facts
    ? {
        zone: day.zone,
        now,
        blocks: day.blocks,
        status: day.status,
        agendaCount: day.agenda.length,
        later,
        testFor: (b) => {
          const test = b.why.boostedBy && facts.tests.get(b.why.boostedBy.test);
          return test ? { course: test.courseId, label: test.label, day: day.zone.dayOf(test.start) } : undefined;
        },
        materialsFor: (b) => facts.materials.get(b.id),
      }
    : null;
  const rule = briefFacts ? ruleBrief(briefFacts) : null;
  const modelSubline = useBriefSubline(briefFacts && rule && day.blocks.length > 0 && rule.subline ? briefInput(briefFacts, rule) : null);
  const rows = facts ? timelineRows({ zone: day.zone, now, agenda: day.agenda, status: day.status, lectures: facts.lectures, sessions: facts.sessions, next }) : [];

  const ready = Boolean(facts && rule);
  useEffect(() => {
    if (!ready || !focusHeadline) return;
    if (document.activeElement === document.body || document.activeElement === null) headlineRef.current?.focus();
    onHeadlineFocused();
  }, [ready, focusHeadline, onHeadlineFocused]);

  useEffect(() => {
    latestRows.current = rows;
    applyFocus();
  });

  if (!facts || !rule) return <TodaySkeleton />;
  const subline = modelSubline ?? rule.subline;
  return (
    <Column>
      <Header
        headline={rule.headline}
        headlineRef={headlineRef}
        subline={
          <span key={subline} className={cn(subline !== rule.subline && "animate-rise")}>
            {subline}
          </span>
        }
      />
      {cardBlock && (
        <NextUpCard
          block={cardBlock}
          status={next ? day.status(next) : "upcoming"}
          materials={facts.materials.get(cardBlock.id)}
          session={facts.sessions.get(cardBlock.id)}
          zone={day.zone}
          now={now}
        />
      )}
      <Timeline
        rows={rows}
        summary={summaryText(day.agenda, day.blocks)}
        linkRef={(key, el) => {
          if (el) links.current.set(key, el);
          else links.current.delete(key);
        }}
        onReschedule={reschedule}
      />
    </Column>
  );
}

/** Today has nothing left: find the first session after it, so the card can offer it early. */
function TodayAfter(props: { day: PlanView; now: EpochMs; focusHeadline: boolean; onHeadlineFocused: () => void }) {
  const { day, now } = props;
  const tomorrow = dayInterval(day.zone.dayOf(now), day.zone).end;
  const ahead = usePlan({ start: tomorrow, end: (tomorrow + LOOKAHEAD_DAYS * DAY) as EpochMs });
  if (!ahead) return <TodaySkeleton />;
  const later = ahead.blocks.find((b) => b.start >= tomorrow && isRemaining(ahead.status(b)));
  return <TodayView {...props} later={later} />;
}

export function TodayPage() {
  const now = useNow("minute");
  const day = usePlan({ day: now });
  const [focusHeadline, setFocusHeadline] = useState(false);
  const clearFocus = useCallback(() => setFocusHeadline(false), []);
  if (!day || now === 0) return <TodaySkeleton />;
  if (day.isEmpty) return <FirstRun onStart={() => setFocusHeadline(true)} />;
  const props = { day, now, focusHeadline, onHeadlineFocused: clearFocus };
  return day.blocks.some((b) => isRemaining(day.status(b))) ? <TodayView {...props} later={undefined} /> : <TodayAfter {...props} />;
}

