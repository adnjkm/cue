"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ai, aiItems, AiError, fmtUsd, useAiStatus } from "@/lib/ai";
import { gradeOf, type GenerationScope, type Question } from "@/lib/domain";
import { refsFor, retrieve } from "@/lib/retrieval";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { appendQuestion, type SetData } from "./data";
import { topicsOf } from "./model";

const MISSED = "missedMost";
type Request = { topic: string | typeof MISSED; count: 3 | 5 | 10; missedOnly: boolean; note?: string };

function missedMost(data: SetData): string | null {
  const misses = new Map<string, number>();
  for (const q of data.questions) {
    const g = gradeOf(q, data.attempts.get(q.id));
    if (g.status === "answered" && !g.correct) misses.set(q.topic, (misses.get(q.topic) ?? 0) + 1);
  }
  return [...misses].sort((a, b) => b[1] - a[1])[0]?.[0] ?? data.questions[0]?.topic ?? null;
}

/**
 * Writes new questions in the paper's style from course material. Each streamed question is re-answered
 * by a second call and dropped when the answers disagree, so a wrong key never reaches the student.
 */
export function useGenerator(data: SetData) {
  const [pending, setPending] = useState(0);
  const [topic, setTopic] = useState<string | null>(null);
  const [error, setError] = useState<AiError | null>(null);
  const last = useRef<Request | null>(null);

  const start = useCallback(
    async (req: Request) => {
      last.current = req;
      const resolved = req.topic === MISSED ? missedMost(data) : req.topic;
      if (!resolved) return;
      setError(null);
      setTopic(resolved);
      setPending(req.count);
      try {
        const scope: GenerationScope = { kind: "topic", courseId: data.set.courseId ?? ("GENERAL" as never), topic: req.topic, missedOnly: req.missedOnly, count: req.count, ...(req.note ? { note: req.note } : {}) };
        const inTopic = data.questions.filter((q) => q.topic === resolved && (!req.missedOnly || gradeOf(q, data.attempts.get(q.id)).status !== "unanswered"));
        const passages = await retrieve({ courseId: data.set.courseId, text: `${resolved} ${inTopic.map((q) => q.prompt).join(" ").slice(0, 600)}`, k: 8, latency: "thorough" });
        let lastNumber = Math.max(0, ...data.questions.map((q) => Number(q.number) || 0));
        for await (const item of aiItems("practice.generate", { scope, style: inTopic.slice(0, 6).map((q) => ({ prompt: q.prompt, options: q.options.map((o) => ({ ...o })) })), passages, count: req.count, ...(req.note ? { note: req.note } : {}) })) {
          setPending((n) => Math.max(0, n - 1));
          const check = await ai("practice.check", { prompt: item.prompt, options: item.options });
          if (check.answer !== item.answer) continue;
          lastNumber += 1;
          const from = refsFor(item.sources, passages);
          const question: Omit<Question, "id" | "setId" | "order"> = {
            number: String(lastNumber),
            topic: resolved,
            type: "multipleChoice",
            prompt: item.prompt,
            options: item.options,
            key: { source: "model", answer: item.answer },
            origin: { kind: "generated", from },
          };
          await appendQuestion(data.set.id, question, {
            answer: item.answer,
            explanation: item.steps.map((s) => s.text).join(" ") || `The answer is ${item.answer}.`,
            steps: item.steps,
            whyNot: item.whyNot,
            resources: from,
            provenance: { by: "model", ...(from[0] ? { groundedIn: from[0] } : {}) },
          });
        }
      } catch (e) {
        setError(e instanceof AiError ? e : new AiError("upstream", String(e)));
      } finally {
        setPending(0);
      }
    },
    [data],
  );

  return {
    pending,
    topic,
    error,
    start: (req: Request) => void start(req),
    retry: () => last.current && void start(last.current),
  };
}

export function WriteQuestionsDialog({
  open,
  onOpenChange,
  data,
  defaultTopic,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SetData;
  defaultTopic: string | null;
  onSubmit: (req: Request) => void;
}) {
  const topics = topicsOf(data.questions);
  const [topic, setTopic] = useState<string>(defaultTopic ?? MISSED);
  const [count, setCount] = useState<"3" | "5" | "10">("5");
  const [missedOnly, setMissedOnly] = useState(false);
  const [note, setNote] = useState("");
  const status = useAiStatus();
  const noteId = useId();
  const missedId = useId();
  const cap = status?.spend?.capUsd;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Write new questions</DialogTitle>
          <DialogDescription>Cue writes multiple-choice questions in the style of this paper, from your course material.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ topic, count: Number(count) as 3 | 5 | 10, missedOnly, ...(note.trim() ? { note: note.trim() } : {}) });
            onOpenChange(false);
          }}
        >
          <div className="flex flex-col gap-1.5 text-sm leading-4 text-graphite">
            <span>Topic</span>
            <Select items={[{ value: MISSED, label: "Topics I missed most" }, ...topics.map((t) => ({ value: t, label: t }))]} value={topic} onValueChange={(v) => v && setTopic(v as string)}>
              <SelectTrigger aria-label="Topic for new questions" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value={MISSED}>Topics I missed most</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 text-sm leading-4 text-graphite">
            <span id={`${noteId}-count`}>How many</span>
            <ToggleGroup aria-labelledby={`${noteId}-count`} value={[count]} onValueChange={(v: string[]) => v[0] && setCount(v[0] as "3" | "5" | "10")}>
              {(["3", "5", "10"] as const).map((n) => (
                <ToggleGroupItem key={n} value={n} className="h-8 min-w-12 px-3 text-sm aria-pressed:bg-control aria-pressed:font-medium aria-pressed:text-ink data-pressed:bg-control">
                  {n}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <label htmlFor={missedId} className="flex items-center gap-2 text-sm leading-4 text-ink">
            <Checkbox id={missedId} checked={missedOnly} onCheckedChange={(v) => setMissedOnly(Boolean(v))} />
            Focus on questions I missed
          </label>
          <label htmlFor={noteId} className="flex flex-col gap-1.5 text-sm leading-4 text-graphite">
            Anything specific?
            <Textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: harder, with code tracing" className="min-h-16" />
          </label>
          <DialogFooter className="flex-col items-stretch gap-3 sm:flex-col">
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Write questions</Button>
            </div>
            <p className="text-right text-sm leading-4 text-graphite">Uses Nemotron.{cap !== undefined ? ` Counts toward the ${fmtUsd(cap)} model budget.` : ""}</p>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
