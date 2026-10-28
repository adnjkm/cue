import { StubPage } from "@/components/cue";
import { tid } from "@/features/study/testids";

export default async function StudySessionPage({ params }: PageProps<"/study/[blockId]">) {
  const { blockId } = await params;
  return <StubPage focus title="Study session" testId={tid.main}>{<p className="text-sm leading-5 text-graphite">{decodeURIComponent(blockId)}</p>}</StubPage>;
}
