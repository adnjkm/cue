"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { ai, AiError, errorCopy } from "@/lib/ai";
import { ids, type CourseId, type EpochMs, type Zone } from "@/lib/domain";
import { renderPages, sha256Hex, toPageImage, UnreadableError } from "@/lib/materials";
import { commitImport } from "./commit";
import { parseIcs } from "./ics";
import { ImportError, type ImportProposal } from "./proposal";
import { expandTimetable, termAround } from "./timetable";
import { shortDay } from "./model";

/** The import's UI states (architecture 5.2): idle, reading, preview, committing; failure returns to idle with the reason. */
type Step =
  | { kind: "idle"; error?: { title: string; detail?: string } }
  | { kind: "reading"; fileName: string }
  | { kind: "preview"; proposal: ImportProposal; chosen: ReadonlySet<CourseId>; other: boolean; committing: boolean };

const ACCEPT = ".ics,text/calendar,application/pdf,image/png,image/jpeg,image/webp";
const isIcs = (f: File) => /\.ics$/i.test(f.name) || f.type === "text/calendar";
const isTimetable = (f: File) => /\.(pdf|png|jpe?g|webp)$/i.test(f.name) || /^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function read(file: File, zone: Zone, now: EpochMs, signal: AbortSignal): Promise<ImportProposal> {
  const importId = ids.importBatch();
  if (isIcs(file)) return parseIcs(await file.text(), { zone, importId, fileName: file.name });
  if (!isTimetable(file)) throw new ImportError("unsupported");
  const term = termAround(zone.dayOf(now));
  const pages = await Promise.all((await renderPages(file, { maxPages: 3 })).map(toPageImage));
  const timetable = await ai("calendar.read", { pages, termStart: term.start }, { signal });
  return expandTimetable(timetable, { zone, importId, materialId: ids.material(await sha256Hex(file)), term });
}

function failure(e: unknown): { title: string; detail?: string } {
  if (e instanceof ImportError) return { title: e.message };
  if (e instanceof AiError) {
    const copy = errorCopy(e);
    return { title: copy.title, detail: copy.retry ? `${copy.detail ?? ""} Choose the file again to retry.`.trim() : copy.detail };
  }
  if (e instanceof UnreadableError) return { title: "Couldn't read that file. Try a PDF or an .ics file." };
  return { title: "Couldn't read that file. Try a PDF or an .ics file." };
}

