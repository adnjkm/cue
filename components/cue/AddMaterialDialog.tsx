"use client";

import { useId, useState } from "react";
import { db, useLive } from "@/lib/db";
import type { CourseId, MaterialId, MaterialKind } from "@/lib/domain";
import { fileProblem, ingestFile } from "@/lib/materials";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorLine } from "./bits";

const KINDS: { value: MaterialKind; label: string }[] = [
  { value: "slides", label: "Slides" },
  { value: "textbook", label: "Textbook" },
  { value: "handout", label: "Handout" },
  { value: "notes", label: "Notes" },
  { value: "problemSet", label: "Problem set" },
  { value: "syllabus", label: "Syllabus" },
  { value: "other", label: "Other" },
];

/** The shared way to add course material: pick a file, a course and a kind; lib/materials does the rest. */
export function AddMaterialDialog({
  open,
  onOpenChange,
  courseId,
  defaultKind = "slides",
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId?: CourseId;
  defaultKind?: MaterialKind;
  onAdded?: (id: MaterialId) => void;
}) {
  const courses = useLive(() => db.courses.toArray(), []) ?? [];
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState<CourseId | null>(courseId ?? null);
  const [kind, setKind] = useState<MaterialKind>(defaultKind);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileId = useId();
  const titleId = useId();
  const chosenCourse = course ?? courseId ?? courses[0]?.id ?? null;

  async function add() {
    if (!file || !chosenCourse) return;
    setError(null);
    setProgress("Opening the file");
    try {
      const id = await ingestFile(file, { courseId: chosenCourse, kind, ...(title.trim() ? { title: title.trim() } : {}) }, (p) => setProgress(p.message));
      onAdded?.(id);
      onOpenChange(false);
      setFile(null);
      setTitle("");
    } catch (e) {
      setError(fileProblem(e, file.name));
    } finally {
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add material</DialogTitle>
          <DialogDescription>Slides, textbook chapters, handouts or notes. Cue reads them on this device.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label htmlFor={fileId} className="flex flex-col gap-1.5 text-sm leading-4 text-graphite">
            File
            <Input id={fileId} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 text-sm leading-4 text-graphite">
              <span>Course</span>
              <Select items={courses.map((c) => ({ value: c.id, label: c.code }))} value={chosenCourse} onValueChange={(v) => setCourse(v as CourseId | null)}>
                <SelectTrigger aria-label="Course" className="w-full">
                  <SelectValue placeholder="Pick a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 text-sm leading-4 text-graphite">
              <span>Kind</span>
              <Select items={KINDS} value={kind} onValueChange={(v) => v && setKind(v as MaterialKind)}>
                <SelectTrigger aria-label="Kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label htmlFor={titleId} className="flex flex-col gap-1.5 text-sm leading-4 text-graphite">
            Title (optional)
            <Input id={titleId} value={title} placeholder="Lecture 8 slides" onChange={(e) => setTitle(e.target.value)} />
          </label>
          {progress && (
            <p role="status" className="text-sm leading-5 text-graphite">
              {progress}
            </p>
          )}
          {error && <ErrorLine title={error} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!file || !chosenCourse || progress !== null} onClick={add}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
