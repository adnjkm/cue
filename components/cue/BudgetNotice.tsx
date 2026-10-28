"use client";

import { AiError, errorCopy } from "@/lib/ai";
import { cn } from "@/lib/utils";

/** Shown where a model call was refused at the cap. The cap comes from the error, so the copy never hard-codes $30. */
export function BudgetNotice({ error, className }: { error: AiError; className?: string }) {
  const copy = errorCopy(error);
  return (
    <div role="status" className={cn("rounded-sm bg-fill px-4 py-3 text-sm leading-5", className)}>
      <p className="text-ink">{copy.title}</p>
      {copy.detail && <p className="text-graphite">{copy.detail}</p>}
    </div>
  );
}
