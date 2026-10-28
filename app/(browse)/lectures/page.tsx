import type { Metadata } from "next";
import { LecturesIndex } from "@/features/lectures/LecturesIndex";

export const metadata: Metadata = { title: "Lecture notes · Cue" };

export default function LecturesPage() {
  return <LecturesIndex />;
}
