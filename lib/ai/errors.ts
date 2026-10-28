import type { AiErrorKind } from "@/lib/domain";

export type { AiErrorKind };

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly retryAfterMs?: number,
    /** For budget errors: the configured cap, so copy never hard-codes "$30". */
    readonly capUsd?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export const STATUS_OF: Record<Exclude<AiErrorKind, "offline" | "aborted">, number> = {
  bad_input: 400,
  missing_key: 500,
  budget: 402,
  rate_limited: 429,
  too_large: 413,
  bad_output: 502,
  upstream: 502,
};

export function fmtUsd(usd: number): string {
  return Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`;
}

/** The one place UI copy for AI errors lives. */
export function errorCopy(e: AiError): { title: string; detail?: string; retry: boolean } {
  switch (e.kind) {
    case "budget":
      return e.capUsd === undefined
        ? {
            title: "The spending cap can't be checked, so Cue paused model calls.",
            detail: "Set SPEND_CAP_USD to a number in .env.local (on Vercel, also add the Upstash Redis keys), then restart the server.",
            retry: false,
          }
        : { title: `The ${fmtUsd(e.capUsd)} spending cap is reached.`, detail: "To keep going, raise SPEND_CAP_USD in .env.local and restart the server.", retry: false };
    case "rate_limited":
      return { title: "Cue is busy right now.", detail: "Try again in a moment.", retry: true };
    case "offline":
      return { title: "You're offline.", detail: "Reconnect and try again.", retry: true };
    case "missing_key":
      return { title: "Cue's model isn't set up on this server.", detail: "Add NEBIUS_API_KEY to .env.local.", retry: false };
    case "too_large":
      return { title: "That's too much to send at once.", detail: "Try fewer pages.", retry: false };
    case "bad_output":
      return { title: "Cue's answer didn't come through cleanly.", retry: true };
    case "bad_input":
      return { title: "The server refused that request.", detail: "Reload the page and try again.", retry: true };
    case "aborted":
      return { title: "Stopped.", retry: true };
    case "upstream":
      return { title: "Couldn't reach Cue's model.", retry: true };
  }
}
