import { StudySession } from "@/features/study";
import type { BlockId, ViewerTab } from "@/lib/domain";

const TABS: readonly string[] = ["slides", "transcript", "textbook", "handout"] satisfies ViewerTab[];

export default async function StudySessionPage({ params, searchParams }: PageProps<"/study/[blockId]">) {
  const [{ blockId }, query] = await Promise.all([params, searchParams]);
  const tab = typeof query.tab === "string" && TABS.includes(query.tab) ? (query.tab as ViewerTab) : undefined;
  return <StudySession blockId={decodeURIComponent(blockId) as BlockId} start={query.start === "1"} tab={tab} />;
}
