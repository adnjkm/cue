"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The visible way to collapse the sidebar to its icon rail and back; Cmd/Ctrl+B does the same. */
export function SidebarToggle() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const button = (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={collapsed ? label : undefined}
      aria-expanded={!collapsed}
      aria-keyshortcuts="Meta+B Control+B"
      className={cn(
        "flex h-[34px] w-full cursor-pointer items-center gap-3 rounded-sm px-2.5 text-left text-sm leading-4 text-graphite transition-colors duration-[120ms] ease-standard hover:bg-wash hover:text-ink",
        collapsed && "w-9 justify-center px-0",
      )}
    >
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      {!collapsed && <span>{label}</span>}
    </button>
  );
  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
