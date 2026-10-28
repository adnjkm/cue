"use client";

import { useRouter } from "next/navigation";
import { usePlan } from "@/lib/plan";
import { href } from "@/lib/routes";
import { useNow } from "@/lib/time";
import { SampleSemesterButton } from "@/components/cue/sample";
import { Button } from "@/components/ui/button";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** Stub until the Today workstream lands: the first-run state and a rule-based headline. */
export function TodayPage() {
  const router = useRouter();
  const now = useNow("minute");
  const day = usePlan({ day: now });
  if (!day || now === 0) return <main aria-busy="true" className="min-h-40" />;
  if (day.isEmpty) {
    return (
      <main className="flex flex-col gap-6 px-5 pt-6 pb-10 md:pt-[61px] md:pr-14 md:pb-12 md:pl-20">
        <h1 className="max-w-[700px] text-2xl font-normal tracking-display text-ink max-md:text-[24px] max-md:leading-[30px]">Add your schedule to plan today.</h1>
        <p className="max-w-[560px] text-base text-graphite">Cue plans study sessions around your lectures, labs and deadlines.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push(href.calendar({ add: true }))}>Upload calendar</Button>
          <SampleSemesterButton />
        </div>
      </main>
    );
  }
  const sessions = day.blocks.filter((b) => day.status(b) !== "skipped");
  const next = sessions.find((b) => ["upcoming", "now", "inProgress"].includes(day.status(b)));
  const headline = next
    ? `${WORDS[sessions.length] ?? sessions.length} session${sessions.length === 1 ? "" : "s"} today. Start with ${next.topic.short.toLowerCase()}.`
    : sessions.length
      ? "Today's sessions are done."
      : "Nothing planned today.";
  return (
    <main className="flex flex-col gap-6 px-5 pt-6 pb-10 md:pt-[61px] md:pr-14 md:pb-12 md:pl-20">
      <h1 className="max-w-[700px] text-2xl font-normal tracking-display text-ink max-md:text-[24px] max-md:leading-[30px]">{headline}</h1>
    </main>
  );
}
