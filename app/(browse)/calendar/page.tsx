import { StubPage } from "@/components/cue";
import { tid } from "@/features/calendar/testids";

export default function CalendarPage() {
  return <StubPage title="Calendar" testId={tid.main} />;
}
