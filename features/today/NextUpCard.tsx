"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { CourseChip } from "@/components/cue";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BlockMaterials, BlockStatus, EpochMs, Material, StudyBlock, StudySession, ViewerTab, Zone } from "@/lib/domain";
import { blockTitle } from "@/lib/plan";
import { href } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { cardMeta } from "./brief";
import { SessionLeft } from "./Timeline";
import { tid } from "./testids";

const TAB: Partial<Record<Material["kind"], ViewerTab>> = { slides: "slides", textbook: "textbook" };

interface Chip {
  key: string;
  label: string;
  href: string;
}

/** Slides first, then the transcript, then handouts and the rest: the order Paper draws. */
function chipsFor(block: StudyBlock, materials: BlockMaterials, start: boolean): Chip[] {
  const study = (tab: ViewerTab) => (start ? href.study(block.id, { start: true, tab }) : href.study(block.id, { tab }));
  const chip = (m: BlockMaterials["materials"][number]): Chip => ({
    key: m.materialId,
    label: m.label,
    href: study(m.ref.kind === "page" ? (TAB[m.ref.doc.kind] ?? "handout") : "handout"),
  });
  const isSlides = (m: BlockMaterials["materials"][number]) => m.ref.kind === "page" && m.ref.doc.kind === "slides";
  return [
    ...materials.materials.filter(isSlides).map(chip),
    ...(materials.transcript ? [{ key: "transcript", label: materials.transcript.label, href: study("transcript") }] : []),
    ...materials.materials.filter((m) => !isSlides(m)).map(chip),
  ];
}

/** 44px touch targets on phones without changing the 28px chips Paper draws. */
const chipHit = "relative after:absolute after:-inset-y-2 after:inset-x-0 md:after:hidden";
const press = "transition-[color,background-color,transform] motion-safe:active:scale-[0.98]";

/** The next session with its materials and the one primary action on the screen. */
export function NextUpCard({
  block,
  status,
  materials,
  session,
  zone,
  now,
}: {
  block: StudyBlock;
  status: BlockStatus;
  materials: BlockMaterials | undefined;
  session: StudySession | undefined;
  zone: Zone;
  now: EpochMs;
}) {
  const titleId = useId();
  const inProgress = status === "inProgress";
  const otherDay = zone.dayOf(block.start) !== zone.dayOf(now);
  const chips = materials ? chipsFor(block, materials, inProgress) : [];
  const practice = materials?.practice;
  const practiceHref = practice?.setId ? href.practiceSet(practice.setId, { topic: practice.topic }) : href.practice();
  return (
    <Card data-testid={tid.nextUp} aria-labelledby={titleId} role="group" className="gap-0 py-0">
      <div className="flex flex-1 flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between md:gap-8 md:px-7 md:py-6">
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {block.courseId && <CourseChip code={block.courseId} />}
            <p className="text-sm leading-[18px] text-graphite">
              {inProgress && session ? (
                <>
                  In progress · <SessionLeft session={session} />
                </>
              ) : (
                cardMeta(block, status, zone, now)
              )}
            </p>
          </div>
          <h2 id={titleId} className="text-lg leading-6 font-normal tracking-[-0.01em] text-ink">
            {blockTitle(block, "card")}
          </h2>
          {(chips.length > 0 || (practice && practice.count > 0)) && (
            <ul aria-label="Materials" className="flex flex-wrap gap-2 max-md:gap-y-4">
              {chips.map((c) => (
                <li key={c.key} className="flex">
                  <Link href={c.href} className={cn(buttonVariants({ variant: "outline", size: "chip" }), press, chipHit)}>
                    {c.label}
                  </Link>
                </li>
              ))}
              {practice && practice.count > 0 && (
                <li className="flex">
                  <Link
                    href={practiceHref}
                    className={cn(buttonVariants({ variant: "ghost", size: "chip" }), "px-[9px] text-graphite hover:text-ink", press, chipHit)}
                  >
                    + {practice.count} practice {practice.count === 1 ? "Q" : "Qs"}
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
        <Link
          href={href.study(block.id, { start: true })}
          className={cn(buttonVariants(), "font-medium max-md:h-11 max-md:w-full", press)}
        >
          {inProgress ? "Resume session" : otherDay ? "Start early" : "Start session"}
          <ArrowRight size={12} strokeWidth={2.5} aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
