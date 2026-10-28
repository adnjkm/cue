import { NavSheet } from "@/components/cue/shell";
import { TID } from "@/lib/testids";

/** Full-bleed task screens: no docked sidebar, so a live transcript or a timed paper never reflows. */
export default function FocusLayout({ children }: LayoutProps<"/">) {
  return (
    <div data-testid={TID.shell.main} className="flex h-dvh min-h-0 flex-col overflow-hidden">
      {children}
      <NavSheet />
    </div>
  );
}
