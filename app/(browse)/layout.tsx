import { BrowseShell } from "@/components/cue/shell";

export default function BrowseLayout({ children }: LayoutProps<"/">) {
  return <BrowseShell>{children}</BrowseShell>;
}
