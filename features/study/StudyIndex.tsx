"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { db, useLive } from "@/lib/db";
import { sessionElapsedMs, type EpochMs, type Interval, type LocalDate, type StudyBlock, type StudySession, type Zone } from "@/lib/domain";
import { blockReasonText, blockTitle, usePlan } from "@/lib/plan";
import { href } from "@/lib/routes";
import { addDays, fmtDay, fmtDuration, fmtTime, parseDay, useNow } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CourseChip, EmptyState, SectionLabel } from "@/components/cue";
import { SampleSemesterButton } from "@/components/cue/sample";
import { Button, buttonVariants } from "@/components/ui/button";
import { blockFromSession } from "./data";
import { tid } from "./testids";

const DAY_MS = 86_400_000;
const PAST_SHOWN = 8;
const EVERYTHING: Interval = { start: 0 as EpochMs, end: 8_640_000_000_000_000 as EpochMs };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(day: LocalDate, zone: Zone): string {
  const { m, d } = parseDay(day);
  return `${fmtDay(day, zone, "weekdayShort")} ${d} ${MONTHS[m - 1]}`;
}

function dayHeading(day: LocalDate, today: LocalDate, zone: Zone): string {
  const long = fmtDay(day, zone, "long");
  if (day === today) return `Today · ${long}`;
  if (day === addDays(today, 1)) return `Tomorrow · ${long}`;
  return long;
}

/** Today's fixed lanes, so times, chips and trailing text line up across rows. */
function Row({ lead, course, title, titleHref, trailing, action, current }: { lead: string; course: string | null; title: string; titleHref: string; trailing: string; action?: ReactNode; current?: boolean }) {
  return (
    <li
      aria-current={current ? "time" : undefined}
      className="flex flex-wrap items-center gap-x-0 gap-y-1 border-b border-rule py-3.5 max-md:gap-x-3 md:flex-nowrap"
    >
      <span className="w-24 shrink-0 text-sm leading-5 text-ink max-md:w-auto">{lead}</span>
      <span className="w-[84px] shrink-0 max-md:w-auto">{course && <CourseChip code={course} />}</span>
      <Link href={titleHref} className="min-w-0 flex-1 text-sm leading-5 text-pretty text-ink underline-offset-4 hover:underline max-md:basis-full">
        {title}
      </Link>
      <span className="w-[180px] shrink-0 text-right text-sm leading-5 text-graphite max-md:w-auto max-md:text-left">{trailing}</span>
      {action && <span className="flex shrink-0 justify-end md:ml-6 max-md:ml-auto">{action}</span>}
    </li>
  );
}

