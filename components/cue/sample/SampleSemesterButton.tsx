"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { seedSampleSemester } from "@/lib/sample";
import { currentZone } from "@/lib/time";

/** First-run action: loads the Paper sample semester dated against the current week. */
export function SampleSemesterButton({ variant = "secondary", className }: { variant?: "default" | "secondary"; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      disabled={busy}
      className={className}
      onClick={async () => {
        setBusy(true);
        try {
          await seedSampleSemester({ now: Date.now(), zone: currentZone() });
        } finally {
          setBusy(false);
        }
      }}
    >
      Try the sample semester
    </Button>
  );
}
