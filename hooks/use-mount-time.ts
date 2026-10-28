import { useState } from "react";

/** When this component mounted. Rows written after it are new to the person looking, so only those animate in. */
export function useMountTime(): number {
  const [at] = useState(() => Date.now());
  return at;
}
