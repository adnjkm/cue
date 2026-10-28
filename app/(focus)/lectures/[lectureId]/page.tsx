import type { Metadata } from "next";
import { parseId } from "@/lib/domain";
import { LectureScreen } from "@/features/lectures/LectureScreen";

export const metadata: Metadata = { title: "Lecture notes · Cue" };

export default async function LecturePage({ params, searchParams }: PageProps<"/lectures/[lectureId]">) {
  const [{ lectureId }, { t }] = await Promise.all([params, searchParams]);
  const focusAtMs = typeof t === "string" && /^\d{1,9}$/.test(t) ? Number(t) : null;
  return <LectureScreen id={parseId.lecture(decodeURIComponent(lectureId))} focusAtMs={focusAtMs} />;
}
