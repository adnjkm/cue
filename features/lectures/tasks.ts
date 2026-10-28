import "server-only";
import { z } from "zod";
import { defineTasks, jsonTask } from "@/lib/ai/define";
import { STYLE } from "@/lib/ai/passages";
import { demoCleanup, mockHints, mockNotes } from "./mocks";

const stamp = z.string().regex(/^(\d+:)?\d{1,2}:\d{2}$/);
const assessmentId = z.string().regex(/^A\d{1,3}$/);
const courseworkId = z.string().regex(/^[AM]\d{1,3}$/);

const CLEAN_SYSTEM = `You punctuate a live lecture transcript. The chunk is raw speech recognition output from 12 to 18 seconds of a university lecture: usually lower case, without punctuation, with numbers spelled out.
Return it as sentences: add punctuation and capitals, fix a misheard word only when the context makes the intended word certain, and keep every other word in its order. Never summarize, explain, translate or add words.
Write course names and numbers the way a student writes them: "Term Test 2", "section 7.1", "Problem Set 5", "CSC148", "Q3".
Keep spoken math as the words that were said ("x e to the x", "the integral of u dv"). Never write LaTeX, dollar signs or math symbols for it.
The chunk can start or end mid-sentence; keep a cut-off sentence as it is. "Before" is the end of the previous chunk, for context only: do not repeat it.
Reply with JSON { "sentences": [ ... ] }.`;

const HINTS_SYSTEM = `You sit in a university lecture beside a student and watch the last minute of the transcript for what matters to their coursework.
The transcript lines start with their [m:ss] time. The course's assessments are listed with ids like A1, and its materials (slides, textbook, problem sets, practice papers) with ids like M1.
Return three lists:
- "hints": moments where the professor signals what will be tested, such as "this will be on the test", "there will be one of these on Term Test 2", "the number one mistake I see", "make sure you can do this for the exam". "quote" copies the professor's words from one line exactly, at most 30 words. "assessment" is the id of the test they name, or null when they do not say which. Ordinary explanation or emphasis without a test is not a hint.
- "mentions": coursework the professor refers to that matches a listed id. "quote" copies the words that refer to it. "part" names the piece when they say one ("Q3–Q6", "§7.1", "p. 482", or "4–9" for slides), else null. "title" is a 2 to 5 word name for what that part covers, only for slides and textbook ("Deriving the formula"), else null. "note" says in 2 to 6 words why it matters right now ("same technique", "same choice of u and dv"), else null.
- "tasks": what the professor asks students to do ("read section 7.1", "do the odd problems 1 to 19"), each at most 12 words, with "ref" the matching id or null and "part" as above.
Use only the listed ids. Empty lists are the usual answer. Reply with JSON { "hints": [...], "mentions": [...], "tasks": [...] }.`;

const NOTES_SYSTEM = `You write a student's notes for one university lecture from its transcript. Each line starts with its [m:ss] time. Lines marked (exam hint) are moments the professor said would be tested.
Return:
- "summary": 3 to 5 sentences in plain language on what the lecture taught and how the ideas connect. Start with the content, not with "In this lecture".
- "keyPoints": 4 to 8 things to remember, in lecture order. Each "text" is one sentence of at most 15 words. "at" copies the [m:ss] time of the line it comes from.
- "topic": when no topic is given, { "full": a 2 to 6 word title for the lecture, "short": 1 or 2 words }; when a topic is given, null.
Use only what the transcript says. ${STYLE}
Reply with JSON { "summary": ..., "keyPoints": [...], "topic": ... }.`;

const cleanInput = z.object({ raw: z.string().trim().min(1).max(4000), before: z.string().max(1000) });

const hintsInput = z.object({
  course: z.string().max(200),
  window: z.array(z.object({ at: stamp, text: z.string().max(2000) })).min(1).max(30),
  assessments: z.array(z.object({ id: assessmentId, label: z.string().max(120), kind: z.enum(["test", "deadline"]), when: z.string().max(40) })).max(20),
  materials: z.array(z.object({ id: z.string().regex(/^M\d{1,3}$/), title: z.string().max(160), kind: z.string().max(40) })).max(40),
});

const notesInput = z.object({ course: z.string().max(200), topic: z.string().max(200).nullable(), transcript: z.string().min(1).max(60_000) });

