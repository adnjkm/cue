import type { EmbedOutput, EmbedTask, JsonTask, ListTask } from "./define";
import type { Registry } from "./registry";

export type TaskName = keyof Registry;
export type TaskInput<N extends TaskName> = Registry[N] extends { example: infer I } ? I : never;
export type JsonTaskName = { [N in TaskName]: Registry[N] extends { kind: "json" | "embed" } ? N : never }[TaskName];
export type ListTaskName = { [N in TaskName]: Registry[N] extends { kind: "list" } ? N : never }[TaskName];
export type StreamTaskName = { [N in TaskName]: Registry[N] extends { kind: "stream" } ? N : never }[TaskName];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- inference sites only
export type TaskOutput<N extends JsonTaskName> = Registry[N] extends JsonTask<any, infer O> ? O : Registry[N] extends EmbedTask ? EmbedOutput : never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- inference sites only
export type TaskItem<N extends ListTaskName> = Registry[N] extends ListTask<any, infer T> ? T : never;
