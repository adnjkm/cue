import Link from "next/link";
import { cn } from "@/lib/utils";
import { href } from "@/lib/routes";
import { Mascot } from "./Mascot";

export function Wordmark({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <Link
      href={href.today()}
      aria-label="Cue, Today"
      className={cn("flex h-[26px] items-center gap-2 rounded-sm px-2 text-ink", collapsed && "justify-center px-0", className)}
    >
      {!collapsed && <span className="text-lg leading-6 font-medium tracking-display">cue</span>}
      <Mascot />
    </Link>
  );
}
