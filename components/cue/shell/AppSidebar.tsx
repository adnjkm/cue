"use client";

import { useState, type ReactNode } from "react";
import { Sidebar, SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TID } from "@/lib/testids";
import { AppNav } from "./AppNav";
import { DataMenu } from "./DataMenu";
import { useLiveBadges } from "./LiveBadges";
import { SpendMeter } from "./SpendMeter";
import { Wordmark } from "./Wordmark";

function DockedSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const badges = useLiveBadges();
  return (
    <Sidebar collapsible="icon">
      <aside aria-label="Sidebar" className={collapsed ? "flex h-full flex-col justify-between px-2.5 pt-7 pb-6" : "flex h-full flex-col justify-between px-5 pt-7 pb-6"}>
        <AppNav collapsed={collapsed} wave={!isMobile} badges={badges} onNavigate={isMobile ? () => setOpenMobile(false) : undefined} />
        <div className="flex flex-col gap-2">
          {!collapsed && <SpendMeter />}
          <DataMenu collapsed={collapsed} />
        </div>
      </aside>
    </Sidebar>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-rule bg-page px-5 md:hidden">
      <SidebarTrigger aria-label="Open navigation" variant="ghost" size="icon" className="-ml-2" />
      <Wordmark className="px-0" wave />
    </header>
  );
}

/**
 * Browse screens: the 232px sidebar from 1024px, an icon rail from 768px (Cmd/Ctrl+B toggles both),
 * an off-canvas Sheet below. The main column uses document scroll.
 */
export function BrowseShell({ children }: { children: ReactNode }) {
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const [chosen, setChosen] = useState<{ open: boolean; wide: boolean } | null>(null);
  const open = chosen && chosen.wide === wide ? chosen.open : wide;
  return (
    <SidebarProvider open={open} onOpenChange={(next) => setChosen({ open: next, wide })}>
      <DockedSidebar />
      <SidebarInset data-testid={TID.shell.main} className="min-w-0">
        <MobileTopBar />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
