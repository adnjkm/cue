"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { errorCopy } from "@/lib/ai";
import { useChat, threadKey } from "@/lib/chat";
import { ids, type AskMode, type BlockId, type EpochMs, type PrefsByOwner, type SessionPlan, type SourceRef, type StudyBlock, type StudySession, type ViewerTab, type Zone } from "@/lib/domain";
import { usePrefs, useShortcuts } from "@/lib/prefs";
import { href } from "@/lib/routes";
import { fmtDay, fmtRange, useNow } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AddMaterialDialog, BudgetNotice, EmptyState, ErrorLine, SectionLabel } from "@/components/cue";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AskPanel } from "./AskPanel";
import { loadPlan, loadSources, sessionActions, usePlanJob, useReviewLecture, useSessionRow, useSourcesJob, useStudyBlock } from "./data";
import {
  ADVANCE_LABEL,
  advanceKind,
  askCopy,
  defaultViewer,
  doneSteps,
  endSummary,
  finishedSummary,
  isLive,
  showRef,
  stepOverMs,
  stepRows,
  timerView,
  viewerForStep,
  type Advance,
  type StepRow,
  type ViewerState,
} from "./model";
import { CheckRow, MomentCard, NextStepButton, PlanDrawer, PlanList, PlanSkeleton, PlanStrip, SessionTrack } from "./parts";
import { tid } from "./testids";
import { MaterialViewer } from "./Viewer";

type StudyPrefs = PrefsByOwner["study"];

const ASK_SCOPE = "Answers cite the slides, transcript and notes for this session.";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** The composer when it can take a question, so an opening chat lands the cursor there. */
function composerIn(el: HTMLElement | null): HTMLElement | true {
  const box = el?.querySelector("textarea");
  return box && !box.disabled ? box : true;
}

function titleOf(block: StudyBlock): string {
  return [block.courseId, block.topic.full].filter(Boolean).join(" · ");
}

