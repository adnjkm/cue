"use client";

import { useState, type ReactNode } from "react";
import { Sidebar, SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TID } from "@/lib/testids";
import { AppNav } from "./AppNav";
import { DataMenu } from "./DataMenu";
import { useLiveBadges } from "./LiveBadges";
import { SidebarToggle } from "./SidebarToggle";
import { SpendMeter } from "./SpendMeter";
import { Wordmark } from "./Wordmark";

function DockedSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const badges = useLiveBadges();
  return (
    <Sidebar collapsible="icon">
      <aside aria-label="Sidebar" className={collapsed ? "flex h-full flex-col justify-between px-2.5 pt-7 pb-6" : "flex h-full flex-col justify-between px-5 pt-7 pb-6"}>
        <AppNav
          collapsed={collapsed}
          wave={!isMobile}
          badges={badges}
          onNavigate={isMobile ? () => setOpenMobile(false) : undefined}
          toggle={isMobile ? undefined : <SidebarToggle />}
        />
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
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-rule bg-page px-5 md:hidden print:hidden">
      <SidebarTrigger aria-label="Open navigation" variant="ghost" size="icon" className="-ml-2" />
      <Wordmark className="px-0" wave />
    </header>
  );
}

/**
 * Every screen: the 232px sidebar from 1024px, an icon rail from 768px, an off-canvas Sheet below. The toggle in
 * the sidebar and Cmd/Ctrl+B collapse and expand it. The choice is kept in the sidebar_state cookie, which the
 * layouts read on the server, so it holds across screens and reloads without a flash. Without a choice the width decides.
 * Browse screens use document scroll; focus screens fill the window and scroll inside themselves.
 */
export function AppShell({ children, storedOpen, focus = false }: { children: ReactNode; storedOpen: boolean | null; focus?: boolean }) {
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const [chosen, setChosen] = useState<boolean | null>(storedOpen);
  const open = chosen ?? wide;
  return (
    <SidebarProvider open={open} onOpenChange={setChosen} className={focus ? "h-dvh min-h-0 overflow-hidden" : undefined}>
      <DockedSidebar />
      {focus ? (
        // Focus screens render their own <main>, so this column is a plain div.
        <div data-testid={TID.shell.main} className="relative flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <MobileTopBar />
          {children}
        </div>
      ) : (
        <SidebarInset data-testid={TID.shell.main} className="min-w-0">
          <MobileTopBar />
          {children}
        </SidebarInset>
      )}
    </SidebarProvider>
  );
}
