"use client";

import { useId, useState } from "react";
import { fmtUsd, useAiStatus } from "@/lib/ai";
import { gradeOf } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SetData } from "./data";
import type { WriteRequest } from "./generation";
import { topicsOf } from "./model";

const MISSED = "missedMost";

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
  onSubmit: (req: WriteRequest) => void;
}) {
  const topics = topicsOf(data.questions);
  const hasMiss = (t: string) =>
    data.questions.some((q) => {
      const g = gradeOf(q, data.attempts.get(q.id));
      return (t === MISSED || q.topic === t) && g.status === "answered" && !g.correct;
    });
  const [topic, setTopic] = useState<string>(defaultTopic ?? MISSED);
  const [count, setCount] = useState<"3" | "5" | "10">("5");
  const [missedOnly, setMissedOnly] = useState(() => hasMiss(defaultTopic ?? MISSED));
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
            onSubmit({ kind: "write", topic, count: Number(count) as 3 | 5 | 10, missedOnly, ...(note.trim() ? { note: note.trim() } : {}) });
            onOpenChange(false);
          }}
        >
          <div className="flex flex-col gap-1.5 text-sm leading-4 text-graphite">
            <span>Topic</span>
            <Select items={[{ value: MISSED, label: "Topics I missed most" }, ...topics.map((t) => ({ value: t, label: t }))]} value={topic}
              onValueChange={(v) => {
                if (!v) return;
                setTopic(v as string);
                setMissedOnly(hasMiss(v as string));
              }}
            >
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
