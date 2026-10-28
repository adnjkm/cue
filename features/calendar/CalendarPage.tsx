"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { SampleSemesterButton } from "@/components/cue";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { db, useLive } from "@/lib/db";
import { lectureLive, type EpochMs, type LocalDate, type PlanOverride, type PlanRange, type Zone } from "@/lib/domain";
import { usePlan } from "@/lib/plan";
import { usePrefs } from "@/lib/prefs";
import { href, type CalendarView } from "@/lib/routes";
import { parseDay, useNow, zoneOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { WeekAgenda } from "./Agenda";
import { ImportDialog } from "./ImportDialog";
import { itemsByDay, parseDateParam, parseViewParam, periodLabel, shiftDate, viewDays } from "./model";
import { MonthGrid } from "./MonthGrid";
import { useNarrow } from "./narrow";
import { tid } from "./testids";
import { TimeGrid } from "./TimeGrid";

const VIEWS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

/** Calendar: week, day and month at /calendar?view=&date=, with `add=1` opening the import dialog. */
export function CalendarPage() {
  return (
    <Suspense fallback={<div data-testid={tid.main} aria-busy className="h-dvh" />}>
      <CalendarScreen />
    </Suspense>
  );
}

function rangeOf(view: CalendarView, date: LocalDate, zone: Zone): PlanRange {
  if (view === "day") return { day: date };
  if (view === "week") return { week: zone.weekOf(date) };
  return { month: date.slice(0, 7) as `${number}-${number}` };
}

function CalendarScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const narrow = useNarrow();
  const now = useNow("minute");
  const prefs = usePrefs("foundation");
  const zone = prefs ? zoneOf(prefs.zone) : null;
  const today = zone && now > 0 ? zone.dayOf(now) : null;

  const viewParam = parseViewParam(params.get("view"));
  const dateParam = parseDateParam(params.get("date"));
  const adding = params.get("add") === "1";
  const view: CalendarView = viewParam ?? (narrow ? "day" : "week");
  const date = dateParam ?? today;
  const [todayClicks, setTodayClicks] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!today || (viewParam && dateParam)) return;
    router.replace(href.calendar({ view, date: dateParam ?? today, ...(adding ? { add: true } : {}) }), { scroll: false });
  }, [today, viewParam, dateParam, view, adding, router]);

  const go = (v: CalendarView, d: LocalDate) => router.push(href.calendar({ view: v, date: d }), { scroll: false });

  if (!zone || !date || !today) return <div data-testid={tid.main} aria-busy className="h-dvh" />;

  const dialogOpen = addOpen || adding;
  const setDialog = (open: boolean) => {
    setAddOpen(open);
    if (!open && adding) router.replace(href.calendar({ view, date }), { scroll: false });
  };

  return (
    <div
      data-testid={tid.main}
      className={cn(
        "flex h-dvh flex-col px-10 pt-7 pb-8 max-[899px]:px-6 max-md:h-[calc(100dvh-56px)] max-md:px-5 max-md:pt-4 max-md:pb-0",
        view === "month" && !narrow ? "gap-6" : "gap-2",
      )}
    >
      <Toolbar
        view={view}
        date={date}
        zone={zone}
        narrow={narrow}
        go={go}
        onToday={() => {
          go(view, today);
          setTodayClicks((n) => n + 1);
        }}
        onAdd={() => setDialog(true)}
      />
      <CalendarBody view={view} date={date} zone={zone} now={now} today={today} narrow={narrow} scrollKey={`${view}:${viewDays(view, date)[0]}:${todayClicks}`} onAdd={() => setDialog(true)} />
      <ImportDialog open={dialogOpen} onOpenChange={setDialog} zone={zone} now={now} />
    </div>
  );
}

