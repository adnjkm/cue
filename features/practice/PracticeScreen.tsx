"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorCopy } from "@/lib/ai";
import { useChat } from "@/lib/chat";
import { gradeOf, threadKey, type Question, type SetId } from "@/lib/domain";
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
import { choose, prefetchSolution, setView, usePracticeSet, useSolveState, type SetData, type SolveState } from "./data";
import { useGenerator, WriteQuestionsDialog } from "./generate";
import { eyebrow, provenance, topicsOf, visibleQuestions } from "./model";
import { CropFigure, OptionRow, QuestionBar, ResourceRow, TreeFigure } from "./parts";
import { tid } from "./testids";

const ALL = "__all__";

function AskPanel({ question, onClose }: { question: Question; onClose?: () => void }) {
  const chat = useChat({ thread: threadKey.question(question.id), scope: { kind: "question", questionId: question.id } });
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Ask about question {question.number}</SectionLabel>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
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

function Solution({ data, question, onNext, onward, isNext, done }: {
  data: SetData;
  question: Question;
  onNext: () => void;
  onward: Question | undefined;
  isNext: boolean;
  done: { total: number; correct: number };
}) {
  const solution = data.solutions.get(question.id);
  const grade = gradeOf(question, data.attempts.get(question.id));
  const solve: SolveState | undefined = useSolveState(question.id);
  return (
    <section data-testid={tid.solution} aria-labelledby={`solution-${question.id}`} className="flex animate-rise flex-col gap-3">
      <SectionLabel id={`solution-${question.id}`}>Worked solution</SectionLabel>
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
              <p className="text-graphite">{provenance(question, solution)}</p>
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
              <Button onClick={onNext} data-icon="inline-end">
                {isNext ? "Next question" : "Next unanswered"}
                <ChevronRight size={12} strokeWidth={3} aria-hidden="true" />
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

function Screen({ data }: { data: SetData }) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery("(min-width: 1280px)", true);
  const [asking, setAsking] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const { set, questions, attempts } = data;
  const topic = set.view.topic;
  const visible = useMemo(() => visibleQuestions(questions, topic), [questions, topic]);
  const index = Math.max(0, visible.findIndex((q) => q.id === set.view.current));
  const question = visible[index] as Question | undefined;
  const prev = visible[index - 1];
  const next = visible[index + 1];
  const topics = topicsOf(questions);
  const generator = useGenerator(data);

  const goto = useCallback(
    (q: Question | undefined) => {
      if (!q) return;
      void setView(set.id, { current: q.id });
      body.current?.scrollTo({ top: 0 });
    },
    [set.id],
  );

  // Solutions for the current question and the next, the only prefetch: a walk through tiles never queues more.
  useEffect(() => {
    for (const q of [question, next]) if (q) prefetchSolution(q, set.courseId, data.solutions.has(q.id));
  }, [question, next, data.solutions, set.courseId]);

  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  if (!question) {
    return (
      <div className="flex flex-1 flex-col gap-6 px-10 pt-7 pb-8 max-md:px-4">
        <h1 className="text-lg leading-6 tracking-display">{[set.courseId, set.title].filter(Boolean).join(" · ")}</h1>
        <EmptyState title="Cue is writing questions." detail="They appear here as each one is checked." />
      </div>
    );
  }

  const attempt = attempts.get(question.id);
  const grade = gradeOf(question, attempt);
  const firstUnanswered = visible.find((q) => gradeOf(q, attempts.get(q.id)).status === "unanswered");
  const onward = next ?? firstUnanswered;
  const correct = visible.filter((q) => {
    const g = gradeOf(q, attempts.get(q.id));
    return g.status === "answered" && g.correct;
  }).length;
  const showSolution = grade.status !== "unanswered";
  const title = [set.courseId, set.title].filter(Boolean).join(" · ");
  const leave = () => (window.history.length > 1 ? router.back() : router.push(href.practice()));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable], [role=listbox], [role=menu], [role=dialog]")) return;
    if (e.key === "Escape") {
      if (asking) setAsking(false);
      else leave();
      return;
    }
    if (t.closest("[data-testid=practice-bar]")) return;
    if (e.key === "ArrowLeft") return goto(prev);
    if (e.key === "ArrowRight") return goto(next);
    if (e.key === "?") {
      e.preventDefault();
      setAsking(true);
      return;
    }
    if (e.key === "Enter") {
      if (t.closest("button, a")) return;
      if (grade.status === "answered") goto(onward);
      return;
    }
    if (grade.status !== "unanswered" || !question) return;
    const byNumber = /^[1-9]$/.test(e.key) ? question.options[Number(e.key) - 1] : undefined;
    const byLetter = question.options.find((o) => o.label === e.key.toUpperCase());
    const option = byNumber ?? byLetter;
    if (option) {
      e.preventDefault();
      void choose(question, option.label);
    }
  }

  const figureLabel = `Figure for question ${question.number}`;
  const figure = question.figure ? (question.figure.kind === "tree" ? <TreeFigure root={question.figure.root} label={figureLabel} /> : <CropFigure blob={question.figure.blob} label={`${figureLabel}, from page ${question.figure.page}`} />) : null;

  return (
    <div ref={root} tabIndex={-1} onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col gap-6 px-10 pt-7 pb-8 outline-none max-md:gap-4 max-md:px-4 max-md:pt-4 max-md:pb-[max(12px,env(safe-area-inset-bottom))]">
      <header className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 truncate text-lg leading-6 font-normal tracking-display text-ink max-md:w-full max-md:whitespace-normal">{title}</h1>
        <div className="flex items-center gap-3 max-md:w-full">
          <Select
            items={[{ value: ALL, label: "All topics" }, ...topics.map((t) => ({ value: t, label: t }))]}
            value={topic ?? ALL}
            onValueChange={(v) => {
              const nextTopic = !v || v === ALL ? null : (v as string);
              const nextVisible = visibleQuestions(questions, nextTopic);
              void setView(set.id, { topic: nextTopic, current: nextVisible.some((q) => q.id === set.view.current) ? set.view.current : (nextVisible[0]?.id ?? null) });
            }}
          >
            <SelectTrigger aria-label="Topic" className="max-w-[220px] max-md:max-w-none max-md:flex-1">
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
            <TooltipTrigger render={<Button variant="secondary" aria-pressed={asking} aria-keyshortcuts="?" onClick={() => setAsking((a) => !a)} />}>Ask why</TooltipTrigger>
            <TooltipContent>
              Ask about this question <Kbd>?</Kbd>
            </TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Previous question" disabled={!prev} onClick={() => goto(prev)} />}>
                <ChevronLeft strokeWidth={2.25} aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>
                Previous <Kbd>←</Kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Next question" disabled={!next} onClick={() => goto(next)} />}>
                <ChevronRight strokeWidth={2.25} aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>
                Next <Kbd>→</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-12">
        <main ref={body} className="relative -mx-10 min-h-0 min-w-0 flex-1 overflow-y-auto px-10 pt-4 pb-1 max-md:-mx-4 max-md:px-4 max-md:pt-2">
          <p className="sr-only" aria-live="polite">
            Question {index + 1} of {visible.length}
          </p>
          <article key={question.id} aria-labelledby={`q-${question.id}`} className="flex flex-col gap-8 max-md:gap-6">
            <div className={cn("grid grid-cols-2 items-start gap-x-2 max-md:grid-cols-1 max-md:gap-y-4")}>
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
                <OptionRow
                  key={o.label}
                  option={o}
                  index={i}
                  question={question}
                  attempt={attempt}
                  hint={data.solutions.get(question.id)?.whyNot[o.label]}
                  onChoose={(label) => void choose(question, label)}
                />
              ))}
            </div>
            {showSolution && (
              <Solution
                data={data}
                question={question}
                onNext={() => goto(onward)}
                onward={onward}
                isNext={onward === next}
                done={{ total: visible.length, correct }}
              />
            )}
          </article>
        </main>
        {asking && wide && (
          <aside aria-label="Ask why" className="flex w-[360px] shrink-0 flex-col pt-4">
            <AskPanel key={question.id} question={question} onClose={() => setAsking(false)} />
          </aside>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-6 border-t border-rule pt-4 max-md:gap-4 max-md:pt-3">
        <QuestionBar questions={visible} current={question.id} attempts={attempts} generating={generator.pending} generatingTopic={generator.topic} onSelect={goto} />
        {generator.error && (
          <ErrorLine
            title={generator.error.kind === "budget" ? errorCopy(generator.error).title : "Couldn't write questions."}
            action={
              generator.error.kind !== "budget" ? (
                <Button variant="secondary" size="sm" onClick={generator.retry}>
                  Try again
                </Button>
              ) : undefined
            }
          />
        )}
        <Button variant="secondary" aria-keyshortcuts="n" onClick={() => setWriteOpen(true)} className="max-md:hidden" data-icon="inline-start">
          <Plus size={12} strokeWidth={2} aria-hidden="true" />
          Write questions
        </Button>
        <Button variant="secondary" size="icon" aria-label="Write questions" onClick={() => setWriteOpen(true)} className="rounded-sm md:hidden">
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </footer>

      {!wide && (
        <Sheet open={asking} onOpenChange={setAsking}>
          <SheetContent side="right" className="w-full p-6 data-[side=right]:sm:max-w-[400px]">
            <SheetHeader className="sr-only">
              <SheetTitle>Ask why</SheetTitle>
            </SheetHeader>
            <AskPanel key={question.id} question={question} />
          </SheetContent>
        </Sheet>
      )}
      <WriteQuestionsDialog open={writeOpen} onOpenChange={setWriteOpen} data={data} defaultTopic={topic} onSubmit={generator.start} />
    </div>
  );
}

/** The practice paper, a focus screen: one question at a time, results along the bottom. Esc returns. */
export function PracticeScreen({ setId }: { setId: SetId }) {
  const data = usePracticeSet(setId);
  if (data === undefined) return <div className="flex-1" aria-busy="true" />;
  if (data === null) {
    return (
      <div className="flex flex-1 flex-col gap-6 px-10 pt-7 max-md:px-4">
        <EmptyState
          title="This practice set isn't on this device."
          detail="Practice sets live in this browser. Upload the paper again to practice it here."
          actions={
            <a href={href.practice()} className={buttonVariants({ variant: "secondary" })}>
              Back to Practice
            </a>
          }
        />
      </div>
    );
  }
  return <Screen data={data} />;
}
