/** Shared test ids, only for regions with no role. Each feature keeps its own in features/<x>/testids.ts. */
export const TID = {
  shell: { main: "shell-main" },
  chat: { thread: "chat-thread" },
  source: { peek: "source-peek" },
} as const;
