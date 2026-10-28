import { StubPage } from "@/components/cue";
import { tid } from "@/features/lectures/testids";

export default function LecturesPage() {
  return <StubPage title="Lecture notes" testId={tid.main} />;
}
