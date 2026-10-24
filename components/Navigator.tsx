"use client";

import { useEffect, useRef } from "react";
import { attemptOf, type Session } from "@/lib/session";
import type { Question } from "@/lib/types";
import { Check } from "./icons";

type TileState = "current" | "correct" | "missed" | "unanswered";

const TILE_LABEL: Record<TileState, string> = {
  current: "current",
  correct: "correct",
  missed: "missed",
  unanswered: "not answered",
};

function tileState(session: Session, q: Question): TileState {
  if (q.id === session.current) return "current";
  const a = attemptOf(session, q.id);
  if (a.status !== "answered") return "unanswered";
  return a.correct ? "correct" : "missed";
}

function groupByTopic(questions: Question[]): { topic: string; questions: Question[] }[] {
  const groups = new Map<string, Question[]>();
  for (const q of questions) groups.set(q.topic, [...(groups.get(q.topic) ?? []), q]);
  return [...groups].map(([topic, qs]) => ({ topic, questions: qs }));
}

export default function Navigator({
  questions,
  session,
  onSelect,
  summary,
}: {
  questions: Question[];
  session: Session;
  onSelect: (q: Question) => void;
  summary: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current!;
    const update = () => {
      el.toggleAttribute("data-more-start", el.scrollLeft > 1);
      el.toggleAttribute("data-more-end", el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [questions, session.current]);

  return (
    <nav className="navigator" aria-label="Questions">
      <div className="navigator-scroll" ref={scroller}>
        {groupByTopic(questions).map((g) => (
          <div key={g.topic} className="nav-group" role="group" aria-label={g.topic}>
            <span className="nav-topic">{g.topic}</span>
            <div className="nav-tiles">
              {g.questions.map((q) => {
                const state = tileState(session, q);
                const answered = attemptOf(session, q.id);
                const result = answered.status === "answered" ? (answered.correct ? "correct" : "missed") : null;
                return (
                  <button
                    key={q.id}
                    className="tile"
                    data-state={state}
                    aria-current={state === "current" ? "true" : undefined}
                    aria-label={`Question ${q.number}, ${state === "current" ? `current${result ? `, ${result}` : ""}` : TILE_LABEL[state]}`}
                    onClick={() => onSelect(q)}
                  >
                    {q.number}
                    {state === "correct" && (
                      <span className="tile-check">
                        <Check size={10} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="nav-summary">{summary}</p>
    </nav>
  );
}
