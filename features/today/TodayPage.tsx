"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SampleSemesterButton } from "@/components/cue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { EpochMs, PlanView, StudyBlock } from "@/lib/domain";
import { planActions, usePlan } from "@/lib/plan";
import { href } from "@/lib/routes";
import { dayInterval, fmtDay, fmtDuration, fmtTime, useNow } from "@/lib/time";
import { cn } from "@/lib/utils";
import { briefInput, isRemaining, ruleBrief, summaryText, type BriefFacts } from "./brief";
import { NextUpCard } from "./NextUpCard";
import { timelineRows, type Trailing } from "./rows";
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
    <div className="flex flex-col gap-3.5 md:h-32 md:shrink-0">
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

/** No calendar yet: the two ways in. "Upload calendar" stays a button because the boot step asserts the role. */
function FirstRun({ onStart }: { onStart: () => void }) {
  const router = useRouter();
  return (
    <Column>
      <Header headline="Add your schedule to plan today." subline="Upload a course timetable or any calendar file. Cue fits study sessions around it." />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between md:gap-8 md:px-7 md:py-6">
          <div className="flex min-w-0 flex-col gap-3.5">
            <p className="text-sm leading-[18px] text-pretty text-graphite">An .ics file, a PDF or a screenshot of your timetable</p>
            <h2 className="text-lg leading-6 font-normal tracking-[-0.01em] text-ink">Cue plans reviews, test prep and work blocks around your lectures.</h2>
          </div>
          {/* Capture runs before the sample button's own handler, so focus can follow the data in. */}
          <div className="flex shrink-0 flex-wrap gap-2 max-md:flex-col" onClickCapture={onStart}>
            <Button className="max-md:h-11" onClick={() => router.push(href.calendar({ add: true }))}>
              Upload calendar
            </Button>
            <SampleSemesterButton className="max-md:h-11" />
          </div>
        </div>
      </Card>
    </Column>
  );
}

function useRescheduleAction(plan: PlanView, now: EpochMs, focusRow: (key: string) => void) {
  const router = useRouter();
  return async ({ block }: Extract<Trailing, { kind: "missed" }>) => {
    const minutes = fmtDuration(block.end - block.start);
    let moved;
    try {
      moved = await planActions.reschedule(block.id, { after: now });
    } catch {
      toast.add({ title: "Couldn't move this block.", description: "Reload the page and try again." });
      return;
    }
    if (!moved) {
      toast.add({
        title: `No free ${minutes} slot in the next 7 days.`,
        description: "Open the calendar to move this block by hand.",
        actionProps: { children: "Open calendar", onClick: () => router.push(href.calendar({ view: "day", date: plan.zone.dayOf(now) })) },
      });
      return;
    }
    const { zone } = plan;
    const today = zone.dayOf(now);
    const day = zone.dayOf(moved.start);
    const time = fmtTime(moved.start, zone);
    const when = day === today ? time : day === zone.addDays(today, 1) ? `tomorrow at ${time}` : `${fmtDay(day, zone, "weekdayShort")} at ${time}`;
    toast.add({
      title: `Moved to ${when}.`,
      actionProps: {
        children: "Undo",
        onClick: () =>
          void planActions
            .move(block.id, { start: block.start, end: block.end })
            .catch(() => toast.add({ title: "Couldn't move it back.", description: "That time now overlaps a class. Pick another slot on the calendar." })),
      },
    });
    if (day === today) focusRow(block.id);
  };
}

/** The screen once there is data: brief, next-up card, and the day list. `later` is the next session after today. */
function TodayView({ day, now, later, focusHeadline, onHeadlineFocused }: { day: PlanView; now: EpochMs; later: StudyBlock | undefined; focusHeadline: boolean; onHeadlineFocused: () => void }) {
  const lectureEvents = day.agenda.flatMap((i) => (i.kind === "event" && i.event.kind === "lecture" ? [i.event.id] : []));
  const shown = later ? [...day.blocks, later] : day.blocks;
  const facts = useTodayFacts(shown, lectureEvents);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const pendingFocus = useRef<string | null>(null);
  const reschedule = useRescheduleAction(day, now, (key) => (pendingFocus.current = key));

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

  // The Reschedule button unmounts once its row moves, so focus follows the row to its new place.
  useEffect(() => {
    const key = pendingFocus.current;
    const row = key && rows.find((r) => r.key === key);
    if (!key || !row || row.state === "missed") return;
    links.current.get(key)?.focus();
    pendingFocus.current = null;
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
        summary={summaryText(day.agenda.length, day.blocks)}
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

