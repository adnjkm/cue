"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { courseActions } from "@/lib/courses";
import type { Course, CourseId, EpochMs } from "@/lib/domain";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { href } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAdhocLecture } from "./data";
import { chooseEngine } from "./engine";
import { PARAKEET_WEIGHTS } from "./engine/protocol";
import { recorder } from "./recorder";

/** "Record a lecture" from the index: pick a course, optionally name the topic, and start. Recording begins before the page changes. */
export function RecordLectureDialog({ open, onOpenChange, courses, suggested }: { open: boolean; onOpenChange: (open: boolean) => void; courses: readonly Course[]; suggested: CourseId | null }) {
  const router = useRouter();
  const prefs = usePrefs("lectures");
  const base = usePrefs("foundation");
  const [courseId, setCourseId] = useState<CourseId | null>(suggested);
  const [code, setCode] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choice = prefs && base ? chooseEngine(prefs, base.sample !== undefined) : null;
  const typed = courses.length === 0;

  /** The error is about the course field, so the field says so and takes focus. */
  function fail(message: string, fieldId: string) {
    setError(message);
    requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
  }

  async function submit() {
    if (!prefs || !choice) return;
    setError(null);
    let course = courseId;
    if (typed) {
      if (!/[A-Za-z]{2,}\s*\d/.test(code)) {
        fail("Enter a course code such as CSC148.", "record-course");
        return;
      }
      course = await courseActions.ensure(code, "manual");
    }
    if (!course) {
      fail("Pick the course this lecture belongs to.", "record-course-trigger");
      return;
    }
    setBusy(true);
    const now = Date.now() as EpochMs;
    const name = topic.trim();
    const id = await createAdhocLecture(course, name ? { full: name, short: name.split(/\s+/)[0] } : null, now);
    if (choice.engine === "parakeet" && prefs.parakeetConsentAt === undefined) await setPrefs("lectures", { engine: "parakeet", parakeetConsentAt: now });
    void recorder.start(id, choice.engine);
    router.push(href.lecture(id));
    onOpenChange(false);
    setBusy(false);
  }

  const engineLine =
    choice?.engine === "demo"
      ? choice.why === "sample"
        ? "Demo transcript: the sample semester replays a recorded lecture, so your microphone stays off."
        : "Demo transcript: Cue replays a recorded lecture instead of listening to your microphone."
      : choice?.consented
        ? "Cue asks for your microphone and transcribes on this device with NVIDIA Parakeet."
        : `Cue asks for your microphone and transcribes on this device with NVIDIA Parakeet. The first recording downloads the speech model once (${Math.round(PARAKEET_WEIGHTS.webgpu.bytes / 1e6)} MB).`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Record a lecture</DialogTitle>
          <DialogDescription>Cue writes a live transcript, flags exam hints and links the coursework the lecture mentions.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {typed ? (
            <Field>
              <FieldLabel htmlFor="record-course">Course code</FieldLabel>
              <Input id="record-course" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CSC148" autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={error ? "record-error" : undefined} />
            </Field>
          ) : (
            <Field>
              <FieldLabel id="record-course-label">Course</FieldLabel>
              <Select items={courses.map((c) => ({ value: c.id, label: c.title ? `${c.code} · ${c.title}` : c.code }))} value={courseId} onValueChange={(v) => setCourseId((v as CourseId | null) ?? null)}>
                <SelectTrigger id="record-course-trigger" aria-labelledby="record-course-label" aria-invalid={error ? true : undefined} aria-describedby={error ? "record-error" : undefined} className="w-full">
                  <SelectValue placeholder="Pick a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title ? `${c.code} · ${c.title}` : c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="record-topic">Topic (optional)</FieldLabel>
            <Input id="record-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Binary search trees" autoComplete="off" />
            <FieldDescription>Leave it empty and Cue names the lecture from what was said.</FieldDescription>
          </Field>
          <p className="text-sm leading-5 text-graphite">{engineLine}</p>
          {error && (
            <p id="record-error" role="alert" className="text-sm leading-5 text-ink">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !choice}>
              Start recording
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
