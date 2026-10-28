"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AppNav } from "./AppNav";
import { DataMenu } from "./DataMenu";
import { useLiveBadges } from "./LiveBadges";
import { SpendMeter } from "./SpendMeter";

/** Focus screens keep the nav one keystroke away: Cmd/Ctrl+B opens it over the content, so nothing reflows. */
export function NavSheet() {
  const [open, setOpen] = useState(false);
  const badges = useLiveBadges();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "b" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" showCloseButton={false} className="gap-0 border-rule p-0 shadow-none data-[side=left]:w-[232px] data-[side=left]:sm:max-w-[232px]">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Cue screens and data.</SheetDescription>
        </SheetHeader>
        <div className="flex h-full flex-col justify-between px-5 pt-7 pb-6">
          <AppNav badges={badges} onNavigate={() => setOpen(false)} />
          <div className="flex flex-col gap-2">
            <SpendMeter />
            <DataMenu />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
