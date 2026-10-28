"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { errorCopy } from "@/lib/ai";
import { useChat } from "@/lib/chat";
import { gradeOf, threadKey, type PracticeSet, type Question, type QuestionId, type SetId } from "@/lib/domain";
import { topicMatch } from "@/lib/plan";
import { href } from "@/lib/routes";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { BudgetNotice, EmptyState, ErrorLine, Prose, SectionLabel } from "@/components/cue";
import { ChatThread, Composer } from "@/components/cue/chat";
import { Button, buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { choose, prefetchSolution, setView, usePracticeSet, useSolveState, type SetData } from "./data";
import { WriteQuestionsDialog } from "./generate";
import { resumeGeneration, retryGeneration, startGeneration, useGeneration, type GenerationState } from "./generation";
import { eyebrow, provenance, sectionLabel, topicsOf, visibleQuestions } from "./model";
import { Chevron, CropFigure, OptionRow, QuestionBar, ResourceRow, TreeFigure } from "./parts";
import { tid } from "./testids";
import { onwardTarget, reduceView, type ViewAction } from "./view";

const ALL = "__all__";

/** The bar's own roving keys; every other shortcut works with a tile focused. */
const BAR_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/**
 * Base UI keeps a closed Select's listbox mounted under a hidden positioner, and a closing popup stays visible
 * through its exit animation with `data-closed`, so only a visible popup that is not closing counts.
 */
function overlayOpen(): boolean {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="listbox"]')].some((el) => el.checkVisibility() && !el.closest("[data-closed]"));
}

