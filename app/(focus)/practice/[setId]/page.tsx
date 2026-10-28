import type { Metadata } from "next";
import { MissingSet, PracticeScreen } from "@/features/practice";
import { parseId } from "@/lib/domain";

export const metadata: Metadata = { title: "Practice · Cue" };

export default async function PracticeSetPage({ params, searchParams }: PageProps<"/practice/[setId]">) {
  const [{ setId }, query] = await Promise.all([params, searchParams]);
  const id = parseId.set(decodeURIComponent(setId));
  if (!id) return <MissingSet />;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(query.q);
  const topic = one(query.topic);
  return <PracticeScreen setId={id} link={{ ...(q ? { q } : {}), ...(topic ? { topic } : {}) }} />;
}
