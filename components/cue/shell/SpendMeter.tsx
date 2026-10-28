"use client";

import { fmtUsd, useAiStatus } from "@/lib/ai";
import { TID } from "@/lib/testids";

/** `$0.03 of $30`, shown only in token-factory mode. The cap comes from the server, never a constant. */
export function SpendMeter() {
  const status = useAiStatus();
  if (status?.mode !== "token-factory" || !status.spend) return null;
  const { spentUsd, capUsd } = status.spend;
  return (
    <p data-testid={TID.shell.spend} title="Token Factory spend, capped on the server" className="px-2.5 text-sm leading-4 text-graphite tabular-nums">
      ${spentUsd.toFixed(2)} of {fmtUsd(capUsd)}
    </p>
  );
}