function AskPanel({ question }: { question: Question }) {
  const chat = useChat({ thread: threadKey.question(question.id), scope: { kind: "question", questionId: question.id } });
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <SectionLabel>Ask about question {question.number}</SectionLabel>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ChatThread
          chat={chat}
          empty={
            <div className="flex flex-wrap gap-2">
              {chat.suggestions.map((s) => (
                <Button key={s} variant="secondary" size="sm" onClick={() => chat.send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          }
        />
      </div>
      <Composer chat={chat} placeholder={`Ask about question ${question.number}…`} label="Ask about this question" />
    </div>
  );
}

function SolutionPanel({
  data,
  question,
  onNext,
  onward,
  isNext,
  done,
  justAnswered,
}: {
  data: SetData;
  question: Question;
  onNext: () => void;
  onward: QuestionId | undefined;
  isNext: boolean;
  done: { total: number; correct: number };
  justAnswered: boolean;
}) {
  const solution = data.solutions.get(question.id);
  const grade = gradeOf(question, data.attempts.get(question.id));
  const solve = useSolveState(question.id);
  const heading = useRef<HTMLHeadingElement>(null);

  // At phone width the options fill the screen, so the solution and its Next button start below the fold.
  useEffect(() => {
    if (!justAnswered || !window.matchMedia("(max-width: 767px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.current?.scrollIntoView({ block: "start", behavior: reduce ? "instant" : "smooth" });
  }, [justAnswered]);

  return (
    <section data-testid={tid.solution} aria-labelledby={`solution-${question.id}`} className={cn("flex flex-col gap-3", justAnswered && "animate-rise")}>
      <SectionLabel id={`solution-${question.id}`} ref={heading} className="scroll-mt-2">
        Worked solution
      </SectionLabel>
      <div className="flex gap-6 rounded-sm bg-fill p-6 max-lg:flex-col max-md:p-4">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-4 text-sm leading-5 text-ink">
          {solution ? (
            <>
              <Prose text={solution.explanation} className="gap-2" />
              {solution.steps.length > 0 && (
                <dl className="flex flex-col gap-1">
                  {solution.steps.map((s, i) => (
                    <div key={i} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 max-md:grid-cols-[72px_minmax(0,1fr)]">
                      <dt className="text-graphite">{s.label}</dt>
                      <dd>
                        <Prose text={s.text} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {solution.conclusion && <p>{solution.conclusion}</p>}
              <p className="text-graphite">{provenance(question, solution, data.set)}</p>
            </>
          ) : solve?.status === "error" ? (
            solve.error.kind === "budget" ? (
              <BudgetNotice error={solve.error} className="bg-page" />
            ) : (
              <ErrorLine
                title={errorCopy(solve.error).title}
                detail={errorCopy(solve.error).detail}
                action={
                  <Button variant="secondary" size="sm" onClick={() => prefetchSolution(question, data.set.courseId, false, true)}>
                    Try again
                  </Button>
                }
              />
            )
          ) : (
            <div aria-busy="true" className="flex w-full flex-col gap-3">
              <p className="text-graphite">Working it out with Nemotron Ultra…</p>
              <div aria-hidden="true" className="flex w-full max-w-[56ch] flex-col gap-2">
                {[100, 86, 64].map((w, i) => (
                  <span key={w} className="h-2.5 animate-breathe rounded-[3px] bg-control" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            </div>
          )}
          {grade.status === "answered" &&
            (onward ? (
              <Button onClick={onNext}>
                {isNext ? "Next question" : "Next unanswered"}
                <Chevron dir="right" size={12} stroke={2} data-icon="inline-end" />
              </Button>
            ) : (
              <p className="font-medium">
                All {done.total} answered · {done.correct} correct
              </p>
            ))}
        </div>
        {solution && solution.resources.length > 0 && (
          <div data-testid={tid.resources} className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm leading-4 text-graphite">Relevant resources</p>
            <ul aria-label="Relevant resources" className="flex flex-col gap-2">
              {solution.resources.map((r, i) => (
                <ResourceRow key={i} source={r} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function title(set: PracticeSet): string {
  return [set.courseId, set.title].filter(Boolean).join(" · ");
}

/** What a set made from a link is written from, in the words its provenance line uses. */
function writtenFrom(set: PracticeSet): string {
  if (set.origin.kind !== "generated") return set.title;
  const scope = set.origin.scope;
  switch (scope.kind) {
    case "section":
      return sectionLabel({ kind: "section", courseId: scope.courseId, sectionId: scope.sectionId, title: set.title });
    case "message":
      return "your study chat";
    case "topic":
      return scope.topic === "missedMost" ? "the topics you missed most" : scope.topic;
    case "similar":
      return "a question you practiced";
  }
}

/** Beside the bar, where new tiles would have landed: why writing stopped, and the way to start again. */
function GenerationStatus({ state, setId }: { state: GenerationState | undefined; setId: SetId }) {
  if (state?.status === "failed") {
    return (
      <ErrorLine
        className="shrink-0 flex-nowrap whitespace-nowrap max-md:order-first max-md:w-full max-md:whitespace-normal"
        title={state.title}
        detail={state.budget ? undefined : state.detail?.split(/(?<=\.) /)[0]}
        action={
          state.retry ? (
            <Button variant="secondary" size="sm" onClick={() => retryGeneration(setId)}>
              Try again
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (state?.status === "done" && state.kept === 0) {
    return (
      <ErrorLine
        className="shrink-0 flex-nowrap whitespace-nowrap max-md:order-first max-md:w-full max-md:whitespace-normal"
        title="None of the new questions passed Cue's checks."
        action={
          <Button variant="secondary" size="sm" onClick={() => retryGeneration(setId)}>
            Try again
          </Button>
        }
      />
    );
  }
  return null;
}

function announce(state: GenerationState | undefined): string {
  if (!state) return "";
  if (state.status === "writing") return state.kept > 0 ? `Cue wrote ${state.kept} question${state.kept === 1 ? "" : "s"} so far.` : "Cue is writing questions.";
  if (state.status === "done") return `Cue wrote ${state.kept} question${state.kept === 1 ? "" : "s"}${state.dropped > 0 ? ` and dropped ${state.dropped} that failed its checks` : ""}.`;
  return state.title;
}

/** Toolbar, scrolling body and question bar: Paper's three rows, shared by a set with questions and one still being written. */
function Frame({ heading, controls, children, footer, onKeyDown, rootRef }: { heading: string; controls?: ReactNode; children: ReactNode; footer: ReactNode; onKeyDown?: (e: React.KeyboardEvent) => void; rootRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col gap-6 px-10 pt-7 pb-8 outline-none max-md:gap-4 max-md:px-4 max-md:pt-4 max-md:pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      <header className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 truncate text-lg leading-6 font-normal tracking-display text-ink max-md:w-full max-md:whitespace-normal">{heading}</h1>
        {controls}
      </header>
      {children}
      <footer className="flex shrink-0 items-center gap-6 border-t border-rule pt-4 max-md:flex-wrap max-md:gap-x-4 max-md:gap-y-3 max-md:pt-3">{footer}</footer>
    </div>
  );
}

/** A set made from a link, before its first question passes the checks. */
function Writing({ data }: { data: SetData }) {
  const { set } = data;
  const state = useGeneration(set.id);
  const writing = state?.status === "writing" || state === undefined;
  const failed = state?.status === "failed" ? state : null;
  const headline = writing
    ? `Cue is writing questions from ${writtenFrom(set)}.`
    : failed?.budget
      ? "Cue couldn't write these questions."
      : failed
        ? failed.title
        : `None of the questions Cue wrote from ${writtenFrom(set)} passed its checks.`;
  const scope = set.origin.kind === "generated" ? set.origin.scope : null;
  const detail = writing
    ? "Each one appears once a second, independent answer agrees with its key."
    : failed
      ? failed.detail
      : "Cue drops a question when its key, its options or its stem fail a check. Try again for a new batch.";
  return (
    <Frame
      heading={title(set)}
      footer={
        <>
          <QuestionBar questions={[]} current={null} attempts={data.attempts} generating={state?.status === "writing" ? state.pending : 0} generatingTopic={state?.topic ?? set.title} onSelect={() => undefined} />
          <p className="sr-only" aria-live="polite">
            {announce(state)}
          </p>
        </>
      }
    >
      <main className="min-h-0 flex-1 overflow-y-auto pt-4 max-md:pt-2">
        <div aria-busy={writing} className="flex flex-col gap-8 max-md:gap-6">
          <div role={writing ? undefined : "alert"} className="flex max-w-[520px] flex-col items-start gap-3">
            <p className="text-sm leading-4 tracking-caps text-graphite uppercase">Written by Cue · Multiple choice</p>
            <p className="text-lg leading-7 tracking-display text-pretty text-ink">{headline}</p>
            {detail && !failed?.budget && <p className="text-sm leading-5 text-graphite">{detail}</p>}
            {failed?.budget && <BudgetNotice error={failed.budget} className="w-full" />}
            {!writing && (!failed || failed.retry) && (
              <Button variant="secondary" className="mt-1" onClick={() => retryGeneration(set.id)}>
                Try again
              </Button>
            )}
            {failed && !failed.retry && !failed.budget && scope?.kind === "section" && (
              <Link href={href.guide(scope.courseId, scope.sectionId)} className={cn(buttonVariants({ variant: "secondary" }), "mt-1")}>
                Open the study guide
              </Link>
            )}
          </div>
          {writing && (
            <div aria-hidden="true" className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="h-14 animate-breathe rounded-sm bg-fill" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}
        </div>
      </main>
    </Frame>
  );
}

function Screen({ data }: { data: SetData }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLElement>(null);
  const askColumn = useRef<HTMLElement>(null);
  const askToggle = useRef<HTMLButtonElement>(null);
  const wide = useMediaQuery("(min-width: 1280px)", true);
  const phone = useMediaQuery("(max-width: 767px)");
  const [asking, setAsking] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [answeredNow, setAnsweredNow] = useState<QuestionId | null>(null);
  const { set, questions, attempts } = data;
  const generation = useGeneration(set.id);
  const topic = set.view.topic;
  const visible = useMemo(() => visibleQuestions(questions, topic), [questions, topic]);
  const index = Math.max(0, visible.findIndex((q) => q.id === set.view.current));
  const question = visible[index] as Question | undefined;
  const prev = visible[index - 1];
  const next = visible[index + 1];
  const topics = topicsOf(questions);

  const dispatch = useCallback(
    (action: ViewAction) => {
      const view = reduceView(set.view, action, { questions, attempts });
      if (view === set.view) return;
      void setView(set.id, view);
      if (view.current !== set.view.current) body.current?.scrollTo({ top: 0 });
    },
    [set.id, set.view, questions, attempts],
  );

  // Solutions for the current question and the next, the only prefetch: a walk through tiles never queues more.
  useEffect(() => {
    for (const q of [question, next]) if (q) prefetchSolution(q, set.courseId, data.solutions.has(q.id));
  }, [question, next, data.solutions, set.courseId]);

  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  // The sheet below 1280 focuses its own composer; the column is not a dialog, so it is focused here.
  useEffect(() => {
    if (asking && wide) askColumn.current?.querySelector("textarea")?.focus();
  }, [asking, wide]);

  if (!question) return <Writing data={data} />;

  const attempt = attempts.get(question.id);
  const grade = gradeOf(question, attempt);
  const onward = onwardTarget(set.view, { questions, attempts });
  const correct = visible.filter((q) => {
    const g = gradeOf(q, attempts.get(q.id));
    return g.status === "answered" && g.correct;
  }).length;
  const leave = () => (window.history.length > 1 ? router.back() : router.push(href.practice()));
  const closeAsk = () => {
    if (askColumn.current?.contains(document.activeElement)) askToggle.current?.focus();
    setAsking(false);
  };
  const answer = (label: string) => {
    setAnsweredNow(question.id);
    void choose(question, label);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    // A sheet or dialog can receive its Escape before focus has moved into it; the key is the overlay's, not ours.
    if (overlayOpen()) return;
    const t = e.target as HTMLElement;
    if (e.key === "Escape" && asking) {
      closeAsk();
      return;
    }
    if (t.closest("input, textarea, select, [contenteditable], [role=listbox], [role=menu], [role=dialog]")) return;
    if (e.key === "Escape") return leave();
    if (BAR_KEYS.has(e.key) && t.closest(`[data-testid=${tid.bar}]`)) return;
    if (e.key === "ArrowLeft") return dispatch({ type: "step", by: -1 });
    if (e.key === "ArrowRight") return dispatch({ type: "step", by: 1 });
    if (e.key === "?") {
      e.preventDefault();
      if (asking && wide) askColumn.current?.querySelector("textarea")?.focus();
      setAsking(true);
      return;
    }
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      setWriteOpen(true);
      return;
    }
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      setTopicOpen(true);
      return;
    }
    if (e.key === "Enter") {
      if (t.closest("button, a")) return;
      if (grade.status === "answered") dispatch({ type: "onward" });
      return;
    }
    if (grade.status !== "unanswered") return;
    const byNumber = /^[1-9]$/.test(e.key) ? question!.options[Number(e.key) - 1] : undefined;
    const byLetter = question!.options.find((o) => o.label === e.key.toUpperCase());
    const option = byNumber ?? byLetter;
    if (option) {
      e.preventDefault();
      answer(option.label);
    }
  }

  const figureLabel = `Figure for question ${question.number}`;
  const figure = question.figure ? (
    question.figure.kind === "tree" ? (
      <TreeFigure root={question.figure.root} label={figureLabel} />
    ) : (
      <CropFigure blob={question.figure.blob} label={`${figureLabel}, from page ${question.figure.page}`} />
    )
  ) : null;

  const controls = (
    <div className="flex items-center gap-3 max-md:w-full">
      <Select
        items={[{ value: ALL, label: "All topics" }, ...topics.map((t) => ({ value: t, label: t }))]}
        value={topic ?? ALL}
        open={topicOpen}
        onOpenChange={setTopicOpen}
        onValueChange={(v) => dispatch({ type: "filter", topic: !v || v === ALL ? null : (v as string) })}
      >
        <SelectTrigger aria-label="Topic" aria-keyshortcuts="t" className="max-w-[220px] max-md:max-w-none max-md:flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="end">
          <SelectItem value={ALL}>All topics</SelectItem>
          {topics.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger render={<Button ref={askToggle} variant="secondary" aria-pressed={asking} aria-keyshortcuts="?" onClick={() => setAsking((a) => !a)} />}>Ask why</TooltipTrigger>
        <TooltipContent>
          Ask about this question <Kbd>?</Kbd>
        </TooltipContent>
      </Tooltip>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Previous question" aria-keyshortcuts="ArrowLeft" disabled={!prev} onClick={() => dispatch({ type: "step", by: -1 })} />}>
            <Chevron dir="left" />
          </TooltipTrigger>
          <TooltipContent>
            Previous <Kbd>←</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Next question" aria-keyshortcuts="ArrowRight" disabled={!next} onClick={() => dispatch({ type: "step", by: 1 })} />}>
            <Chevron dir="right" />
          </TooltipTrigger>
          <TooltipContent>
            Next <Kbd>→</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );

  return (
    <Frame
      rootRef={root}
      onKeyDown={onKeyDown}
      heading={title(set)}
      controls={controls}
      footer={
        <>
          <QuestionBar
            questions={visible}
            current={question.id}
            attempts={attempts}
            generating={generation?.status === "writing" ? generation.pending : 0}
            generatingTopic={generation?.topic ?? null}
            onSelect={(q) => dispatch({ type: "goto", id: q.id })}
          />
          <GenerationStatus state={generation} setId={set.id} />
          <p className="sr-only" aria-live="polite">
            {announce(generation)}
          </p>
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="secondary" aria-keyshortcuts="n" onClick={() => setWriteOpen(true)} className="max-md:hidden" />}
            >
              <Plus data-icon="inline-start" size={12} strokeWidth={2} aria-hidden="true" />
              Write questions
            </TooltipTrigger>
            <TooltipContent>
              Write new questions with Cue <Kbd>N</Kbd>
            </TooltipContent>
          </Tooltip>
          <Button variant="secondary" size="icon" aria-label="Write questions" onClick={() => setWriteOpen(true)} className="rounded-sm md:hidden">
            <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 gap-12">
        <main ref={body} className="relative -mx-10 min-h-0 min-w-0 flex-1 overflow-y-auto px-10 pt-4 pb-1 max-md:-mx-4 max-md:px-4 max-md:pt-2">
          <p className="sr-only" aria-live="polite">
            Question {index + 1} of {visible.length}
          </p>
          <article key={question.id} aria-labelledby={`q-${question.id}`} className="flex flex-col gap-8 max-md:gap-6">
            <div className="grid grid-cols-2 items-start gap-x-2 max-md:grid-cols-1 max-md:gap-y-4">
              <div className={cn("flex min-w-0 flex-col gap-3", !figure && "col-span-full")}>
                <p id={`q-${question.id}`} className="max-w-[520px] text-sm leading-4 tracking-caps text-graphite uppercase">
                  {eyebrow(question)}
                </p>
                <Prose text={question.prompt} className="items-start text-lg leading-7 tracking-display text-pretty text-ink [&>p]:max-w-[520px] [&>pre]:min-w-[min(520px,100%)]" />
              </div>
              {figure && <figure className="max-w-full justify-self-start">{figure}</figure>}
            </div>
            <div role="group" aria-label="Answer choices" className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
              {question.options.map((o, i) => (
                <OptionRow key={o.label} option={o} index={i} question={question} attempt={attempt} hint={data.solutions.get(question.id)?.whyNot[o.label]} onChoose={answer} />
              ))}
            </div>
            {grade.status !== "unanswered" && (
              <SolutionPanel
                data={data}
                question={question}
                onNext={() => dispatch({ type: "onward" })}
                onward={onward}
                isNext={onward === next?.id}
                done={{ total: visible.length, correct }}
                justAnswered={answeredNow === question.id}
              />
            )}
          </article>
        </main>
        {asking && wide && (
          <aside ref={askColumn} aria-label="Ask why" className="flex w-[360px] shrink-0 flex-col pt-4">
            <AskPanel key={question.id} question={question} />
          </aside>
        )}
      </div>

      {!wide && (
        <Sheet open={asking} onOpenChange={setAsking}>
          <SheetContent
            side={phone ? "bottom" : "right"}
            className="p-6 data-[side=bottom]:h-[85dvh] data-[side=bottom]:rounded-t-lg data-[side=bottom]:px-4 data-[side=bottom]:pb-[max(16px,env(safe-area-inset-bottom))] data-[side=right]:w-full data-[side=right]:sm:max-w-[400px]"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Ask why</SheetTitle>
            </SheetHeader>
            <AskPanel key={question.id} question={question} />
          </SheetContent>
        </Sheet>
      )}
      <WriteQuestionsDialog key={writeOpen ? "open" : "closed"} open={writeOpen} onOpenChange={setWriteOpen} data={data} defaultTopic={topic} onSubmit={(req) => startGeneration(set.id, req)} />
    </Frame>
  );
}

/** Applies `?q=` and `?topic=` once, then drops them so Back and reload keep the student's own place. */
function useLinkedView(data: SetData | null | undefined, link: { q?: string; topic?: string }) {
  const router = useRouter();
  const applied = useRef(false);
  useEffect(() => {
    if (!data || applied.current) return;
    applied.current = true;
    if (!link.q && !link.topic) return;
    const ctx = { questions: data.questions, attempts: data.attempts };
    let view = data.set.view;
    const label = link.topic ? (topicsOf(data.questions).find((t) => t === link.topic) ?? topicsOf(data.questions).find((t) => topicMatch(t, link.topic!))) : undefined;
    if (label) view = reduceView(view, { type: "filter", topic: label }, ctx);
    if (link.q) view = reduceView(view, { type: "goto", id: link.q as QuestionId }, ctx);
    if (view !== data.set.view) void setView(data.set.id, view);
    router.replace(href.practiceSet(data.set.id));
  }, [data, link.q, link.topic, router]);
}

/** The practice paper, a focus screen: one question at a time, results along the bottom. Esc returns. */
export function PracticeScreen({ setId, link = {} }: { setId: SetId; link?: { q?: string; topic?: string } }) {
  const data = usePracticeSet(setId);
  useLinkedView(data, link);
  const set = data?.set;
  const count = data?.questions.length ?? 0;
  useEffect(() => {
    if (set) resumeGeneration(set, count);
  }, [set, count]);
  if (data === undefined) return <main className="flex-1" aria-busy="true" />;
  if (data === null) return <MissingSet />;
  return <Screen data={data} />;
}

/** A set id this browser has no row for, or one that is not a set id at all. */
export function MissingSet() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-10 pt-7 max-md:px-4 max-md:pt-4">
      <EmptyState
        title="This practice set isn't on this device."
        detail="Practice sets live in the browser that made them. Upload the paper again to practice it here."
        actions={
          <Link href={href.practice()} className={buttonVariants({ variant: "secondary" })}>
            Back to Practice
          </Link>
        }
      />
    </main>
  );
}
