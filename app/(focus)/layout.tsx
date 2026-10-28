import { AppShell } from "@/components/cue/shell";
import { storedSidebarOpen } from "@/lib/sidebar-cookie";

/** Task screens fill the window beside the same collapsible sidebar; collapsing it gives them the full width. */
export default async function FocusLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell storedOpen={await storedSidebarOpen()} focus>
      {children}
    </AppShell>
  );
}
