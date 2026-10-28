import type { SampleScenario, TimeZone } from "@/lib/domain";

export interface SampleSummary {
  courses: number;
  events: number;
  authoredBlocks: number;
}

export async function seedSampleSemester(opts: { now: number; zone: TimeZone; scenario?: SampleScenario }): Promise<SampleSummary> {
  throw new Error(`seedSampleSemester(${opts.scenario ?? "default"}) lands with lib/sample`);
}

export async function resetAll(): Promise<void> {
  throw new Error("resetAll lands with lib/sample");
}
