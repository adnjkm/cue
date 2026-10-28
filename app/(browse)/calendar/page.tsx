import type { Metadata } from "next";
import { CalendarPage } from "@/features/calendar/CalendarPage";

export const metadata: Metadata = { title: "Calendar · Cue" };

export default function Page() {
  return <CalendarPage />;
}
