import { StubPage } from "@/components/cue";
import { tid } from "@/features/study/testids";

export default function StudyIndexPage() {
  return <StubPage title="Study sessions" testId={tid.main} />;
}
