"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ClientApiError, fetchSolution } from "@/lib/client";
import {
  ALL_TOPICS,
  attemptOf,
  reduce,
  saveSession,
  topicsOf,
  visibleQuestions,
  type Session,
} from "@/lib/session";
import type { AttemptState, Option, Question, SolutionState } from "@/lib/types";
import AskChat from "./AskChat";
import { ChevronLeft, ChevronRight } from "./icons";
import Navigator from "./Navigator";
import { Prose } from "./Prose";

export default function Practice({ initial, onNew }: { initial: Session; onNew: () => void }) {
  const [session, dispatch] = useReducer(reduce, initial);
  const [hintFor, setHintFor] = useState<string | null>(null);
  const askInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLElement>(null);

  const visible = visibleQuestions(session);
  const index = visible.findIndex((q) => q.id === session.current);
  const question = visible[index];
  const prev = visible[index - 1];
  const next = visible[index + 1];
  const attempt = attemptOf(session, question.id);
  const topics = topicsOf(session.exam);

  useEffect(() => saveSession(session), [session]);

  const solutions = useRef(session.solutions);
  solutions.current = session.solutions;
  const requestSolution = useCallback((q: Question) => {
    if (solutions.current[q.id]?.status === "loading" || solutions.current[q.id]?.status === "ready") return;
    dispatch({ type: "solution", id: q.id, state: { status: "loading" } });
    fetchSolution(q).then(
      (solution) => dispatch({ type: "solution", id: q.id, state: { status: "ready", solution } }),
      (e) =>
        dispatch({
          type: "solution",
          id: q.id,
          state: { status: "error", message: e instanceof ClientApiError && e.api.kind === "rate_limited" ? "Nemotron is rate limited. Wait a minute and try again." : "Couldn't get a worked solution." },
        }),
    );
  }, []);

  useEffect(() => {
    for (const q of [question, next]) if (q && !solutions.current[q.id]) requestSolution(q);
  }, [question, next, requestSolution]);

  const goto = useCallback((q: Question | undefined) => {
    if (!q) return;
    dispatch({ type: "goto", id: q.id });
    body.current?.scrollTo({ top: 0 });
  }, []);

  const choose = useCallback(
    (label: string) => dispatch({ type: "choose", id: question.id, choice: label }),
    [question.id],
  );

  const firstUnanswered = visible.find((q) => attemptOf(session, q.id).status === "unanswered");
  const onward = next ?? firstUnanswered;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") return goto(prev);
      if (e.key === "ArrowRight") return goto(next);
      if (e.key === "Enter") {
        if (t.closest("button, a")) return;
        if (attempt.status === "answered") goto(onward);
        return;
      }
      if (attempt.status !== "unanswered") return;
      const byNumber = /^[1-9]$/.test(e.key) ? question.options[Number(e.key) - 1] : undefined;
      const byLetter = question.options.find((o) => o.label === e.key.toUpperCase());
      const option = byNumber ?? byLetter;
      if (option) {
        e.preventDefault();
        choose(option.label);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attempt.status, choose, goto, next, onward, prev, question.options]);

  const [askRequest, setAskRequest] = useState(0);
  useEffect(() => {
    if (!askRequest) return;
    askInput.current?.focus({ preventScroll: true });
    askInput.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [askRequest]);

  function askWhy() {
    if (attempt.status === "unanswered") setHintFor(question.id);
    setAskRequest((n) => n + 1);
  }

  const title = [session.exam.course, session.exam.title].filter(Boolean).join(" · ");
  const correctCount = visible.filter((q) => {
    const a = attemptOf(session, q.id);
    return a.status === "answered" && a.correct;
  }).length;
  const showPanel = attempt.status !== "unanswered" || hintFor === question.id;

  return (
    <div className="practice">
      <header className="toolbar">
        <h1 className="title">{title}</h1>
        <div className="toolbar-controls">
          <label className="visually-hidden" htmlFor="topic-filter">
            Filter by topic
          </label>
          <select
            id="topic-filter"
            className="select"
            value={session.topic ?? ""}
            onChange={(e) => dispatch({ type: "topic", topic: e.target.value || ALL_TOPICS })}
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="button" onClick={askWhy}>
            Ask why
          </button>
          <div className="stepper">
            <button className="icon-button" aria-label="Previous question" disabled={!prev} onClick={() => goto(prev)}>
              <ChevronLeft />
            </button>
            <button className="icon-button" aria-label="Next question" disabled={!next} onClick={() => goto(next)}>
              <ChevronRight />
            </button>
          </div>
        </div>
      </header>

      <main className="practice-body" ref={body}>
        <p className="visually-hidden" aria-live="polite">
          Question {index + 1} of {visible.length}
        </p>
        <article className="question" aria-labelledby={`q-${question.id}`} key={question.id}>
          <div className="stem" data-figure={session.figures[question.id] ? "" : undefined}>
            <div className="question-head">
              <p className="eyebrow caps" id={`q-${question.id}`}>
                Question {question.number} · {question.topic}
              </p>
              <Prose className="prompt" text={question.prompt} />
            </div>
            {session.figures[question.id] && (
              <figure className="figure">
                <img src={session.figures[question.id]} alt={`Figure for question ${question.number}, from page ${question.figure?.page}`} />
              </figure>
            )}
          </div>

          <div className="options" role="group" aria-label="Answer choices">
            {question.options.map((o, i) => (
              <OptionRow
                key={o.label}
                option={o}
                index={i}
                attempt={attempt}
                answer={question.answer}
                hint={whyNotFor(session.solutions[question.id], o.label)}
                onChoose={choose}
              />
            ))}
          </div>

          {showPanel && (
            <section className="solution" aria-labelledby={`solution-${question.id}`}>
              <h2 className="caps" id={`solution-${question.id}`}>
                Worked solution
              </h2>
              <div className="solution-block">
                <div className="solution-main">
                  <SolutionBody
                    attempt={attempt}
                    source={question.answerSource}
                    state={session.solutions[question.id]}
                    onRetry={() => requestSolution(question)}
                  />
                  {attempt.status === "answered" &&
                    (onward ? (
                      <button className="button primary next" onClick={() => goto(onward)}>
                        {onward === next ? "Next question" : "Next unanswered"}
                        <ChevronRight size={12} strokeWidth={2} />
                      </button>
                    ) : (
                      <p className="done">
                        All {visible.length} answered · {correctCount} correct
                      </p>
                    ))}
                </div>
                <div className="solution-ask">
                  <AskChat
                    key={question.id}
                    ref={askInput}
                    question={question}
                    attempt={attempt}
                    solution={session.solutions[question.id]}
                    messages={session.chats[question.id] ?? []}
                    onMessages={(messages) => dispatch({ type: "chat", id: question.id, messages })}
                  />
                </div>
              </div>
            </section>
          )}
        </article>
      </main>

      <footer className="bottom-bar">
        <Navigator questions={visible} session={session} onSelect={goto} />
        <button className="text-button" onClick={onNew}>
          New document
        </button>
      </footer>
    </div>
  );
}