/** Ticks by itself for the same reason as TickingRows. */
function LiveControls({ session, prefs, onTogglePause, onEnd }: { session: StudySession; prefs: StudyPrefs; onTogglePause: () => void; onEnd: () => void }) {
  const now = useNow("second");
  const view = timerView(session, now, prefs.pomodoro);
  const paused = session.state.status === "paused";
  return (
    <>
      <div className="order-last flex w-full items-center gap-3 lg:order-none lg:w-auto">
        <SessionTrack fraction={view.fraction} label="Session time" valueText={view.valueText} className="min-w-0 flex-1 lg:w-40 lg:flex-none" />
        <span aria-live="off" className={cn("w-max text-sm leading-4 tabular-nums", view.over ? "font-medium text-ink" : "text-graphite")}>
          {view.text}
        </span>
        <span aria-live="polite" className="sr-only">
          {view.milestone}
        </span>
      </div>
      <Button variant="secondary" aria-keyshortcuts="P" onClick={onTogglePause}>
        {paused ? "Resume" : "Pause"}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="secondary" />}>End session</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>{endSummary(session, now)}. Cue keeps the steps you finished and this conversation.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep studying</AlertDialogCancel>
            <AlertDialogAction onClick={onEnd}>End session</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type PlanAt = { step: number | null; stepsDone: readonly number[] };

/** Ticks by itself, so "Over by 1 min" lands on time without re-rendering the chat every second. */
function TickingRows({ plan, at, live, prefs, children }: { plan: SessionPlan; at: PlanAt; live: StudySession | null; prefs: StudyPrefs; children: (rows: StepRow[]) => ReactNode }) {
  const now = useNow("second");
  return children(stepRows(plan, at, live ? stepOverMs(live, now, prefs.pomodoro) : 0));
}

function NextStep({ live, prefs, onAdvance }: { live: StudySession; prefs: StudyPrefs; onAdvance: (kind: Advance) => void }) {
  const kind = advanceKind(live, useNow("second"), prefs.pomodoro);
  return <NextStepButton label={ADVANCE_LABEL[kind]} onClick={() => onAdvance(kind)} />;
}

function SessionScreen({
  block,
  zone,
  row,
  prefs,
  lectureNumber,
  start,
  tab,
}: {
  block: StudyBlock;
  zone: Zone;
  row: StudySession | null;
  prefs: StudyPrefs;
  lectureNumber: number | null;
  start: boolean;
  tab?: ViewerTab;
}) {
  const router = useRouter();
  const shortcuts = useShortcuts();
  const rootRef = useRef<HTMLElement>(null);
  const planLabelId = useId();
  const sourcesJob = useSourcesJob(block.id);
  const planJob = usePlanJob(block.id);
  const sources = sourcesJob?.status === "ready" ? sourcesJob.value : null;
  const plan = row?.plan ?? (planJob?.status === "ready" ? planJob.value : undefined);
  const mode = !row ? "preview" : isLive(row) ? "live" : "finished";
  const live = mode === "live" ? row : null;
  const needPlan = !row?.plan;

  useEffect(() => {
    loadSources(block).catch(() => undefined);
  }, [block]);
  useEffect(() => {
    if (needPlan) loadPlan(block, prefs.pomodoro);
  }, [needPlan, block, prefs.pomodoro]);

  const lectureId = block.anchor.kind === "review" ? ids.lectureForEvent(block.anchor.lecture) : sources?.lecture?.id;
  const startSession = async () => {
    await sessionActions.start(block, { ...(lectureId ? { lectureId } : {}), ...(plan ? { plan } : {}), mode: prefs.defaultMode });
  };
  const handledStart = useRef(false);
  useEffect(() => {
    if (!start || handledStart.current) return;
    handledStart.current = true;
    void (async () => {
      if (!row) await startSession();
      router.replace(href.study(block.id, tab ? { tab } : undefined), { scroll: false });
    })();
  });

  useEffect(() => {
    if (mode === "live") rootRef.current?.focus({ preventScroll: true });
  }, [mode]);

  const [localStep, setLocalStep] = useState(0);
  const stepIndex = live ? live.step : mode === "finished" ? null : Math.min(localStep, Math.max(0, (plan?.steps.length ?? 1) - 1));
  const at: PlanAt = { step: stepIndex, stepsDone: doneSteps(row, plan) };
  const step = stepIndex === null ? undefined : plan?.steps[stepIndex];

  const [override, setOverride] = useState<ViewerState | null>(null);
  const viewer = override ?? (sources ? defaultViewer(sources, plan, stepIndex ?? 0, { ...(tab ? { tab } : {}), ...(row ? { saved: row.viewer } : {}) }) : null);
  const setViewer = (v: ViewerState) => {
    setOverride(v);
    if (live) void sessionActions.setViewer(block.id, v);
  };

  /** Below 1024 the chat lives in an overlay: a right Sheet from 768, a bottom Drawer below that. */
  const [ask, setAsk] = useState<"sheet" | "drawer" | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const openSource = (ref: SourceRef): boolean => {
    const next = viewer && showRef(viewer, ref);
    if (!next) return false;
    setViewer(next);
    setAsk(null);
    return true;
  };

  const goto = (i: number) => {
    const v = viewer ? viewerForStep(viewer, plan?.steps[i]) : null;
    if (v) setOverride(v);
    if (live) void sessionActions.gotoStep(block.id, i, v ?? undefined);
    else if (mode === "preview") setLocalStep(i);
  };
  const advance = async (kind: Advance) => {
    if (!live || !plan) return;
    const v = kind === "next" && viewer ? viewerForStep(viewer, plan.steps[live.step + 1]) : null;
    if (v) setOverride(v);
    const after = await sessionActions.advance(block.id, kind, v ?? undefined);
    if (after && !isLive(after)) router.push(href.today());
  };
  const togglePause = () => void (live?.state.status === "paused" ? sessionActions.resume(block.id) : sessionActions.pause(block.id));
  const end = async () => {
    await sessionActions.end(block.id);
    router.push(href.today());
  };

  const focusRef = viewer ? viewer[viewer.tab] : undefined;
  const chat = useChat({
    thread: threadKey.session(block.id),
    scope: { kind: "study", courseId: block.courseId, ...(lectureId ? { lectureId } : {}), ...(focusRef ? { focus: focusRef } : {}) },
    defaultMode: row?.mode ?? prefs.defaultMode,
  });
  const chatHandle = useMemo(
    () => ({
      ...chat,
      setMode: (m: AskMode) => {
        chat.setMode(m);
        if (row) void sessionActions.setMode(block.id, m);
      },
    }),
    [chat, row, block.id],
  );
  const { label: askLabel, placeholder } = askCopy(block, lectureNumber);
  const prompts = [step?.check, ...chat.suggestions.filter((s) => s !== "Quiz me on this")].filter((p): p is string => !!p).slice(0, 3);
  const askProps = { chat: chatHandle, label: askLabel, placeholder, courseId: block.courseId, prompts, onOpenSource: openSource };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !shortcuts || isTyping(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === "n" && live && plan) {
      e.preventDefault();
      void advance(advanceKind(live, Date.now() as EpochMs, prefs.pomodoro));
    } else if (key === "p" && live) {
      e.preventDefault();
      togglePause();
    } else if (key === "/") {
      const visible = (sel: string) => [...(rootRef.current?.querySelectorAll<HTMLElement>(sel) ?? [])].find((el) => el.offsetParent !== null);
      const box = visible("[data-composer-host] textarea");
      e.preventDefault();
      if (box) box.focus();
      else visible("[data-ask]")?.click();
    }
  };

  const [adding, setAdding] = useState(false);
  const planError = planJob?.status === "error" && !plan ? planJob.error : null;
  const planBody = plan ? (
    <TickingRows plan={plan} at={at} live={live} prefs={prefs}>
      {(rows) => <PlanList rows={rows} labelId={planLabelId} onSelect={goto} />}
    </TickingRows>
  ) : planError ? (
    planError.kind === "budget" ? (
      <BudgetNotice error={planError} />
    ) : (
      <ErrorLine
        title="Couldn't write a plan."
        detail={errorCopy(planError).detail ?? errorCopy(planError).title}
        action={
          <Button variant="secondary" size="sm" onClick={() => loadPlan(block, prefs.pomodoro, { retry: true })}>
            Try again
          </Button>
        }
      />
    )
  ) : (
    <div aria-busy="true" className="flex flex-col gap-1">
      <p className="sr-only" role="status">
        Writing your session plan
      </p>
      <PlanSkeleton />
    </div>
  );

  return (
    <main
      ref={rootRef}
      tabIndex={-1}
      data-testid={tid.main}
      data-mode={mode}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col gap-6 px-4 pt-5 outline-none md:px-6 md:pb-6 lg:px-10 lg:pt-7 lg:pb-8 max-lg:overflow-y-auto max-md:scroll-pb-20"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 lg:min-h-8 lg:flex-nowrap">
        <h1 className="min-w-0 flex-1 text-lg leading-6 font-normal tracking-display text-pretty text-ink">
          {titleOf(block)}
        </h1>
        <Button variant="secondary" data-ask aria-haspopup="dialog" aria-expanded={ask === "sheet"} aria-keyshortcuts="/" onClick={() => setAsk("sheet")} className="max-md:hidden lg:hidden">
          Ask
        </Button>
        {mode === "live" && live && <LiveControls session={live} prefs={prefs} onTogglePause={togglePause} onEnd={() => void end()} />}
        {mode === "preview" && (
          <>
            <p className="order-last w-full text-sm leading-4 text-graphite lg:order-none lg:w-auto">
              {fmtDay(zone.dayOf(block.start), zone, "long")} · {fmtRange(block, zone)}
            </p>
            <Button onClick={() => void startSession()}>Start session</Button>
          </>
        )}
        {mode === "finished" && row && (
          <>
            <p className="order-last w-full text-sm leading-4 text-graphite lg:order-none lg:w-auto">{finishedSummary(row)}</p>
            <Link href={href.today()} className={buttonVariants({ variant: "secondary" })}>
              Go to Today
            </Link>
          </>
        )}
      </header>

      {plan ? (
        <TickingRows plan={plan} at={at} live={live} prefs={prefs}>
          {(rows) => (
            <>
              <PlanStrip rows={rows} onSelect={goto} className="max-md:hidden xl:hidden" />
              <PlanDrawer rows={rows} onSelect={goto} className="md:hidden" />
            </>
          )}
        </TickingRows>
      ) : (
        !planError && <p className="animate-breathe text-sm leading-4 text-graphite xl:hidden">Writing your session plan…</p>
      )}

      <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-8 xl:gap-10">
        <section aria-labelledby={planLabelId} className="-mx-3 hidden w-[264px] shrink-0 flex-col gap-3 overflow-y-auto px-3 xl:flex">
          <SectionLabel id={planLabelId} className="py-1.5">
            Session plan
          </SectionLabel>
          {planBody}
        </section>

        <MaterialViewer
          viewer={viewer}
          slideCount={sources?.deck?.count}
          onChange={setViewer}
          empty={
            <EmptyState
              title="No material for this session yet."
              detail="Add the lecture slides, a textbook chapter or a handout, and the session opens on the right page."
              actions={<Button onClick={() => setAdding(true)}>Add material</Button>}
              className="rounded-sm border border-border p-8 max-md:p-5"
            />
          }
        >
          {plan?.moment && <MomentCard at={plan.moment.ref} quote={plan.moment.quote} examHint={plan.moment.examHint} onOpen={() => openSource(plan.moment!.ref)} />}
          {!plan && planError && <div className="xl:hidden">{planBody}</div>}
          <CheckRow question={step?.check} action={live && plan ? <NextStep live={live} prefs={prefs} onAdvance={(kind) => void advance(kind)} /> : undefined} />
        </MaterialViewer>

        <AskPanel {...askProps} shortcut="/" className="hidden w-80 shrink-0 lg:flex xl:w-[360px]" />
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto bg-page px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
        <Button variant="secondary" size="lg" data-ask aria-haspopup="dialog" aria-expanded={ask === "drawer"} aria-keyshortcuts="/" onClick={() => setAsk("drawer")} className="w-full">
          Ask
        </Button>
      </div>
      <Sheet open={ask === "sheet"} onOpenChange={(open) => setAsk(open ? "sheet" : null)}>
        <SheetContent
          ref={sheetRef}
          initialFocus={() => composerIn(sheetRef.current)}
          side="right"
          className="gap-0 border-rule p-0 shadow-none data-[side=right]:w-[400px] data-[side=right]:max-w-full data-[side=right]:sm:max-w-[400px]"
        >
          <SheetHeader className="px-4 pt-5 pb-0">
            <SheetTitle className="text-sm leading-4 font-normal tracking-caps text-graphite uppercase">{askLabel}</SheetTitle>
            <SheetDescription className="sr-only">{ASK_SCOPE}</SheetDescription>
          </SheetHeader>
          {ask === "sheet" && <AskPanel {...askProps} hideLabel className="flex-1 px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]" />}
        </SheetContent>
      </Sheet>
      <Drawer open={ask === "drawer"} onOpenChange={(open) => setAsk(open ? "drawer" : null)}>
        <DrawerContent ref={drawerRef} initialFocus={() => composerIn(drawerRef.current)} className="h-[85dvh] border-rule data-[swipe-direction=down]:rounded-t-lg">
          <DrawerHeader className="px-4 pt-5 pb-0">
            <DrawerTitle className="text-left text-sm leading-4 font-normal tracking-caps text-graphite uppercase">{askLabel}</DrawerTitle>
            <DrawerDescription className="sr-only">{ASK_SCOPE}</DrawerDescription>
          </DrawerHeader>
          {ask === "drawer" && <AskPanel {...askProps} hideLabel className="flex-1 px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]" />}
        </DrawerContent>
      </Drawer>
      <AddMaterialDialog open={adding} onOpenChange={setAdding} {...(block.courseId ? { courseId: block.courseId } : {})} />
    </main>
  );
}

