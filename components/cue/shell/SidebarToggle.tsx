"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** The visible way to collapse the sidebar to its icon rail and back, at the top right of the sidebar; Cmd/Ctrl+B does the same. */
export function SidebarToggle() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={label}
            aria-expanded={!collapsed}
            aria-keyshortcuts="Meta+B Control+B"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-graphite transition-colors duration-[120ms] ease-standard hover:bg-wash hover:text-ink"
          />
        }
      >
        <Icon size={16} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side={collapsed ? "right" : "bottom"}>{label}</TooltipContent>
    </Tooltip>
  );
}
