import "server-only";
import { z } from "zod";
import type { Passage } from "@/lib/domain";
import { streamTask } from "@/lib/ai/define";
import { passagesBlock, passagesSchema, STYLE } from "@/lib/ai/passages";
import type { StreamEvent } from "@/lib/ai/wire";

export const askInput = z.object({
  scope: z.enum(["study", "liveLecture", "lecture", "question"]),
  mode: z.enum(["quick", "deep"]),
  question: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) })).max(12),
  passages: passagesSchema,
  subject: z.object({ title: z.string().max(300), lines: z.array(z.string().max(4000)).max(20), hideAnswer: z.boolean() }),
});
export type AskInput = z.infer<typeof askInput>;

const ROLE: Record<AskInput["scope"], string> = {
  study: "You are Cue, a study partner helping a university student during a focused study session.",
  liveLecture: "You are Cue, helping a student who is sitting in a live lecture. The passages are the last few minutes of the transcript.",
  lecture: "You are Cue, helping a student review a lecture they recorded. The passages come from the whole lecture.",
  question: "You are Cue, a tutor helping a student with one multiple-choice practice question.",
};

function system(input: AskInput): string {
  const rules = [
    ROLE[input.scope],
    "Answer from the passages. After each sentence that uses a passage, cite it with its marker, like [S2]. Cite only markers you were given.",
    input.subject.hideAnswer ? "The student has not answered yet. Give hints and explain the ideas, but never state or strongly imply which option is correct." : "",
    input.mode === "quick" ? "Answer in at most 4 short sentences." : "Answer thoroughly but stay under 250 words.",
    STYLE,
  ];
  return rules.filter(Boolean).join("\n");
}

function user(input: AskInput): string {
  return [`Topic: ${input.subject.title}`, ...input.subject.lines, "", "Passages:", passagesBlock(input.passages), "", `Question: ${input.question}`].join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** The passages that share the most words with the question, so a retrieval regression shows up as a missing chip. */
export function mockCitations(question: string, passages: readonly Passage[], n = 2): Passage[] {
  const q = words(question);
  return passages
    .map((p, i) => ({ p, i, score: [...words(p.text + " " + p.label)].filter((w) => q.has(w)).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.p);
}

function firstSentence(text: string): string {
  const s = text.replace(/\s+/g, " ").trim().match(/^.{20,220}?[.!?](\s|$)/)?.[0]?.trim() ?? text.replace(/\s+/g, " ").trim().slice(0, 160);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

async function* mockAsk(input: AskInput): AsyncGenerator<StreamEvent> {
  if (input.mode === "deep") {
    for (const d of ["Checking the passages ", "against the question. "]) {
      yield { type: "thinking", delta: d };
      await sleep(60);
    }
  }
  const cited = mockCitations(input.question, input.passages);
  const lead = input.subject.hideAnswer ? "Here's a hint without giving the answer away." : "Here's what your course material says.";
  const body = cited.map((p) => `${firstSentence(p.text)} [${p.id}]`).join(" ");
  const reply = `${lead} ${body || "Your material doesn't cover this yet, so start from the definitions."}`;
  for (const piece of reply.split(/(?<= )/)) {
    yield { type: "text", delta: piece };
    await sleep(20);
  }
}

/** `ask` has no prefix: it is the shared task every ask panel calls through useChat. */
export const chatTasks = {
  ask: streamTask<AskInput>({
    input: askInput,
    profile: (i) => (i.mode === "deep" ? "reason" : "chat"),
    maxTokens: (i) => (i.mode === "deep" ? 8000 : 1000),
    prompt: (i) => ({ system: system(i), user: user(i), history: i.history.map((h) => ({ role: h.role, content: h.text })) }),
    example: {
      scope: "study",
      mode: "quick",
      question: "Why does preorder visit the root first?",
      history: [],
      passages: [
        {
          id: "S1",
          label: "Lecture 8 slides · Slide 14",
          text: "Preorder traversal: visit the root first, then recurse on each subtree, left to right.",
          ref: { kind: "page", materialId: "mat_sample_csc148_l08_slides" as never, doc: { kind: "slides", title: "Lecture 8 slides", lectureNumber: 8 }, page: 14 },
        },
      ],
      subject: { title: "CSC148 · Recursion & tree traversal", lines: ["Step: Re-read key slides"], hideAnswer: false },
    },
    mock: mockAsk,
  }),
};
