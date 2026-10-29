"use client";

import { useState } from "react";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SampleScenario } from "@/lib/domain";
import { currentZone } from "@/lib/time";
import { setPrefs, useShortcuts } from "@/lib/prefs";
import { exitDemo, startDemo, useDemoActive } from "@/lib/demo";
import { resetAll, seedSampleSemester } from "@/lib/sample";
import { hasStoredData, ReplaceDataDialog, useHasData } from "@/components/cue/sample";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** `?sampleScenario=liveLecture` loads the paused-lecture variant, which the walkthrough's lecture step needs. */
function scenarioFromUrl(): SampleScenario {
  return new URLSearchParams(window.location.search).get("sampleScenario") === "liveLecture" ? "liveLecture" : "default";
}

/** Sidebar footer menu: load the sample semester or wipe everything stored in this browser. */
export function DataMenu({ collapsed = false }: { collapsed?: boolean }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const hasData = useHasData();
  const shortcuts = useShortcuts();
  const demo = useDemoActive();
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  const loadSample = () => run(() => seedSampleSemester({ now: Date.now(), zone: currentZone(), scenario: scenarioFromUrl() }));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          aria-label={collapsed ? "Data" : undefined}
          className={cn(
            "flex h-[34px] w-full cursor-pointer items-center gap-3 rounded-sm px-2.5 text-left text-sm leading-4 text-graphite transition-colors duration-[120ms] ease-standard hover:bg-wash hover:text-ink aria-expanded:bg-wash aria-expanded:text-ink",
            collapsed && "w-9 justify-center px-0",
          )}
        >
          <Database size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          {!collapsed && <span>Data</span>}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={async () => ((await hasStoredData()) ? setConfirmReplace(true) : void loadSample())}>
              {hasData ? "Replace with sample semester…" : "Load sample semester"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConfirmReset(true)}>Reset all data</DropdownMenuItem>
          </DropdownMenuGroup>
          {demo && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => void run(startDemo)}>Restart demo at Tuesday 10:12</DropdownMenuItem>
                <DropdownMenuItem onClick={exitDemo}>Exit demo</DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={shortcuts} onCheckedChange={(on) => void setPrefs("foundation", { shortcuts: on })}>
            Keyboard shortcuts
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all data?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every course, event, recording, uploaded file, study session, practice set and guide in this browser. It can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmReset(false);
                void run(resetAll);
              }}
            >
              Reset all data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReplaceDataDialog open={confirmReplace} onOpenChange={setConfirmReplace} onConfirm={() => void loadSample()} />
    </>
  );
}
