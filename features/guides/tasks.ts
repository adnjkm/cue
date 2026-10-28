import "server-only";
import { defineTasks } from "@/lib/ai/define";

/** Study guides AI tasks, registered as "guide.<name>" by lib/ai/registry.ts. Stub until the feature lands. */
export const guideTasks = defineTasks("guide", {});
