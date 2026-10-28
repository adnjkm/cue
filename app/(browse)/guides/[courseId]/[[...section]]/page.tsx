import type { Metadata } from "next";
import { GuidePage } from "@/features/guides/GuidePage";

type Props = PageProps<"/guides/[courseId]/[[...section]]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return { title: `${decodeURIComponent(courseId).toUpperCase()} · Study guide · Cue` };
}

export default async function Page({ params }: Props) {
  const { courseId, section } = await params;
  return <GuidePage courseParam={decodeURIComponent(courseId)} slug={section?.join("/")} />;
}
