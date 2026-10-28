"use client";

import Link from "next/link";
import { useState } from "react";
import { db, useLive } from "@/lib/db";
import { ids, lectureElapsedMs, lectureLive, type CalendarEvent, type CourseId, type EpochMs, type Lecture } from "@/lib/domain";
import { href } from "@/lib/routes";
import { currentZone, fmtRange, fmtStamp, useNow, zoneOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { EmptyState, SectionLabel } from "@/components/cue";
import { SampleSemesterButton } from "@/components/cue/sample";
import { Button } from "@/components/ui/button";
import { lectureTitle } from "./format";
import { Chevron } from "./parts";
import { RecordLectureDialog } from "./RecordLectureDialog";
import { tid } from "./testids";

type LectureEvent = Extract<CalendarEvent, { kind: "lecture" }>;

interface Row {
  key: string;
  href: string;
  at: number;
  day: string;
  title: string;
  trailing: string;
  live: boolean;
}

function dayText(t: number, zoneId: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: zoneId }).format(t).replace(",", "");
}

function lectureRow(l: Lecture, event: LectureEvent | undefined, hints: number, now: EpochMs, zoneId: string): Row {
  const live = lectureLive(l, now);
  const at = event?.start ?? (l.state.status === "saved" ? l.state.savedAt - l.state.capturedMs : l.updatedAt);
  const hintText = hints ? ` · ${hints} exam ${hints === 1 ? "hint" : "hints"}` : "";
  const trailing =
    live === "recording"
      ? "Recording"
      : live === "interrupted"
        ? `Stopped at ${fmtStamp(lectureElapsedMs(l, now))}`
        : live === "paused"
          ? `Paused at ${fmtStamp(lectureElapsedMs(l, now))}`
          : live === "saved"
            ? `Saved${hintText}`
            : "Ready to record";
  const topic = l.topic?.full;
  const title = l.number !== undefined ? `Lecture ${l.number}${topic ? ` — ${topic}` : ""}` : (topic ?? lectureTitle(l).split(" · ")[1]);
  return { key: l.id, href: href.lecture(l.id), at, day: dayText(at, zoneId), title, trailing, live: live === "recording" };
}

/** `/lectures`: every recorded lecture by course, newest first, plus each course's next lecture to record. */
export function LecturesIndex() {
  const now = useNow("minute");
  const [recording, setRecording] = useState(false);
  const data = useLive(async () => {
    const [lectures, courses, events, flagged] = await Promise.all([
      db.lectures.toArray(),
      db.courses.toArray(),
      db.events.where("kind").equals("lecture").toArray() as Promise<LectureEvent[]>,
      db.segments.filter((s) => s.flag !== undefined).toArray(),
    ]);
    const hints = new Map<string, number>();
    for (const s of flagged) hints.set(s.lectureId, (hints.get(s.lectureId) ?? 0) + 1);
    return { lectures, courses: courses.sort((a, b) => a.id.localeCompare(b.id)), events, hints };
  }, []);

  if (!data) return <div data-testid={tid.index} aria-busy="true" className="flex-1" />;
  const zone = zoneOf(currentZone());
  const eventsById = new Map(data.events.map((e) => [e.id, e]));
  const lecturesByEvent = new Set(data.lectures.flatMap((l) => (l.eventId ? [l.eventId] : [])));
  const happeningNow = data.events.find((e) => e.start - 10 * 60_000 <= now && now < e.end);

  const groups = data.courses
    .map((course) => {
      const rows = data.lectures
        .filter((l) => l.courseId === course.id)
        .map((l) => lectureRow(l, l.eventId ? eventsById.get(l.eventId) : undefined, data.hints.get(l.id) ?? 0, now, zone.id))
        .sort((a, b) => b.at - a.at);
      const next = data.events.filter((e) => e.courseId === course.id && e.end > now && !lecturesByEvent.has(e.id)).sort((a, b) => a.start - b.start)[0];
      const upcoming: Row | null = next
        ? {
            key: next.id,
            href: href.lecture(ids.lectureForEvent(next.id)),
            at: next.start,
            day: dayText(next.start, zone.id),
            title: next.number !== undefined ? `Lecture ${next.number}${next.topic ? ` — ${next.topic.full}` : ""}` : next.topic?.full ? `Lecture — ${next.topic.full}` : "Next lecture",
            trailing: next.start <= now ? `Now · ${fmtRange(next, zone)} · Ready to record` : `${fmtRange(next, zone)} · Ready to record`,
            live: false,
          }
        : null;
      return { course, rows: upcoming ? [upcoming, ...rows] : rows };
    })
    .filter((g) => g.rows.length > 0);

  return (
    <div data-testid={tid.index} className="flex max-w-[1152px] flex-col gap-10 px-5 pt-6 pb-10 md:px-10 md:pt-7">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg leading-6 font-normal tracking-display text-ink">Lecture notes</h1>
        {data.courses.length > 0 && <Button onClick={() => setRecording(true)}>Record a lecture</Button>}
      </header>

      {groups.length === 0 ? (
        <EmptyState
          title="No lectures yet."
          detail="Record a lecture and Cue writes a live transcript, flags exam hints and links the coursework it mentions. Add your schedule and every lecture shows up here, ready to record."
          actions={
            <>
              <Button onClick={() => setRecording(true)}>Record a lecture</Button>
              <SampleSemesterButton />
            </>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map(({ course, rows }) => (
            <section key={course.id} aria-labelledby={`course-${course.id}`} className="flex flex-col">
              <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-3">
                <SectionLabel id={`course-${course.id}`} className="leading-[18px]">
                  {course.title ? `${course.code} · ${course.title}` : course.code}
                </SectionLabel>
                <span className="shrink-0 text-sm leading-[18px] whitespace-nowrap text-graphite">{`${rows.filter((r) => !r.trailing.endsWith("Ready to record")).length} recorded`}</span>
              </div>
              <ul aria-label={course.code}>
                {rows.map((r) => (
                  <li key={r.key} className="border-b border-rule">
                    <Link
                      href={r.href}
                      className="group/row flex items-center gap-4 py-3.5 transition-colors duration-[120ms] ease-standard hover:bg-wash max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-1 md:-mx-3 md:px-3 md:rounded-sm"
                    >
                      <span className="w-24 shrink-0 text-sm leading-5 text-graphite tabular-nums">{r.day}</span>
                      <span className="min-w-0 flex-1 truncate text-base leading-5 text-ink max-md:basis-full max-md:order-first">{r.title}</span>
                      <span className={cn("flex shrink-0 items-center gap-1.5 text-sm leading-5 text-graphite", r.live && "font-medium text-ink")}>
                        {r.live && <span aria-hidden="true" className="size-2 rounded-full bg-ink" />}
                        {r.trailing}
                      </span>
                      <Chevron className="text-graphite transition-transform duration-[120ms] ease-standard group-hover/row:translate-x-0.5 max-md:hidden" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {recording && <RecordLectureDialog open={recording} onOpenChange={setRecording} courses={data.courses} suggested={(happeningNow?.courseId as CourseId | undefined) ?? null} />}
    </div>
  );
}