function Section({ id, label, summary, children }: { id: string; label: string; summary?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex max-w-[1072px] flex-col">
      <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-3">
        <SectionLabel id={id}>{label}</SectionLabel>
        {summary && <p className="text-sm leading-4 text-graphite">{summary}</p>}
      </div>
      {children}
    </section>
  );
}

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** /study (inside the browse shell's main): the next seven days of planned sessions with Start, and the sessions already studied. */
export function StudyIndex() {
  const now = useNow("minute");
  const plan = usePlan(EVERYTHING);
  const sessions = useLive(() => db.sessions.toArray(), []);
  const [allPast, setAllPast] = useState(false);

  const upcoming = useMemo(() => {
    if (!plan) return [];
    return plan.blocks.filter((b) => b.start < now + 7 * DAY_MS && ["upcoming", "now", "inProgress"].includes(plan.status(b))).sort((a, b) => a.start - b.start);
  }, [plan, now]);
  const past = useMemo(
    () => (sessions ?? []).filter((s): s is StudySession & { state: { endedAt: EpochMs } } => s.state.status === "completed" || s.state.status === "ended").sort((a, b) => b.state.endedAt - a.state.endedAt),
    [sessions],
  );

  if (!plan || !sessions || now === 0) return <div data-testid={tid.index} aria-busy="true" className="min-h-40" />;
  const zone = plan.zone;
  const today = zone.dayOf(now);

  if (plan.isEmpty) {
    return (
      <div data-testid={tid.index} className="flex flex-col gap-10 px-5 pt-6 pb-10 md:px-10 md:pt-7">
        <h1 className="text-lg leading-6 font-normal tracking-display text-ink">Study sessions</h1>
        <EmptyState
          title="Add your schedule to plan study sessions."
          detail="Cue fits reviews, mid-week sessions and test prep around your lectures, labs and deadlines."
          actions={
            <>
              <Link href={href.calendar({ add: true })} className={buttonVariants()}>
                Add schedule
              </Link>
              <SampleSemesterButton />
            </>
          }
        />
      </div>
    );
  }

  const byDay = new Map<LocalDate, StudyBlock[]>();
  for (const b of upcoming) byDay.set(zone.dayOf(b.start), [...(byDay.get(zone.dayOf(b.start)) ?? []), b]);
  const upcomingMs = upcoming.reduce((n, b) => n + (b.end - b.start), 0);
  const studiedMs = past.reduce((n, s) => n + sessionElapsedMs(s.state, s.state.endedAt), 0);
  const shownPast = allPast ? past : past.slice(0, PAST_SHOWN);

  return (
    <div data-testid={tid.index} className="flex flex-col gap-10 px-5 pt-6 pb-10 md:px-10 md:pt-7">
      <h1 className="text-lg leading-6 font-normal tracking-display text-ink">Study sessions</h1>

      <Section id="study-upcoming" label="Next 7 days" summary={upcoming.length ? `${count(upcoming.length, "session")} · ${fmtDuration(upcomingMs)}` : undefined}>
        {upcoming.length === 0 ? (
          <p className="py-4 text-sm leading-5 text-graphite">Nothing planned for the next 7 days. Add lectures or deadlines on the calendar and Cue plans around them.</p>
        ) : (
          [...byDay].map(([day, blocks]) => (
            <div key={day} className="flex flex-col">
              <h3 className="pt-5 pb-1 text-sm leading-5 font-medium text-ink">{dayHeading(day, today, zone)}</h3>
              <ul aria-label={dayHeading(day, today, zone)} className="flex flex-col">
                {blocks.map((b) => {
                  const status = plan.status(b);
                  return (
                    <Row
                      key={b.id}
                      current={status === "now" || status === "inProgress"}
                      lead={fmtTime(b.start, zone)}
                      course={b.courseId}
                      title={blockTitle(b, "timeline")}
                      titleHref={href.study(b.id)}
                      trailing={blockReasonText(b, "trailing")}
                      action={
                        status === "inProgress" ? (
                          <Link href={href.study(b.id)} className={cn(buttonVariants({ variant: "default", size: "sm" }), "px-[11px]")}>
                            Resume<span className="sr-only">: {blockTitle(b, "timeline")}</span>
                          </Link>
                        ) : (
                          <Link href={href.study(b.id, { start: true })} className={cn(buttonVariants({ variant: status === "now" ? "default" : "secondary", size: "sm" }), "px-[11px]")}>
                            Start session<span className="sr-only">: {blockTitle(b, "timeline")}</span>
                          </Link>
                        )
                      }
                    />
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </Section>

      <Section id="study-past" label="Past sessions" summary={past.length ? `${count(past.length, "session")} · ${fmtDuration(studiedMs)} studied` : undefined}>
        {past.length === 0 ? (
          <p className="py-4 text-sm leading-5 text-graphite">Sessions you start show up here with the time you studied.</p>
        ) : (
          <>
            <ul aria-label="Past sessions" className="flex flex-col">
              {shownPast.map((s) => {
                const studied = sessionElapsedMs(s.state, s.state.endedAt);
                return (
                  <Row
                    key={s.id}
                    lead={shortDate(zone.dayOf(s.state.startedAt), zone)}
                    course={s.courseId}
                    title={blockTitle(blockFromSession(s), "timeline")}
                    titleHref={href.study(s.id)}
                    trailing={s.state.status === "completed" ? `Done · ${fmtDuration(s.minutes * 60_000)}` : `Ended · ${fmtDuration(studied)} of ${fmtDuration(s.minutes * 60_000)}`}
                  />
                );
              })}
            </ul>
            {past.length > PAST_SHOWN && (
              <div className="pt-4">
                <Button variant="secondary" size="sm" className="px-[11px]" aria-expanded={allPast} onClick={() => setAllPast((v) => !v)}>
                  {allPast ? "Show fewer" : `Show all ${past.length}`}
                </Button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
