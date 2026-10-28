import "server-only";
import { defineTasks } from "@/lib/ai/define";

/** Study sessions AI tasks, registered as "study.<name>" by lib/ai/registry.ts. Stub until the feature lands. */
export const studyTasks = defineTasks("study", {});
