import { StubPage } from "@/components/cue";
import { tid } from "@/features/guides/testids";

export default async function GuidePage({ params }: PageProps<"/guides/[courseId]/[[...section]]">) {
  const { courseId } = await params;
  return <StubPage title={`${decodeURIComponent(courseId)} · Study guide`} testId={tid.main} />;
}
