"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { seedSampleSemester } from "@/lib/sample";
import { currentZone } from "@/lib/time";
import { ReplaceDataDialog } from "./ReplaceDataDialog";
import { hasStoredData, useHasData } from "./useHasData";

/** First-run action: loads the Paper sample semester dated against the current week. When data exists it says so and confirms first. */
export function SampleSemesterButton({ variant = "secondary", className }: { variant?: "default" | "secondary"; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const hasData = useHasData();

  async function load() {
    setBusy(true);
    try {
      await seedSampleSemester({ now: Date.now(), zone: currentZone() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={variant} disabled={busy} className={className} onClick={async () => ((await hasStoredData()) ? setConfirming(true) : void load())}>
        {hasData ? "Replace with sample semester…" : "Try the sample semester"}
      </Button>
      <ReplaceDataDialog open={confirming} onOpenChange={setConfirming} onConfirm={() => void load()} />
    </>
  );
}
