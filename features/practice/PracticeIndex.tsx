"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { db, useLive } from "@/lib/db";
import { gradeOf, type PracticeSet } from "@/lib/domain";
import { href } from "@/lib/routes";
import { CourseChip, ErrorLine, SectionLabel } from "@/components/cue";
import { openGenerated } from "./generation";
import { Intake } from "./Intake";
import { parseGenerateParam } from "./scope";

interface Row {
  set: PracticeSet;
  total: number;
  answered: number;
}

function progress({ total, answered }: Row): string {
  if (answered === 0) return `${total} question${total === 1 ? "" : "s"}`;
  return `${answered} of ${total} answered`;
}

function SetList({ id, label, rows }: { id: string; label: string; rows: readonly Row[] }) {
  const answered = rows.reduce((n, r) => n + r.answered, 0);
  const total = rows.reduce((n, r) => n + r.total, 0);
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-3">
        <SectionLabel id={id} className="leading-[18px]">
          {label}
        </SectionLabel>
        <p className="text-sm leading-[18px] text-graphite">
          {answered} of {total} answered
        </p>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.set.id} className="border-b border-rule">
            <Link
              href={href.practiceSet(row.set.id)}
              aria-label={`${[row.set.courseId, row.set.title].filter(Boolean).join(" · ")}, ${progress(row)}`}
              className="flex min-h-[51px] items-center py-[14px] transition-colors duration-[120ms] ease-standard hover:bg-wash max-md:grid max-md:min-h-11 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-y-1 max-md:py-3"
            >
              <span className="flex w-[84px] shrink-0 max-md:w-auto">{row.set.courseId && <CourseChip code={row.set.courseId} />}</span>
              <span className="min-w-0 flex-1 truncate text-base leading-5 text-ink max-md:col-span-2 max-md:row-start-2 max-md:whitespace-normal">{row.set.title}</span>
              <span className="w-[180px] shrink-0 text-right text-sm leading-[18px] text-graphite tabular-nums max-md:col-start-2 max-md:row-start-1 max-md:w-auto">
                {progress(row)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `/practice?generate=<scope>`: makes the set, starts Cue writing into it, and replaces the URL with the set. */
function GenerateFromUrl() {
  const router = useRouter();
  const param = useSearchParams().get("generate");
  const scope = useMemo(() => (param ? parseGenerateParam(param) : null), [param]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!param || !scope) return;
    openGenerated(param, scope).then(
      (setId) => router.replace(href.practiceSet(setId)),
      () => setFailed(true),
    );
  }, [param, scope, router]);
  if (!param) return null;
  if (!scope) return <ErrorLine title="That link to write questions is broken." detail="Open the study guide section or chat answer again, and choose Quiz me from there." />;
  if (failed) return <ErrorLine title="Couldn't set up those questions." detail="Reload the page to try again." />;
  return (
    <p role="status" className="text-sm leading-5 text-graphite">
      Setting up your questions…
    </p>
  );
}

/** Practice's browse page: papers and Cue's written sets on this device, then the upload box. */
export function PracticeIndex() {
  const rows = useLive(async () => {
    const sets = (await db.practiceSets.toArray()).sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(
      sets.map(async (set): Promise<Row> => {
        const questions = await db.questions.where("setId").equals(set.id).toArray();
        const attempts = new Map((await db.attempts.where("setId").equals(set.id).toArray()).map((a) => [a.questionId, a]));
        return { set, total: questions.length, answered: questions.filter((q) => gradeOf(q, attempts.get(q.id)).status !== "unanswered").length };
      }),
    );
  }, []);
  const papers = rows?.filter((r) => r.set.origin.kind === "paper") ?? [];
  const written = rows?.filter((r) => r.set.origin.kind === "generated") ?? [];
  const left = rows?.reduce((n, r) => n + r.total - r.answered, 0) ?? 0;
  const subline =
    rows === undefined
      ? " "
      : rows.length === 0
        ? "Upload a past paper or a multiple-choice test. Cue turns it into practice, one question at a time, with a worked solution for each."
        : left === 0
          ? `Every question is answered. Upload another paper, or ask Cue to write more inside a set.`
          : `${left} question${left === 1 ? "" : "s"} left to try across ${rows.length} set${rows.length === 1 ? "" : "s"}.`;
  return (
    <div className="flex w-full max-w-[1208px] flex-col gap-10 px-5 pt-6 pb-10 md:pt-[61px] md:pb-12 md:max-lg:px-10 lg:max-xl:pr-10 lg:max-xl:pl-12 xl:max-[1439px]:pr-12 xl:max-[1439px]:pl-16 min-[1440px]:pr-14 min-[1440px]:pl-20 max-md:gap-8">
      <header className="flex max-w-[1072px] flex-col gap-[14px]">
        <h1 className="max-w-[700px] text-2xl font-normal tracking-display text-ink max-md:text-[24px] max-md:leading-[30px]">Practice</h1>
        <p className="min-h-[22px] max-w-[560px] text-base text-graphite">{subline}</p>
        <Suspense fallback={null}>
          <GenerateFromUrl />
        </Suspense>
      </header>
      {papers.length > 0 && (
        <div className="max-w-[1072px]">
          <SetList id="practice-papers" label="Papers" rows={papers} />
        </div>
      )}
      {written.length > 0 && (
        <div className="max-w-[1072px]">
          <SetList id="practice-written" label="Written by Cue" rows={written} />
        </div>
      )}
      <section aria-labelledby="practice-upload" className="flex max-w-[1072px] flex-col gap-3">
        <SectionLabel id="practice-upload">Upload a paper</SectionLabel>
        <Intake />
      </section>
    </div>
  );
}
