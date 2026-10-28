"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { errorCopy } from "@/lib/ai";
import { threadKey, useChat } from "@/lib/chat";
import type { CalendarEvent, EpochMs, Lecture, RelatedLink, Segment } from "@/lib/domain";
import { planActions } from "@/lib/plan";
import { href } from "@/lib/routes";
import { fmtStamp } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ErrorLine, SectionLabel } from "@/components/cue";
import { ChatThread, Composer } from "@/components/cue/chat";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { lectureTitle, orderLinks, slotText } from "./format";
import { Chevron, Columns, composerClass, RelatedList, StatusPill, Toolbar, TranscriptRow } from "./parts";
import { recorder, useRecorder } from "./recorder";
import { tid } from "./testids";

/** `50:00 · Tue 9–10am`: how long was captured, and when. */
function whenText(lecture: Lecture, event: CalendarEvent | null): string {
  const captured = lecture.state.status === "saved" ? lecture.state.capturedMs : 0;
  const span = event ?? (lecture.state.status === "saved" ? { start: (lecture.state.savedAt - captured) as EpochMs, end: lecture.state.savedAt } : null);
  if (!span) return fmtStamp(captured);
  return `${fmtStamp(captured)} · ${slotText(span)}`;
}

function Section({ id, title, children, className }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3", className)}>
      <div className="flex h-7 shrink-0 items-center px-4 max-md:px-3">
        <SectionLabel id={id}>{title}</SectionLabel>
      </div>
      {children}
    </section>
  );
}

