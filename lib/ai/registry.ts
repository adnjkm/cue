import "server-only";
import { calendarTasks } from "@/features/calendar/tasks";
import { guideTasks } from "@/features/guides/tasks";
import { lectureTasks } from "@/features/lectures/tasks";
import { practiceTasks } from "@/features/practice/tasks";
import { studyTasks } from "@/features/study/tasks";
import { todayTasks } from "@/features/today/tasks";
import { chatTasks } from "@/lib/chat/tasks";
import { materialTasks } from "@/lib/materials/tasks";
import { retrievalTasks } from "@/lib/retrieval/tasks";

/** Every task the gateway serves. Client types are derived from this with `import type`, so prompts never ship. */
export const registry = {
  ...chatTasks,
  ...retrievalTasks,
  ...materialTasks,
  ...todayTasks,
  ...calendarTasks,
  ...lectureTasks,
  ...studyTasks,
  ...practiceTasks,
  ...guideTasks,
};

export type Registry = typeof registry;
