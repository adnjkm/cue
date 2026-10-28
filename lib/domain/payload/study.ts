import type { SourceRef } from "../sources";
import type { StepKind } from "../study";

export interface PlanStep {
  /** "Re-read key slides". */
  title: string;
  kind: StepKind;
  minutes: number;
  source?: SourceRef;
  /** "Why does preorder need the empty-tree check first?" */
  check?: string;
}

/** Step minutes sum to the block's focus minutes (block minus Pomodoro breaks). */
export interface SessionPlan {
  steps: readonly PlanStep[];
  /** The transcript moment shown under the material. */
  moment?: { ref: Extract<SourceRef, { kind: "transcript" }>; quote: string; examHint: boolean };
}
