"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { sourceLabel, sourcePeek, useSourcePeek } from "@/lib/sources";
import { TID } from "@/lib/testids";
import { SourceView } from "./SourceView";

/** Opens page and transcript sources over the current screen, so a running session or paper is never lost. */
export function SourcePeek() {
  const source = useSourcePeek();
  return (
    <Sheet open={source !== null} onOpenChange={(open) => !open && sourcePeek.close()}>
      <SheetContent side="right" data-testid={TID.source.peek} className="gap-0 overflow-y-auto border-rule p-0 shadow-none data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]">
        {source && (
          <>
            <SheetHeader className="gap-1 border-b border-rule px-6 pt-6 pb-4">
              <SheetTitle className="text-lg leading-6 font-normal tracking-display text-ink">{sourceLabel(source, "chip")}</SheetTitle>
              <SheetDescription className="text-sm leading-4 text-graphite">{sourceLabel(source, "meta")}</SheetDescription>
            </SheetHeader>
            <SourceView source={source} className="px-6 py-5" />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
