"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NAV, navKeyFor, type NavKey } from "@/lib/routes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Wordmark } from "./Wordmark";

/**
 * The wordmark and the six nav items. The docked sidebar, its icon rail and the phone Sheet all render this,
 * so they never drift. The phone Sheet passes `wave={false}` so opening it never replays the wave.
 */
export function AppNav({
  collapsed = false,
  wave = true,
  badges,
  onNavigate,
}: {
  collapsed?: boolean;
  wave?: boolean;
  badges?: Partial<Record<NavKey, ReactNode>>;
  onNavigate?: () => void;
}) {
  const active = navKeyFor(usePathname());
  return (
    <div className="flex flex-col gap-9">
      <Wordmark collapsed={collapsed} wave={wave} />
      <nav aria-label="Main">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const isActive = item.key === active;
            const Icon = item.icon;
            const link = (
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                data-active={isActive || undefined}
                onClick={onNavigate}
                className={cn(
                  "flex h-[34px] items-center gap-3 rounded-sm px-2.5 text-sm leading-4 text-graphite transition-colors duration-[120ms] ease-standard hover:bg-wash hover:text-ink data-active:bg-wash data-active:font-medium data-active:text-ink",
                  collapsed && "w-9 justify-center px-0",
                )}
              >
                <Icon size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                {!collapsed && badges?.[item.key]}
              </Link>
            );
            return (
              <li key={item.key}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger render={link} />
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
