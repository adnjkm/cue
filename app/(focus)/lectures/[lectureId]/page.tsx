import { StubPage } from "@/components/cue";
import { tid } from "@/features/lectures/testids";

export default async function LecturePage({ params }: PageProps<"/lectures/[lectureId]">) {
  const { lectureId } = await params;
  return <StubPage focus title="Lecture" testId={tid.main}>{<p className="text-sm leading-5 text-graphite">{decodeURIComponent(lectureId)}</p>}</StubPage>;
}
