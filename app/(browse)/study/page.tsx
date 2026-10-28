import type { Metadata } from "next";
import { StudyIndex } from "@/features/study";

export const metadata: Metadata = { title: "Study sessions · Cue" };

export default function StudyIndexPage() {
  return <StudyIndex />;
}
