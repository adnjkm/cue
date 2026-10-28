import type { EpochMs, TimeZone } from "./ids";
import type { EngineId } from "./lectures";
import type { PlanPrefs } from "./plan";
import type { AskMode, PomodoroPrefs } from "./study";

export type WorkstreamKey = "today" | "calendar" | "lectures" | "study" | "practice" | "guides";
export type Owner = "foundation" | WorkstreamKey;

/** default: Tue 27 Oct as drawn on Today. liveLecture: the Tue MAT137 lecture paused at 37:30, for the Paper note-taker state. */
export type SampleScenario = "default" | "liveLecture";

/** One typed slice per owner. lib/prefs is the only writer; lint lets features/<x> write only slice "<x>". */
export interface PrefsByOwner {
  foundation: { zone: TimeZone; plan: PlanPrefs; /** Single-key shortcuts; on unless false. */ shortcuts?: boolean; sample?: { seededAt: EpochMs; scenario: SampleScenario } };
  today: Record<string, never>;
  calendar: Record<string, never>;
  lectures: { engine: EngineId; parakeetConsentAt?: EpochMs };
  study: { pomodoro: PomodoroPrefs; defaultMode: AskMode };
  practice: Record<string, never>;
  guides: Record<string, never>;
}

export type PrefsRow = { [O in Owner]: { owner: O } & PrefsByOwner[O] }[Owner];