function CalendarBody({ view, date, zone, now, today, narrow, scrollKey, onAdd }: { view: CalendarView; date: LocalDate; zone: Zone; now: EpochMs; today: LocalDate; narrow: boolean; scrollKey: string; onAdd: () => void }) {
  const plan = usePlan(rangeOf(view, date, zone));
  const overrides = useLive(() => db.overrides.toArray(), []);
  const recordingRows = useLive(() => db.lectures.where("state.status").equals("recording").toArray(), []);
  const dayList = useMemo(() => viewDays(view, date), [view, date]);
  const days = useMemo(() => {
    if (!plan || !overrides) return null;
    return itemsByDay(plan, dayList, new Map<string, PlanOverride>(overrides.map((o) => [o.blockId, o])));
  }, [plan, overrides, dayList]);
  const recording = new Set((recordingRows ?? []).filter((l) => l.eventId && lectureLive(l, now) === "recording").map((l) => l.eventId!));
  const empty = plan?.isEmpty ? <EmptySchedule onAdd={onAdd} month={view === "month"} gutter={narrow ? 44 : 52} /> : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {view === "month" ? (
        <MonthGrid days={days} dayList={dayList} month={parseDay(date).m} zone={zone} now={now} today={today} narrow={narrow} />
      ) : view === "week" && narrow ? (
        <WeekAgenda days={days} zone={zone} now={now} today={today} />
      ) : (
        <TimeGrid mode={view} days={days} dayList={dayList} zone={zone} now={now} today={today} narrow={narrow} recording={recording} scrollKey={scrollKey} />
      )}
      {empty}
    </div>
  );
}

/** No schedule yet: the grid still draws, with the way in on top at the 8am line (calendar.md 5, upload). */
function EmptySchedule({ onAdd, month, gutter }: { onAdd: () => void; month: boolean; gutter: number }) {
  return (
    <div className={cn("pointer-events-none absolute right-0 bottom-0 flex justify-center", month ? "top-10 left-0 items-center" : "top-[116px] items-start")} style={month ? undefined : { left: gutter }}>
      <div className="pointer-events-auto flex max-w-[400px] flex-col items-start gap-2 bg-page px-6 py-5">
        <h2 className="text-lg leading-6 font-normal tracking-display text-ink">Add your schedule</h2>
        <p className="max-w-[40ch] text-sm leading-5 text-graphite">Upload a course timetable, a syllabus or an .ics file. Cue plans study time around it.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={onAdd}>Upload schedule</Button>
          <SampleSemesterButton />
        </div>
      </div>
    </div>
  );
}

const Chevron = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Toolbar({ view, date, zone, narrow, go, onToday, onAdd }: { view: CalendarView; date: LocalDate; zone: Zone; narrow: boolean; go: (v: CalendarView, d: LocalDate) => void; onToday: () => void; onAdd: () => void }) {
  const unit = view === "day" ? "day" : view === "week" ? "week" : "month";
  const arrows = (
    <div className="flex items-center gap-0.5">
      {(["Previous", "Next"] as const).map((dir) => (
        <Tooltip key={dir}>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" aria-label={`${dir} ${unit}`} className={narrow ? "size-10" : undefined} onClick={() => go(view, shiftDate(view, date, dir === "Next" ? 1 : -1))}>
                <Chevron d={dir === "Next" ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"} />
              </Button>
            }
          />
          <TooltipContent>
            {dir} {unit}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
  const select = (
    <Select items={VIEWS} value={view} onValueChange={(v) => v && go(v as CalendarView, date)}>
      <SelectTrigger aria-label="View" className={narrow ? "h-10 flex-1 data-[size=default]:h-10" : undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VIEWS.map((v) => (
          <SelectItem key={v.value} value={v.value}>
            {v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const today = (
    <Button variant="secondary" className={narrow ? "h-10" : undefined} onClick={onToday}>
      Today
    </Button>
  );
  const uploadIcon = <Upload data-icon="inline-start" className="size-4" strokeWidth={1.5} absoluteStrokeWidth aria-hidden />;
  const addIcon = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="secondary" size="icon" aria-label="Add schedule" className={cn("rounded-sm", narrow ? "size-10" : "lg:hidden")} onClick={onAdd}>
            {uploadIcon}
          </Button>
        }
      />
      <TooltipContent>Add schedule</TooltipContent>
    </Tooltip>
  );

  if (narrow) {
    return (
      <header className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg leading-6 font-normal tracking-display text-ink">{periodLabel(date, zone, true)}</h1>
          {arrows}
        </div>
        <div className="flex items-center gap-2">
          {select}
          {today}
          {addIcon}
        </div>
      </header>
    );
  }
  return (
    <header className="flex h-8 shrink-0 items-center justify-between gap-6">
      <h1 className="truncate text-lg leading-6 font-normal tracking-display text-ink">{periodLabel(date, zone, false)}</h1>
      <div className="flex items-center gap-3">
        <Button variant="secondary" className="max-lg:hidden" onClick={onAdd}>
          {uploadIcon}
          Add schedule
        </Button>
        {addIcon}
        {select}
        {today}
        {arrows}
      </div>
    </header>
  );
}
