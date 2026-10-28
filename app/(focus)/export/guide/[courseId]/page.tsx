import type { Metadata } from "next";
import { ExportPage } from "@/features/guides/ExportPage";

type Props = PageProps<"/export/guide/[courseId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return { title: `${decodeURIComponent(courseId).toUpperCase()} study guide` };
}

export default async function Page({ params }: Props) {
  const { courseId } = await params;
  return <ExportPage courseParam={decodeURIComponent(courseId)} />;
}
