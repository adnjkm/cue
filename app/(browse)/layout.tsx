import { AppShell } from "@/components/cue/shell";
import { storedSidebarOpen } from "@/lib/sidebar-cookie";

export default async function BrowseLayout({ children }: LayoutProps<"/">) {
  return <AppShell storedOpen={await storedSidebarOpen()}>{children}</AppShell>;
}
