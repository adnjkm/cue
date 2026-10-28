import "server-only";
import { defineTasks } from "@/lib/ai/define";

/** Today AI tasks, registered as "today.<name>" by lib/ai/registry.ts. Stub until the feature lands. */
export const todayTasks = defineTasks("today", {});
