import type { Metadata } from "next";
import { GuidesIndex } from "@/features/guides/GuidesIndex";

export const metadata: Metadata = { title: "Study guides · Cue" };

export default function Page() {
  return <GuidesIndex />;
}
