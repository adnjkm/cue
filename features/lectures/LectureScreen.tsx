"use client";

import Link from "next/link";
import { db, useLive } from "@/lib/db";
import type { EpochMs, LectureId } from "@/lib/domain";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { href } from "@/lib/routes";
import { EmptyState } from "@/components/cue";
import { buttonVariants } from "@/components/ui/button";
import { draftLecture, lectureSegments } from "./data";
import { chooseEngine } from "./engine";
import { NoteTaker } from "./NoteTaker";
import { recorder, useRecorder } from "./recorder";
import { SavedNotes } from "./SavedNotes";
import { tid } from "./testids";

/**
 * `/lectures/[lectureId]`: the note taker while a lecture is ready, recording or paused, saved notes once
 * saved. A `lec.<eventId>` id with no row yet shows the ready state from its calendar event.
 */
export function LectureScreen({ id, focusAtMs }: { id: LectureId | null; focusAtMs: number | null }) {
  const data = useLive(async () => {
    if (!id) return { lecture: null } as const;
    const lecture = (await db.lectures.get(id)) ?? (await draftLecture(id, Date.now() as EpochMs));
    if (!lecture) return { lecture: null } as const;
    const [segments, links, event] = await Promise.all([lectureSegments(id), db.links.where("lectureId").equals(id).toArray(), lecture.eventId ? db.events.get(lecture.eventId) : undefined]);
    return { lecture, segments, links, event: event ?? null };
  }, [id]);
  const prefs = usePrefs("lectures");
  const base = usePrefs("foundation");
  const rec = useRecorder();

  if (!data || !prefs || !base) return <main data-testid={tid.main} aria-busy="true" className="flex-1" />;
  if (!data.lecture) {
    return (
      <main data-testid={tid.main} className="flex flex-1 flex-col px-10 pt-7 pb-8 max-md:px-4 max-md:pt-4">
        <h1 className="sr-only">Lecture not found</h1>
        <EmptyState
          title="This lecture isn’t on this device."
          detail="Lecture notes live in the browser that recorded them. Open Lecture notes to find your lectures or record a new one."
          actions={
            <Link href={href.lectures()} className={buttonVariants()}>
              Open lecture notes
            </Link>
          }
        />
      </main>
    );
  }

  const { lecture, segments, links, event } = data;
  const sampleLoaded = base.sample !== undefined;
  const saving = rec.lectureId === lecture.id && rec.phase.kind === "stopping" && rec.phase.to === "saved";

  if (lecture.state.status === "saved" && !saving) {
    const continueRecording = async () => {
      const choice = chooseEngine(prefs, sampleLoaded);
      if (choice.engine === "parakeet" && prefs.parakeetConsentAt === undefined) await setPrefs("lectures", { engine: "parakeet", parakeetConsentAt: Date.now() as EpochMs });
      await recorder.start(lecture.id, choice.engine);
    };
    return <SavedNotes lecture={lecture} segments={segments} links={links} event={event} focusAtMs={focusAtMs} onContinue={() => void continueRecording()} />;
  }
  return <NoteTaker lecture={lecture} segments={segments} links={links} event={event} prefs={prefs} sampleLoaded={sampleLoaded} focusAtMs={focusAtMs} />;
}
