"use client";

import { useState, type Ref } from "react";
import { ClientApiError, streamAsk } from "@/lib/client";
import type { AttemptState, ChatMessage, Question, SolutionState } from "@/lib/types";
import { ChevronRight } from "./icons";
import { Prose } from "./Prose";

export default function AskChat({
  ref,
  question,
  attempt,
  solution,
  messages,
  onMessages,
}: {
  ref: Ref<HTMLInputElement>;
  question: Question;
  attempt: AttemptState;
  solution?: SolutionState;
  messages: ChatMessage[];
  onMessages: (messages: ChatMessage[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const answered = attempt.status === "answered" ? attempt : null;

  const suggestions = !answered
    ? ["Give me a hint", "What is this testing?"]
    : answered.correct
      ? ["Explain it more simply", "Show a similar example"]
      : [`Why not ${answered.choice}?`, `Why is ${question.answer} right?`];

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setDraft("");
    setBusy(true);
    const history = [...messages.filter((m) => m.content.trim()), { role: "user" as const, content }];
    onMessages([...history, { role: "assistant", content: "" }]);
    try {
      await streamAsk(
        {
          question: { prompt: question.prompt, options: question.options, answer: answered ? question.answer : undefined },
          choice: answered?.choice,
          solution: answered && solution?.status === "ready" ? solution.solution : undefined,
          messages: history.slice(-12),
        },
        (reply) => onMessages([...history, { role: "assistant", content: reply }]),
      );
    } catch (e) {
      const reason =
        e instanceof ClientApiError && e.api.kind === "rate_limited"
          ? "Nemotron is rate limited. Wait a minute and ask again."
          : "Couldn't reach Nemotron Lightning. Ask again in a moment.";
      onMessages([...history, { role: "assistant", content: reason }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask">
      <h3 className="ask-label">Ask why</h3>
      {messages.length === 0 ? (
        <ul className="ask-rows">
          {suggestions.map((s) => (
            <li key={s}>
              <button className="ask-row row-button" onClick={() => void send(s)}>
                {s}
                <ChevronRight />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="ask-rows chat" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className="ask-row message" data-role={m.role}>
              {m.content ? <Prose text={m.content} /> : <span className="muted">Thinking…</span>}
            </li>
          ))}
        </ol>
      )}
      <form
        className="ask-row ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <label className="visually-hidden" htmlFor={`ask-${question.id}`}>
          Ask Nemotron about this question
        </label>
        <input
          id={`ask-${question.id}`}
          ref={ref}
          className="ask-input"
          value={draft}
          autoComplete="off"
          placeholder={answered ? "Ask a follow-up" : "Ask for a hint"}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="ask-send" type="submit" aria-label="Ask" disabled={busy || !draft.trim()}>
          <ChevronRight />
        </button>
      </form>
    </div>
  );
}