export const lectureTasks = defineTasks("lecture", {
  /** One call per audio chunk: punctuation and capitals for the engine's raw words. */
  clean: jsonTask({
    profile: "fast",
    maxTokens: 2000,
    input: cleanInput,
    output: z.object({ sentences: z.array(z.string().trim().min(1).max(600)).max(40) }),
    prompt: ({ raw, before }) => ({ system: CLEAN_SYSTEM, user: `Before: ${before.trim() || "(start of the lecture)"}\n\nChunk: ${raw}` }),
    example: {
      raw: "okay lets actually do one the integral of x e to the x dx which one is u think liate x is algebraic e to the x is exponential so algebraic comes first",
      before: "If you are not sure, write both choices down and see which integral you can actually do.",
    },
    mock: ({ raw }) => ({ sentences: demoCleanup(raw) }),
  }),

  /** The rolling 60 s window after each chunk: exam hints, coursework mentions and tasks. */
  hints: jsonTask({
    profile: "fast",
    maxTokens: 2000,
    input: hintsInput,
    output: z.object({
      hints: z.array(z.object({ quote: z.string().trim().min(3).max(300), assessment: assessmentId.nullable() })).max(5),
      mentions: z
        .array(
          z.object({
            ref: courseworkId,
            quote: z.string().trim().min(3).max(300),
            title: z.string().trim().max(80).nullable(),
            part: z.string().trim().max(60).nullable(),
            note: z.string().trim().max(80).nullable(),
          }),
        )
        .max(8),
      tasks: z.array(z.object({ text: z.string().trim().min(3).max(200), ref: courseworkId.nullable(), part: z.string().trim().max(60).nullable() })).max(5),
    }),
    prompt: (i) => ({
      system: HINTS_SYSTEM,
      user: [
        `Course: ${i.course}`,
        "",
        "Assessments:",
        ...(i.assessments.length ? i.assessments.map((a) => `${a.id} · ${a.label} · ${a.kind} · ${a.when}`) : ["(none)"]),
        "",
        "Materials:",
        ...(i.materials.length ? i.materials.map((m) => `${m.id} · ${m.title} · ${m.kind}`) : ["(none)"]),
        "",
        "Transcript, last minute:",
        ...i.window.map((l) => `[${l.at}] ${l.text}`),
      ].join("\n"),
    }),
    example: {
      course: "MAT137 · Calculus with Proofs",
      window: [
        { at: "31:58", text: "Plug into the formula: x e to the x, minus the integral of e to the x dx. Problem Set 5 questions 3 to 6 use exactly this." },
        { at: "33:20", text: "If you pick u the other way around, the integral gets worse, not better. That's the number one mistake I see, so there will be one of these on Term Test 2." },
      ],
      assessments: [
        { id: "A1", label: "Problem Set 5", kind: "deadline", when: "Thu, Oct 29" },
        { id: "A2", label: "Term Test 2", kind: "test", when: "Fri, Nov 13" },
      ],
      materials: [
        { id: "M1", title: "Problem Set 5", kind: "problem set" },
        { id: "M2", title: "Textbook", kind: "textbook" },
        { id: "M3", title: "Lecture 9 slides", kind: "slides" },
        { id: "M4", title: "2024 Term Test 2", kind: "practice paper" },
      ],
    },
    mock: (i) => mockHints(i),
  }),

  /** Once at save: the summary and the key points of the saved notes. */
  notes: jsonTask({
    profile: "chat",
    maxTokens: 4000,
    temperature: 0.3,
    input: notesInput,
    output: z.object({
      summary: z.string().trim().min(1).max(1200),
      keyPoints: z.array(z.object({ at: stamp, text: z.string().trim().min(1).max(200) })).max(8),
      topic: z.object({ full: z.string().trim().min(1).max(80), short: z.string().trim().min(1).max(24) }).nullable(),
    }),
    prompt: (i) => ({ system: NOTES_SYSTEM, user: `Course: ${i.course}\nTopic: ${i.topic ?? "(not given)"}\n\nTranscript:\n${i.transcript}` }),
    example: {
      course: "MAT137 · Calculus with Proofs",
      topic: "Integration by parts",
      transcript: [
        "[0:45] Morning. Today is integration by parts, which is really just the product rule run backwards.",
        "[6:40] Start from the derivative of u times v. Integrate both sides and you get the formula on slide 6.",
        "[12:15] The skill here is choosing u. Pick the part that gets simpler when you differentiate it.",
        "[30:02] Which one is u? Think LIATE. x is algebraic, e to the x is exponential, so algebraic comes first.",
        "[33:20] (exam hint) If you pick u the other way around, the integral gets worse, not better. That's the number one mistake I see, so there will be one of these on Term Test 2.",
        "[35:47] So the answer is x e to the x minus e to the x, plus C. Always check by differentiating.",
      ].join("\n"),
    },
    mock: (i) => mockNotes(i),
  }),
});
