import type { Metadata } from "next";
import { TodayPage } from "@/features/today/TodayPage";

export const metadata: Metadata = { title: "Today · Cue" };

export default function Page() {
  return <TodayPage />;
}
