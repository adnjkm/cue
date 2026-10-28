import "server-only";
import { z } from "zod";
import { defineTasks, jsonTask } from "@/lib/ai/define";

const briefInput = z.object({
  sessions: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        when: z.string().max(40),
        reason: z.string().max(200),
        status: z.enum(["upcoming", "now", "inProgress", "done", "missed", "skipped"]),
      }),
    )
    .min(1)
    .max(12),
  nextTest: z.object({ course: z.string().min(1).max(20), label: z.string().min(1).max(80), daysUntil: z.number().int().min(0).max(400) }).optional(),
  ruleBased: z.object({ headline: z.string().min(1).max(200), subline: z.string().min(1).max(400) }),
});

const briefOutput = z.object({
  headline: z.string().trim().min(1).max(120),
  subline: z.string().trim().min(1).max(240),
});

type BriefInput = z.infer<typeof briefInput>;

const BRIEF_SYSTEM = `You write the brief at the top of Cue's Today screen: a headline and a subline under it. Cue is a study planner; the reader is a university student who opened it to see what to do now.

You receive today's study sessions in order (title, time, reason, status), the test that shaped the plan when there is one, and a rule-based draft that is already correct.

Reply with JSON: {"headline": string, "subline": string}.
- "headline": keep the draft headline's facts exactly: the number of sessions and which one to start with, resume or do next. Two short sentences, at most 60 characters.
- "subline": one or two sentences, at most 170 characters. First say why today is ordered this way, naming the test and how many days away it is when one is given. Then say what is ready for the next session. If a session was missed, say so and that Reschedule in the list moves it.
- Use only facts from the input. Never invent materials, times, grades, page numbers or deadlines.
- Speak to the student as "you" and call the app "Cue". Sentence case, plain words, no emoji, no exclamation marks, no dashes used as punctuation, no markdown.
- If the draft already reads well, return it unchanged.`;

function briefUser(input: BriefInput): string {
  const sessions = input.sessions.map((s) => `- ${s.when} · ${s.title} · ${s.reason} · ${s.status}`).join("\n");
  const test = input.nextTest ? `${input.nextTest.course} ${input.nextTest.label} in ${input.nextTest.daysUntil} days` : "none";
  return [`Sessions today:\n${sessions}`, `Test behind the next session: ${test}`, `Draft headline: ${input.ruleBased.headline}`, `Draft subline: ${input.ruleBased.subline}`].join("\n\n");
}

/** Today's tasks, registered as "today.<name>" by lib/ai/registry.ts. */
export const todayTasks = defineTasks("today", {
  /** Rewords the rule-based brief. Optional: Today renders the rule text first and keeps it on any failure. */
  brief: jsonTask({
    profile: "chat",
    maxTokens: 300,
    input: briefInput,
    output: briefOutput,
    prompt: (input) => ({ system: BRIEF_SYSTEM, user: briefUser(input) }),
    example: {
      sessions: [
        { title: "Review — Recursion & tree traversal", when: "10:30–11:15am", reason: "Review 1 day after lecture", status: "upcoming" },
        { title: "Mid-week review — Memory & learning", when: "2–2:30pm", reason: "Mid-week review", status: "upcoming" },
        { title: "Work block — Problem Set 4", when: "7–9pm", reason: "Due Thu · Problem Set 4", status: "upcoming" },
      ],
      nextTest: { course: "CSC148", label: "Midterm", daysUntil: 10 },
      ruleBased: {
        headline: "Three sessions today. Start with recursion.",
        subline: "Your CSC148 midterm is in 10 days, so Cue moved this morning's review up. Everything you need is already pulled from yesterday's lecture.",
      },
    },
    // The draft is already the Paper copy, so mock mode shows exactly what the walkthrough asserts.
    mock: ({ ruleBased }) => ({ headline: ruleBased.headline, subline: ruleBased.subline }),
  }),
});