/** "Add schedule": an .ics file, or a timetable image or PDF read by Nemotron, previewed per course before anything is written. */
export function ImportDialog({ open, onOpenChange, zone, now }: { open: boolean; onOpenChange: (open: boolean) => void; zone: Zone; now: EpochMs }) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) return;
    abort.current?.abort();
    const t = setTimeout(() => setStep({ kind: "idle" }), 150);
    return () => clearTimeout(t);
  }, [open]);

  async function choose(file: File | undefined) {
    if (!file) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStep({ kind: "reading", fileName: file.name });
    try {
      const proposal = await read(file, zone, now, controller.signal);
      if (controller.signal.aborted) return;
      setStep({ kind: "preview", proposal, chosen: new Set(proposal.courses.map((c) => c.id)), other: true, committing: false });
    } catch (e) {
      if (controller.signal.aborted) return;
      setStep({ kind: "idle", error: failure(e) });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  async function add() {
    if (step.kind !== "preview") return;
    setStep({ ...step, committing: true });
    try {
      const done = await commitImport(step.proposal, { courses: step.chosen, other: step.other && step.proposal.other.length > 0 }, Date.now() as EpochMs);
      onOpenChange(false);
      const id = toast.add({
        title: done.courses > 0 ? `Added ${plural(done.courses, "course")}. Cue planned ${plural(done.planned, "study block")}.` : `Added your busy time. Cue planned around it.`,
        timeout: 10_000,
        actionProps: {
          children: "Undo",
          onClick: async () => {
            toast.close(id);
            await done.undo();
          },
        },
      });
    } catch {
      setStep({ ...step, committing: false });
      toast.add({ title: "Couldn't save the schedule. Try Add again; nothing was changed." });
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void choose(e.dataTransfer.files[0]);
  }

  const preview = step.kind === "preview" ? step : null;
  const count = preview ? preview.chosen.size : 0;
  const addLabel = count > 0 ? `Add ${plural(count, "course")}` : "Add busy time";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-labelledby={titleId} className="gap-6 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle id={titleId}>Add schedule</DialogTitle>
          <DialogDescription>Upload a course timetable, a syllabus or an .ics file. Cue plans study time around it.</DialogDescription>
        </DialogHeader>

        <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void choose(e.target.files?.[0])} />

        {step.kind === "idle" && (
          <div className="flex flex-col gap-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              data-dragging={dragging || undefined}
              className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-sm border border-dashed border-border px-6 text-center transition-colors duration-[120ms] ease-standard data-dragging:border-graphite data-dragging:bg-wash"
            >
              <p className="text-sm leading-5 text-ink">Drop a timetable PDF, screenshot or .ics file</p>
              <Button variant="secondary" onClick={() => input.current?.click()}>
                Choose file
              </Button>
            </div>
            {step.error && (
              <div role="alert" className="flex items-start gap-2 text-sm leading-5 text-ink">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                <p>
                  {step.error.title}
                  {step.error.detail && <span className="text-graphite"> {step.error.detail}</span>}
                </p>
              </div>
            )}
          </div>
        )}

        {step.kind === "reading" && (
          <div role="status" className="flex min-h-[200px] flex-col justify-center gap-3 rounded-sm border border-border px-6">
            <p className="text-sm leading-5 text-ink">Reading your schedule…</p>
            <Progress value={null} aria-label={`Reading ${step.fileName}`} className="[&_[data-slot=progress-indicator]]:w-full [&_[data-slot=progress-indicator]]:bg-ink [&_[data-slot=progress-indicator]]:motion-safe:animate-breathe [&_[data-slot=progress-track]]:h-0.5 [&_[data-slot=progress-track]]:bg-rule" />
            <p className="truncate text-sm leading-5 text-graphite">{step.fileName}</p>
          </div>
        )}

        {preview && (
          <div className="flex max-h-[min(420px,50dvh)] flex-col gap-4 overflow-y-auto">
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-sm leading-5 text-graphite">
                Found {plural(preview.proposal.courses.length, "course")}. Uncheck any you don&apos;t want.
                {preview.proposal.assumption && ` ${preview.proposal.assumption}`}
              </legend>
              {preview.proposal.courses.map((c) => (
                <PreviewRow
                  key={c.id}
                  label={c.label}
                  lines={[c.counts, ...c.dated.slice(0, 3), ...(c.dated.length > 3 ? [`and ${c.dated.length - 3} more dates`] : [])]}
                  checked={preview.chosen.has(c.id)}
                  disabled={preview.committing}
                  onChange={(on) => {
                    const chosen = new Set(preview.chosen);
                    if (on) chosen.add(c.id);
                    else chosen.delete(c.id);
                    setStep({ ...preview, chosen });
                  }}
                />
              ))}
              {preview.proposal.other.length > 0 && (
                <PreviewRow
                  label={`Busy time · ${plural(preview.proposal.other.length, "other event")}`}
                  lines={[`Cue plans no study over these, from ${shortDay(zone.dayOf(preview.proposal.other[0].start))}.`]}
                  checked={preview.other}
                  disabled={preview.committing}
                  onChange={(on) => setStep({ ...preview, other: on })}
                />
              )}
            </fieldset>
          </div>
        )}

        {preview && (
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={preview.committing || (count === 0 && !(preview.other && preview.proposal.other.length > 0))} onClick={add}>
              {preview.committing ? "Adding…" : addLabel}
            </Button>
          </DialogFooter>
        )}
        {step.kind === "reading" && (
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({ label, lines, checked, disabled, onChange }: { label: string; lines: readonly string[]; checked: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-sm">
      <Checkbox className="mt-0.5" aria-labelledby={`${id}-label`} aria-describedby={`${id}-detail`} checked={checked} disabled={disabled} onCheckedChange={(on) => onChange(on === true)} />
      <span className="flex min-w-0 flex-col">
        <span id={`${id}-label`} className="text-sm leading-5 font-medium text-ink">
          {label}
        </span>
        <span id={`${id}-detail`} className="flex flex-col text-sm leading-5 text-graphite">
          {lines.filter(Boolean).map((l) => (
            <span key={l}>{l}</span>
          ))}
        </span>
      </span>
    </label>
  );
}
