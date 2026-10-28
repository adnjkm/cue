import { DEFAULT_PLAN_PREFS, type EventId, type PlanInput, type SampleScenario, type TimeZone, type Topic } from "@/lib/domain";
import { planWindow } from "@/lib/plan/schedule";
import { sampleContext } from "./context";
import { SAMPLE_COURSES, sampleEvents, sampleImport, sampleOverrides } from "./calendar";

/** The sample semester as scheduler input, with no database: what the goldens and Today's brief rules run on. */
export function samplePlanInput(opts: { now: number; zone: TimeZone; scenario?: SampleScenario }): PlanInput {
  const ctx = sampleContext(opts);
  const events = sampleEvents(ctx);
  const imports = [sampleImport(ctx)];
  const overrides = sampleOverrides(ctx);
  const topics = new Map<EventId, Topic>();
  for (const e of events) if (e.kind === "lecture" && e.topic) topics.set(e.id, e.topic);
  return {
    zone: opts.zone,
    window: planWindow(ctx.zone, { imports, events, overrides, sessions: [] }),
    courses: SAMPLE_COURSES,
    events,
    imports,
    topics,
    overrides,
    sessions: [],
    prefs: DEFAULT_PLAN_PREFS,
  };
}
