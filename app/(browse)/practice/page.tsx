import type { Metadata } from "next";
import { PracticeIndex } from "@/features/practice";

export const metadata: Metadata = { title: "Practice · Cue" };

export default function PracticePage() {
  return <PracticeIndex />;
}
