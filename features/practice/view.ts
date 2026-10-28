import { gradeOf, type Attempt, type PracticeSet, type Question, type QuestionId } from "@/lib/domain";
import { visibleQuestions } from "./model";

export type View = PracticeSet["view"];

export type ViewAction =
  /** A tile, a `?q=` link, or a resource that names a question. Leaves a filter that would hide it. */
  | { type: "goto"; id: QuestionId }
  /** The arrows and ←/→: printed order within the filter, stopping at the ends. */
  | { type: "step"; by: -1 | 1 }
  /** Next question after answering: the next visible one, else the first visible one still unanswered. */
  | { type: "onward" }
  /** The topic select. The current question stays when the topic still shows it. */
  | { type: "filter"; topic: string | null }
  /** A written question arrived; an empty set starts on it. */
  | { type: "appended"; id: QuestionId };

export interface ViewContext {
  questions: readonly Question[];
  attempts: ReadonlyMap<QuestionId, Pick<Attempt, "choice">>;
}

/** Where the student is in a set. Pure, and returns `view` itself when nothing changes, so callers skip the write. */
export function reduceView(view: View, action: ViewAction, { questions, attempts }: ViewContext): View {
  const visible = visibleQuestions(questions, view.topic);
  const at = visible.findIndex((q) => q.id === view.current);
  const move = (q: Question | undefined): View => (q && q.id !== view.current ? { ...view, current: q.id } : view);
  switch (action.type) {
    case "goto": {
      const q = questions.find((x) => x.id === action.id);
      if (!q) return view;
      if (view.topic !== null && q.topic !== view.topic) return { topic: null, current: q.id };
      return move(q);
    }
    case "step":
      return at < 0 ? move(visible[0]) : move(visible[at + action.by]);
    case "onward": {
      const next = visible[at + 1];
      if (next) return move(next);
      return move(visible.find((q) => q.id !== view.current && gradeOf(q, attempts.get(q.id)).status === "unanswered"));
    }
    case "filter": {
      if (action.topic === view.topic) return view;
      const shown = visibleQuestions(questions, action.topic);
      const keep = shown.some((q) => q.id === view.current);
      return { topic: action.topic, current: keep ? view.current : (shown[0]?.id ?? null) };
    }
    case "appended":
      return view.current === null ? { ...view, current: action.id } : view;
  }
}

/** Where Next question would go, or undefined when every visible question is answered and none follows. */
export function onwardTarget(view: View, ctx: ViewContext): QuestionId | undefined {
  const next = reduceView(view, { type: "onward" }, ctx);
  return next === view ? undefined : (next.current ?? undefined);
}