function whyNotFor(state: SolutionState | undefined, label: string): string | undefined {
  return state?.status === "ready" ? state.solution.whyNot[label] : undefined;
}

type RowState = "idle" | "correct-choice" | "wrong-choice" | "correct-answer" | "checking" | "other";

function rowState(attempt: AttemptState, label: string, answer: string | undefined): RowState {
  switch (attempt.status) {
    case "unanswered":
      return "idle";
    case "checking":
      return attempt.choice === label ? "checking" : "other";
    case "answered":
      if (attempt.choice === label) return attempt.correct ? "correct-choice" : "wrong-choice";
      return label === answer ? "correct-answer" : "other";
  }
}

const STATUS_TEXT: Record<RowState, string | undefined> = {
  idle: undefined,
  "correct-choice": "Your answer · correct",
  "wrong-choice": "Your answer",
  "correct-answer": "Correct answer",
  checking: "Your answer · checking…",
  other: undefined,
};

function OptionRow({
  option,
  index,
  attempt,
  answer,
  hint,
  onChoose,
}: {
  option: Option;
  index: number;
  attempt: AttemptState;
  answer?: string;
  hint?: string;
  onChoose: (label: string) => void;
}) {
  const state = rowState(attempt, option.label, answer);
  const status = STATUS_TEXT[state];
  return (
    <button
      className="option"
      data-state={state}
      disabled={state !== "idle"}
      onClick={() => onChoose(option.label)}
      aria-keyshortcuts={`${index + 1} ${option.label}`}
    >
      <span className="option-label">{option.label}</span>
      <Prose className="option-text" text={option.text} />
      {status ? (
        <span className="option-trail">{status}</span>
      ) : (
        state === "other" &&
        hint && (
          <span className="option-trail option-hint" title={hint}>
            {hint}
          </span>
        )
      )}
    </button>
  );
}

const PROVENANCE: Record<Question["answerSource"], string> = {
  document: "Answer from the official answer key; Nemotron 3 Ultra wrote the explanation.",
  model: "The original exam had no answer key; Nemotron 3 Ultra worked this out.",
  none: "The original exam had no answer key; Nemotron 3 Ultra worked this out.",
};

function SolutionBody({
  attempt,
  source,
  state,
  onRetry,
}: {
  attempt: AttemptState;
  source: Question["answerSource"];
  state?: SolutionState;
  onRetry: () => void;
}) {
  if (attempt.status === "unanswered") {
    return <p className="muted">Pick an answer to see the worked solution. Ask for a hint on the right.</p>;
  }
  if (!state || state.status === "loading") {
    return (
      <div className="pending" aria-busy="true">
        <p className="muted">Working it out with Nemotron Ultra…</p>
        <div className="skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="pending">
        <p className="muted">{state.message || "Couldn't get a worked solution."}</p>
        <button className="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <>
      <Prose className="explanation" text={state.solution.explanation} />
      {state.solution.steps.length > 0 && (
        <ol className="steps">
          {state.solution.steps.map((s, i) => (
            <li key={i}>
              <span className="step-label" aria-hidden="true">
                Step {i + 1}
              </span>
              <Prose text={s} />
            </li>
          ))}
        </ol>
      )}
      <p className="muted">{PROVENANCE[source]}</p>
    </>
  );
}
