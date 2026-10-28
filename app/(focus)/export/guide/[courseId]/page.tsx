import { StubPage } from "@/components/cue";
import { tid } from "@/features/guides/testids";

export default async function GuideExportPage({ params }: PageProps<"/export/guide/[courseId]">) {
  const { courseId } = await params;
  return <StubPage focus title={`${decodeURIComponent(courseId)} · Study guide`} testId={tid.main} />;
}
