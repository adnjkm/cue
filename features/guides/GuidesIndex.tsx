"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { db, useLive } from "@/lib/db";
import { href } from "@/lib/routes";
import { EmptyState } from "@/components/cue";
import { SampleSemesterButton } from "@/components/cue/sample";
import { buttonVariants } from "@/components/ui/button";
import { guidesLanding } from "./model";
import { tid } from "./testids";

/** /guides: the most recently read guide, else the first course with one, else the first course. */
export function GuidesIndex() {
  const router = useRouter();
  const data = useLive(async () => ({ courses: await db.courses.toArray(), guides: await db.guides.toArray() }), []);
  const landing = data ? guidesLanding(data.courses, data.guides) : undefined;
  const target = landing ? href.guide(landing.courseId, landing.sectionId) : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  return (
    <div data-testid={tid.main} aria-busy={data === undefined || target !== null || undefined} className="flex flex-col gap-6 px-4 pt-6 pb-12 md:px-10 md:pt-7">
      <h1 className="text-lg leading-6 font-normal tracking-display text-ink">Study guides</h1>
      {data && !target && (
        <EmptyState
          title="No courses yet."
          detail="Add your schedule or load the sample semester. Cue writes a study guide for each course from its slides, notes and lectures."
          actions={
            <>
              <Link href={href.calendar({ add: true })} className={buttonVariants()}>
                Upload calendar
              </Link>
              <SampleSemesterButton />
            </>
          }
        />
      )}
    </div>
  );
}
