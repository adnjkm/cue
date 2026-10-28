import { PracticeScreen } from "@/features/practice";
import type { SetId } from "@/lib/domain";

export default async function PracticeSetPage({ params }: PageProps<"/practice/[setId]">) {
  const { setId } = await params;
  return <PracticeScreen setId={decodeURIComponent(setId) as SetId} />;
}