function SessionSkeleton() {
  return (
    <main aria-busy="true" className="flex min-h-0 flex-1 flex-col gap-6 px-4 pt-5 pb-6 md:px-6 lg:px-10 lg:pt-7 lg:pb-8">
      <p className="sr-only" role="status">
        Opening the session
      </p>
      <div aria-hidden="true" className="flex h-8 items-center">
        <span className="h-6 w-80 max-w-full animate-breathe rounded-xs bg-fill" />
      </div>
      <div aria-hidden="true" className="flex gap-10">
        <div className="hidden w-60 shrink-0 flex-col gap-3 xl:flex">
          <span className="h-7" />
          <PlanSkeleton />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <span className="h-7" />
          <div className="flex flex-col gap-4 rounded-sm border border-border p-8">
            <span className="h-6 w-1/2 animate-breathe rounded-xs bg-fill" />
            <span className="h-5 w-4/5 animate-breathe rounded-xs bg-fill" />
          </div>
        </div>
        <div className="hidden w-80 shrink-0 lg:block xl:w-[360px]" />
      </div>
    </main>
  );
}

function MissingBlock() {
  return (
    <main className="flex flex-1 flex-col items-start gap-4 px-4 pt-5 pb-6 md:px-6 lg:px-10 lg:pt-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg leading-6 font-normal tracking-display text-ink">This study block isn&apos;t in your plan.</h1>
        <p className="max-w-[560px] text-sm leading-5 text-graphite">It may have moved after a calendar change, or it was cleared with your data. Pick it again from Study sessions.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={href.studyIndex()} className={buttonVariants()}>
          Open Study sessions
        </Link>
        <Link href={href.today()} className={buttonVariants({ variant: "secondary" })}>
          Go to Today
        </Link>
      </div>
    </main>
  );
}

/** /study/[blockId]: a read-only preview, or the running session once started (`?start=1` starts it). */
export function StudySession({ blockId, start, tab }: { blockId: BlockId; start: boolean; tab?: ViewerTab }) {
  const row = useSessionRow(blockId);
  const found = useStudyBlock(blockId, row);
  const prefs = usePrefs("study");
  const lecture = useReviewLecture(found?.block);
  if (found === undefined || row === undefined || !prefs) return <SessionSkeleton />;
  if (found === null) return <MissingBlock />;
  if (!lecture) return <SessionSkeleton />;
  return <SessionScreen key={blockId} block={found.block} zone={found.zone} row={row} prefs={prefs} lectureNumber={lecture.number} start={start} tab={tab} />;
}
