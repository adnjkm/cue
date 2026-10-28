"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db, useLive } from "@/lib/db";
import { gradeOf } from "@/lib/domain";
import { href } from "@/lib/routes";
import { SectionLabel } from "@/components/cue";
import { Intake } from "./Intake";

/** Practice's browse page: every paper and written set on this device, newest first, and the upload box. */
export function PracticeIndex() {
  const sets = useLive(async () => {
    const all = await db.practiceSets.orderBy("id").toArray();
    return Promise.all(
      all
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (set) => {
          const questions = await db.questions.where("setId").equals(set.id).toArray();
          const attempts = new Map((await db.attempts.where("setId").equals(set.id).toArray()).map((a) => [a.questionId, a]));
          const answered = questions.filter((q) => gradeOf(q, attempts.get(q.id)).status === "answered").length;
          return { set, total: questions.length, answered };
        }),
    );
  }, []);
  return (
    <main className="flex flex-col gap-10 px-5 pt-6 pb-10 md:px-10 md:pt-7">
      <h1 className="text-lg leading-6 font-normal tracking-display text-ink">Practice</h1>
      {sets && sets.length > 0 && (
        <section aria-labelledby="practice-papers" className="flex max-w-[720px] flex-col gap-3">
          <SectionLabel id="practice-papers">Papers</SectionLabel>
          <ul className="flex flex-col gap-2">
            {sets.map(({ set, total, answered }) => (
              <li key={set.id}>
                <Link
                  href={href.practiceSet(set.id)}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border px-4 py-3 transition-colors duration-[120ms] ease-standard hover:bg-wash"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm leading-5 font-medium text-ink">{[set.courseId, set.title].filter(Boolean).join(" · ")}</span>
                    <span className="text-sm leading-4 text-graphite">
                      {total} questions · {answered} answered{set.origin.kind === "generated" ? " · written by Cue" : ""}
                    </span>
                  </span>
                  <ChevronRight size={16} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-graphite" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="practice-upload" className="flex flex-col gap-3">
        <SectionLabel id="practice-upload">Upload a paper</SectionLabel>
        <Intake />
      </section>
    </main>
  );
}