export function SavedNotes({
  lecture,
  segments,
  links,
  event,
  focusAtMs,
  onContinue,
}: {
  lecture: Lecture;
  segments: readonly Segment[];
  links: readonly RelatedLink[];
  event: CalendarEvent | null;
  focusAtMs: number | null;
  onContinue: () => void;
}) {
  const router = useRouter();
  const rec = useRecorder();
  const job = rec.notes[lecture.id];
  const wide = useMediaQuery("(min-width: 768px)", true);
  const chat = useChat({ thread: threadKey.lecture(lecture.id), scope: { kind: "lecture", lectureId: lecture.id } });
  const asked = chat.messages.filter((m) => m.role === "user").length;
  const ordered = useMemo(() => [...segments].sort((a, b) => a.atMs - b.atMs || a.seq - b.seq), [segments]);
  const hints = ordered.filter((s) => s.flag);
  const [open, setOpen] = useState(focusAtMs !== null);
  const [query, setQuery] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const fullList = useRef<HTMLOListElement>(null);
  const [scrollTo, setScrollTo] = useState<number | null>(focusAtMs);

  useEffect(() => {
    if (!lecture.notes && !job) void recorder.ensureNotes(lecture.id);
  }, [lecture.notes, lecture.id, job]);

  useEffect(() => {
    if (scrollTo === null || !open) return;
    const target = [...ordered].reverse().find((s) => s.atMs <= scrollTo + 999) ?? ordered[0];
    const el = target ? fullList.current?.children[ordered.indexOf(target)] : undefined;
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    setScrollTo(null);
  }, [scrollTo, open, ordered]);

  async function reviewNow() {
    setReviewing(true);
    try {
      const blockId = await planActions.reviewNow(lecture.id, Date.now() as EpochMs);
      router.push(href.study(blockId, { start: true }));
    } finally {
      setReviewing(false);
    }
  }

  const showLine = (atMs: number) => {
    setOpen(true);
    setQuery("");
    setScrollTo(atMs);
    router.replace(href.lecture(lecture.id, { atMs }), { scroll: false });
  };

  const needle = query.trim().toLowerCase();
  const shown = needle ? ordered.filter((s) => (s.text ?? s.raw).toLowerCase().includes(needle)) : ordered;

  const summary = lecture.notes ? (
    <p className="max-w-[64ch] px-4 text-sm leading-5 text-ink max-md:px-3">{lecture.notes.summary}</p>
  ) : job?.status === "failed" ? (
    <ErrorLine
      className="px-4"
      title={errorCopy(job.error).title}
      detail={job.error.kind === "budget" ? "The transcript and links are saved; the summary waits for the cap to rise." : "The transcript and links are saved."}
      action={
        errorCopy(job.error).retry ? (
          <Button variant="secondary" size="sm" onClick={() => void recorder.ensureNotes(lecture.id)}>
            Write the summary again
          </Button>
        ) : undefined
      }
    />
  ) : (
    <div aria-busy="true" className="flex flex-col px-4 text-sm leading-5 text-graphite">
      {[0, 1, 2].map((i) => (
        <span key={i} className="animate-breathe" style={{ animationDelay: `${i * 160}ms` }}>
          Writing summary…
        </span>
      ))}
    </div>
  );

  const left = (
    <section aria-label="Notes" className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-3">
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain pb-1">
        <Section id="notes-summary" title="Summary">
          {summary}
        </Section>

        <Section id="notes-hints" title={`Exam hints · ${hints.length}`}>
          {hints.length ? (
            <ul className="flex flex-col gap-1.5">
              {hints.map((s) => (
                <TranscriptRow key={s.seq} segment={s} labelStyle="saved" />
              ))}
            </ul>
          ) : (
            <p className="px-4 text-sm leading-5 text-graphite">Cue flagged no exam hints in this lecture.</p>
          )}
        </Section>

        <Section id="notes-points" title="Key points">
          {lecture.notes ? (
            lecture.notes.keyPoints.length ? (
              <ol className="flex flex-col gap-1.5">
                {lecture.notes.keyPoints.map((k) => (
                  <li key={`${k.atMs}-${k.text}`} className="flex gap-4 px-4 py-1.5 max-md:gap-3 max-md:px-3">
                    <button
                      type="button"
                      onClick={() => showLine(k.atMs)}
                      aria-label={`${fmtStamp(k.atMs)}, show this moment in the full transcript`}
                      className="h-5 w-11 shrink-0 cursor-pointer self-start rounded-xs text-left text-sm leading-5 text-graphite tabular-nums underline-offset-4 hover:text-ink hover:underline"
                    >
                      <time dateTime={`PT${Math.floor(k.atMs / 60_000)}M${Math.floor(k.atMs / 1000) % 60}S`}>{fmtStamp(k.atMs)}</time>
                    </button>
                    <p className="min-w-0 flex-1 text-sm leading-5 text-ink">{k.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 text-sm leading-5 text-graphite">No key points: the recording has no transcript.</p>
            )
          ) : (
            <p className="px-4 text-sm leading-5 text-graphite">Key points appear with the summary.</p>
          )}
        </Section>

        {asked > 0 && (
          <Section id="notes-questions" title={`Your questions · ${asked}`}>
            <div className="px-4 max-md:px-3">
              <ChatThread chat={chat} />
            </div>
          </Section>
        )}

        <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-3">
          <h2 className="flex h-7 shrink-0 items-center px-4 max-md:px-3">
            <CollapsibleTrigger className="group/trigger flex cursor-pointer items-center gap-1.5 rounded-xs text-sm leading-4 font-normal tracking-caps text-graphite uppercase hover:text-ink">
              {`Full transcript · ${ordered.length} lines`}
              <Chevron className="transition-transform duration-150 ease-standard group-data-[panel-open]/trigger:rotate-90" />
            </CollapsibleTrigger>
          </h2>
          <CollapsibleContent className="flex flex-col gap-3">
            <div className="px-4 max-md:px-3">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search transcript" aria-label="Search transcript" className="h-8 max-w-[360px] rounded-sm px-3 py-1.5" />
            </div>
            {shown.length ? (
              <ol ref={fullList} className="flex flex-col gap-1.5">
                {shown.map((s) => (
                  <TranscriptRow key={s.seq} segment={s} labelStyle="saved" />
                ))}
              </ol>
            ) : (
              <p className="px-4 text-sm leading-5 text-graphite">No line matches “{query.trim()}”.</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
      <Composer chat={chat} layout="inline" label="Ask about this lecture" placeholder="Ask about this lecture…" scopeNote={wide ? "Uses the whole lecture" : undefined} className={cn("shrink-0", composerClass(chat))} />
    </section>
  );

  return (
    <main data-testid={tid.main} className="flex min-h-0 flex-1 flex-col gap-6 px-10 pt-7 pb-8 max-xl:px-8 max-md:gap-4 max-md:px-4 max-md:pt-4 max-md:pb-[max(16px,env(safe-area-inset-bottom))]">
      <Toolbar title={lectureTitle(lecture)}>
        <StatusPill kind="saved" label="Saved" />
        <span className="text-sm leading-4 text-graphite tabular-nums">{wide ? whenText(lecture, event) : fmtStamp(lecture.state.status === "saved" ? lecture.state.capturedMs : 0)}</span>
        <div className="flex items-center gap-3 max-md:ml-auto">
          {wide ? (
            <Button variant="secondary" onClick={onContinue}>
              Continue recording
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="secondary" size="icon" aria-label="More actions" className="rounded-sm" />}>
                <MoreHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onContinue}>Continue recording</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={() => void reviewNow()} disabled={reviewing}>
            Review now
          </Button>
        </div>
      </Toolbar>
      <Columns main={left} mainLabel="Notes" related={<RelatedList links={orderLinks(links, "saved")} style="saved" />} relatedCount={links.length} />
    </main>
  );
}
