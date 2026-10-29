# Cue architecture

This is the build contract for the full Cue app, grown from `cue-practice`. It was synthesized from two candidate designs (`docs/architecture/candidate-opus/` and `docs/architecture/candidate-fable/`) and four judge verdicts. Section 15 says what came from where. The type sketch is [`docs/architecture/types.ts`](architecture/types.ts). In the foundation it becomes `lib/domain/*`, `lib/db`, `lib/ai`, `lib/plan` and the other modules named in its section headings. Where this file and the type sketch disagree, fix the sketch to match the usage in section 2, then file a change request (section 11.3).

Everything a student owns lives in IndexedDB in their browser. The server holds one piece of state: the spend ledger. The study plan is never stored. A pure scheduler derives it from the calendar, the imports, a small table of overrides and the study sessions already started. Every model call goes through one typed gateway, and every citation is one type with one label formatter.

---

## 1. Problem

Cue grows from a one-screen practice app into six screens that share one picture of a student's term: a calendar, a plan derived from it, course material, lecture transcripts, practice papers and generated text with citations. Four constraints shape the design:

- **No accounts, and the demo runs in a fresh browser.**
- **Every Token Factory call passes a $30 cap**, and the cap must still hold on Vercel (decisions row 8).
- **Parallel build.** After one foundation unit, six agents build the features in separate worktrees and never edit a shared file.
- **Paper fixes the strings.** Many of them are derived values (`3h 15m of study`, `Review 1 day after lecture`, `31:48 left`), so the model has to produce them rather than hard-code them.

The existing code fixes some choices: the provider switch, reserve-then-settle spending, the zod gates, the practice reducer and the page renderer all work and are kept (`docs/research/current-app.md` section 8). The measured role table in `docs/research/token-factory.md` section 9 is the model policy. Decisions rows 7, 8, 10 and 11 are constraints.

The Paper week is hand-drawn and not consistent with any rule set: two reviews for one CSC148 lecture, none for another, reviews that start right at lecture end on some days and 15 minutes after on others. The design has to be faithful to Paper and still schedule a real student's calendar.

---

## 2. Usage (caller's view)

### 2.1 The contract a feature agent works under

```
You own     the paths workstreams.ts lists for you (section 11.1): your route folders under
            app/(browse) and app/(focus), features/<you>/**, your payload and sample files,
            scripts/e2e/steps/<you>.mjs, scripts/fixtures/<you>/**, docs/change-requests/<you>-*.md
You import  @/lib/<module> (its index only), @/components/ui/*, @/components/cue/*, lucide-react
You never   import another feature, a lib module's internal/ folder, or @base-ui/react directly
You write   only the tables workstreams.ts gives you. Other state changes go through the owning
            module's actions: planActions, courseActions, setPrefs("<you>", …), ingestFile,
            reindexSource, useChat
You link    with href.* from @/lib/routes, never a hand-built URL
You call AI with ai(), aiItems() or aiStream() on your own tasks (features/<you>/tasks.ts), or on
            the shared ones, which you reach through lib modules (useChat, retrieve, ingestFile)
You need    a new table, index, field on a shared type, dependency, shadcn component or href:
            write docs/change-requests/<you>-<n>.md and keep working. The integrator lands it on
            main and every worktree rebases.
```

`pnpm lint` (boundary and table-writer rules generated from `workstreams.ts`) and `node scripts/check-ownership.mjs <you>` (the diff against main touches only owned paths) fail a worktree that breaks this.

### 2.2 Call sites

**Today reads the derived plan.** No feature ever asks for a re-plan. Importing a calendar, starting a session or rescheduling a block changes the inputs, and every `usePlan` re-derives.

```tsx
// features/today/TodayPage.tsx
"use client";
import Link from "next/link";
import { usePlan, blockReasonText, blockTitle } from "@/lib/plan";
import { useNow, fmtRange } from "@/lib/time";
import { href } from "@/lib/routes";
import { buttonVariants } from "@/components/ui/button";
import { SampleSemesterButton } from "@/components/cue/sample";

export function TodayPage() {
  const now = useNow("minute");
  const day = usePlan({ day: now });             // undefined until IndexedDB answers
  if (!day) return <TodaySkeleton />;
  if (day.isEmpty) return <FirstRun actions={<SampleSemesterButton />} />;
  const next = day.blocks.find((b) => ["upcoming", "now", "inProgress"].includes(day.status(b)));
  return (
    <>
      <Brief day={day} now={now} />
      {next && (
        <NextUpCard
          block={next}
          meta={`Next up · ${fmtRange(next, day.zone)} · ${blockReasonText(next, "sentence")}`}
          start={<Link href={href.study(next.id, { start: true })} className={buttonVariants()}>Start session</Link>}
        />
      )}
      <Timeline agenda={day.agenda} status={day.status} title={(b) => blockTitle(b, "timeline")} />
    </>
  );
}
```

**A feature defines its AI tasks once and calls them with types end to end.** The profile picks the model, the thinking flag, the price and the provider IDs. A feature never names a model.

```ts
// features/lectures/tasks.ts  (server-only; registered by lib/ai/registry.ts)
import "server-only";
import { z } from "zod";
import { defineTasks, jsonTask } from "@/lib/ai/define";

export const lectureTasks = defineTasks("lecture", {
  clean: jsonTask({
    profile: "fast",                                   // Lightning, thinking off
    maxTokens: 2000,
    input: z.object({ raw: z.string().max(4000), before: z.string().max(1000) }),
    output: z.object({ sentences: z.array(z.string().min(1)).max(40) }),
    prompt: ({ raw, before }) => ({ system: CLEAN_SYSTEM, user: `${before}\n---\n${raw}` }),
    example: { raw: "okay lets actually do one the integral of x e to the x dx", before: "" },
    mock: ({ raw }) => ({ sentences: demoCleanup(raw) }),
  }),
});

// features/lectures/pipeline.ts  (client)
import { ai, AiError, errorCopy } from "@/lib/ai";
const { sentences } = await ai("lecture.clean", { raw, before }, { signal });
// On failure the segment keeps `raw` and the line shows it; errorCopy(e) gives the status line.
```

**Results that fill in as they arrive are list tasks.** The server streams each validated item.

```ts
// features/practice/generate.ts
import { aiItems } from "@/lib/ai";
for await (const q of aiItems("practice.generate", { scope, style, passages, count: 5 }, { signal })) {
  const { answer } = await ai("practice.check", { prompt: q.prompt, options: q.options });
  if (answer === q.answer) await appendGenerated(setId, q, refsFor(q.sources, passages));   // tile fills in
}
```

**Every ask panel is one hook.** Context for the scope, the prompt, streaming, citation parsing and persistence sit behind it. A screen that shows sources itself handles chip clicks.

```tsx
// features/study/AskPanel.tsx
import { useChat, threadKey } from "@/lib/chat";
import { ChatThread, Composer } from "@/components/cue/chat";

const chat = useChat({
  thread: threadKey.session(session.id),
  scope: { kind: "study", courseId: session.courseId, lectureId: session.lectureId, focus: step.source },
});
return (
  <>
    <ChatThread chat={chat} followUps={(m) => <SessionFollowUps message={m} />}
                onOpenSource={(ref) => viewer.show(ref)} />            {/* "Slide 17" switches the Slides tab */}
    <Composer chat={chat} modes placeholder="Ask anything about Lecture 8…" />
  </>
);

// features/lectures/LiveComposer.tsx: the note taker asks about the last 5 minutes, same thread as the saved notes
const chat = useChat({ thread: threadKey.lecture(id), scope: { kind: "liveLecture", lectureId: id, windowMs: 5 * 60_000 } });
```

**The scheduler is a pure function.** `usePlan` is a memoized call to it. Tests call it directly.

```ts
import { schedule } from "@/lib/plan";
const { blocks, unplaced, conflicts } = schedule({ zone, window, courses, events, imports, topics, overrides, sessions, prefs });
```

**Plan changes are override rows written by one module.**

```ts
import { planActions } from "@/lib/plan";
const moved = await planActions.reschedule(block.id, { after: now });   // null when nothing fits in 7 days
await planActions.markDone(block.id);                                   // keeps the block where it was
const blockId = await planActions.reviewNow(lecture.id, now);           // saved notes' "Review now"
```

**Bringing a file in is one call. Asking the course material is another.**

```ts
import { courseActions } from "@/lib/courses";
import { ingestFile } from "@/lib/materials";
import { retrieve, refsFor, sourceKey } from "@/lib/retrieval";

const courseId = await courseActions.ensure("CSC148", "manual");
const materialId = await ingestFile(file, { courseId, kind: "slides", lecture: { number: 9 } }, onProgress);
const passages = await retrieve({ courseId, text: "postorder delete subtrees", prefer: [sourceKey.lecture(lectureId)], latency: "thorough" });
const resources = refsFor(solve.resources, passages);                   // "S2" -> SourceRef
```

**Feature settings go through one typed slice per owner.**

```ts
import { setPrefs, usePrefs } from "@/lib/prefs";
await setPrefs("lectures", { engine: "parakeet", parakeetConsentAt: now });   // lint: only "lectures" from features/lectures
```

**The demo starts from a fresh browser with one call**, dated against the current week.

```ts
import { seedSampleSemester } from "@/lib/sample";
await seedSampleSemester({ now: Date.now(), zone: currentZone() });
```

**A walkthrough step drives the production build by roles and labels.**

```js
// scripts/e2e/steps/today.mjs
import { tid } from "../../../features/today/testids.ts";
export default async function today(t) {
  await t.reseed();
  await t.page.goto("/");
  await t.expect(t.page.getByRole("heading", { level: 1 })).toHaveText("Two sessions today. Start with recursion.");
  await t.expect(t.page.getByTestId(tid.nextUp)).toContainText("Next up · 10:30–11:15am · Review 1 day after lecture");
  await t.shot("today");
  await t.integrated("Start opens the session", async () => { /* crosses into Study's screen */ });
}
```

---

## 3. Module map

`F` foundation, `T` Today, `C` Calendar, `L` Lecture notes, `S` Study sessions, `P` Practice, `G` Study guides. Foundation writes every file below once, including stubs. After the foundation commit, ownership is the letter shown, and `workstreams.ts` is the source of truth.

```
app/
  layout.tsx                                   F  fonts, <TooltipProvider>, <Toaster>, <Boot>
  globals.css                                  F  Tailwind 4, shadcn variables and Cue tokens, all OKLCH
  fonts/TimelessSans-{Regular,Medium}.ttf      F  kept; Regular covers 400–499 so 420 renders
  (browse)/layout.tsx                          F  SidebarProvider + AppSidebar + SidebarInset (document scroll)
  (browse)/page.tsx                            T  /
  (browse)/calendar/page.tsx                   C  /calendar?view=&date=&add=
  (browse)/study/page.tsx                      S  /study (upcoming blocks, past sessions)
  (browse)/lectures/page.tsx                   L  /lectures (by course; Record a lecture)
  (browse)/practice/page.tsx                   P  /practice (papers, upload, ?generate=)
  (browse)/guides/page.tsx                     G  /guides -> most recently read course
  (browse)/guides/[courseId]/[[...section]]/page.tsx   G
  (focus)/layout.tsx                           F  full-bleed h-dvh frame, nav Sheet on Cmd/Ctrl+B
  (focus)/study/[blockId]/page.tsx             S  preview, or the session with ?start=1
  (focus)/lectures/[lectureId]/page.tsx        L  note taker or saved notes, by lecture state
  (focus)/practice/[setId]/page.tsx            P
  (focus)/export/guide/[courseId]/page.tsx     G  print view for Export PDF
  api/ai/route.ts                              F  GET: task list with examples (check-nemotron)
  api/ai/[task]/route.ts                       F  POST: the one AI gateway, JSON or NDJSON by task kind
  api/status/route.ts                          F  AI mode, embedder, spend
components/
  ui/*                                         F  shadcn base-nova, restyled to Cue; every component the specs name
  cue/                                         F  shared Cue parts:
    shell/ AppSidebar, AppNav, SidebarToggle, SpendMeter, DataMenu, Mascot, LiveBadges
    chat/ ChatThread, Composer (Quick/Deep, scope note slot), SourceChip, SourceChips
    source/ SourceView (slide, page, transcript window), SourcePeek (Sheet)
    TranscriptLine (final | flagged | live), CourseChip, SectionLabel, FocusToolbar, TimerBar,
    Prose, EmptyState, ErrorLine, BudgetNotice, sample/SampleSemesterButton, AddMaterialDialog
hooks/use-mobile.ts                            F  the lint-clean useSyncExternalStore version
features/
  today/**                                     T  incl. tasks.ts, testids.ts
  calendar/**                                  C  incl. ics.ts, timetable.ts, lanes.ts (layoutLanes), tasks.ts, testids.ts
  lectures/**                                  L  engine/ (parakeet, demo, worker), capture/ (AudioWorklet, cutter),
                                                  recorder.ts (module singleton), pipeline.ts, latex.ts, tasks.ts, testids.ts
  study/**                                     S
  practice/**                                  P  moved here from components/ and lib/ by F
  guides/**                                    G  charts/, print
public/lectures/**                             L  AudioWorklet module if the bundler cannot emit it
lib/
  db/          F  Dexie schema v1 (every table), useLive, useLiveActivity; imports "client-only"
  domain/      F  entity types, id constructors, pure derivations (sessionClock, lectureLive, gradeOf, sectionStale)
  domain/payload/{study,lectures,practice,guides}.ts   S L P G  AI-product shapes stored inside rows (SessionPlan,
                                                  LectureNotes, Solution, GuideBlock, ChartSpec); additive changes only
  courses.ts   F  courseActions.ensure / release (the one writer of courses)
  prefs.ts     F  usePrefs / setPrefs (the one writer of prefs)
  time/        F  zone math (@date-fns/tz), useNow, Paper formats ("10:30–11:15am", "3h 15m", "41:05")
  plan/        F  schedule (pure), findSlot, usePlan, planActions, blockStatus, blockTitle, blockReasonText,
                  blockMaterials, topicMatch
  materials/   F  ingestFile, resumeIngest, removeMaterial, renderPages (from lib/pages.ts), task material.read
  retrieval/   F  chunkers, indexer, retrieve, livePassages, parseCitations, refsFor, task embed
  chat/        F  useChat, scope -> context and prompt, threadKey, saveToGuide, task ask
  sources.ts   F  sourceLabel(ref, style), footnoteText, useOpenSource, useCourseSources
  ai/          F  models, profiles, define, registry, client (ai, aiItems, aiStream), errors (errorCopy), json,
                  server/ (runTask, provider, ledger-file, ledger-redis, throttle; "server-only")
  sample/{index,ids,core}.ts                   F  seedSampleSemester, resetAll, SAMPLE, courses/events/imports,
                                                  authored blocks, materials, pages, the Paper study chat
  sample/{study,lectures,practice,guides}.ts   S L P G  each feature's own sample rows (SampleFragment)
  routes.ts    F  href builders and NAV (NAV built from href, icons are lucide components)
  testids.ts   F  shared test ids only (shell, chat, source peek)
eslint-rules/  F  cue/table-writers, cue/prefs-owner (generated from workstreams.ts)
scripts/
  e2e/walkthrough.mjs, e2e/lib/**              F  runner, step context, overflow check
  e2e/steps/boot.mjs                           F
  e2e/steps/{today,calendar,lectures,study,practice,guides}.mjs   per feature
  check-tokens.mjs, check-nemotron.mjs, check-ownership.mjs      F
  fixtures/audio/**                            F  today's lecture.wav, lecture.txt, chunks*, mediarecorder/ (moved here)
  fixtures/{calendar,lectures,practice,guides}/**                per feature; practice gets .verify/sample-quiz.pdf
workstreams.ts                                 F  the ownership manifest: paths, tables, task prefixes, step order
docs/change-requests/<workstream>-<n>.md       per feature, one file per request
```

Moves and deletions done by foundation:

- `lib/llm.ts` splits into `lib/ai/*` and `features/practice/tasks.ts`.
- `lib/spend.ts` becomes `lib/ai/server/ledger-file.ts` behind `LedgerStore`.
- `lib/schema.ts` goes to `features/practice/schema.ts`, except `extractJson`, which goes to `lib/ai/json.ts`.
- `lib/session.ts` (the reducer and `buildExam`) goes to `features/practice/`. Its localStorage functions are deleted.
- `components/{App,Intake,Practice,Navigator}.tsx` go to `features/practice/`.
- `components/AskChat.tsx` and the ask and solve helpers in `lib/client.ts` are replaced by `useChat` and `ai()`. Parse chunking and the solve queue move to `features/practice/`.
- `lib/mock.ts` is split into each task's `mock`.
- `lib/pages.ts` becomes `lib/materials/pages.ts` and emits Blobs.
- `components/icons.tsx` and `components/Credit.tsx` are replaced by lucide and `SpendMeter`.
- `app/page.tsx` (`ssr: false`) and `app/api/{parse,solve,ask}` are deleted once Practice calls `/api/ai/practice.*`.
- The `.verify/harness` scenarios move into `scripts/e2e/steps/practice.mjs`.

---

## 4. Persistence

### 4.1 Where each entity lives

| Entity | Store | Why |
| --- | --- | --- |
| Courses, calendar events, import batches, plan overrides | IndexedDB | No accounts. The plan is computed in the browser from these. |
| Materials, pages, blobs (source files, page images, figure crops) | IndexedDB, as `Blob` values, never data URLs | A textbook is megabytes. It stays on the device. Only the pages the model must read leave it, as data URLs built at call time. |
| Chunks with embeddings (`Float32Array`) | IndexedDB | Retrieval runs in the browser over local text. 5,000 chunks × 1,024 dims is 20 MB. |
| Lectures, transcript segments, related links, audio chunks | IndexedDB | Audio and transcripts are private. Audio chunks are the durable transcription queue and are deleted once the lecture is saved and fully transcribed. |
| Study sessions, chat messages | IndexedDB | One row per session and one row per settled message. |
| Practice sets, questions, attempts, solutions | IndexedDB | Replaces the single localStorage blob. One row per record, versioned schema. |
| Guide outlines and sections | IndexedDB | The generated text is the product. It must survive reloads. |
| Preferences (zone, plan prefs, sample flag, engine, Pomodoro) | IndexedDB `prefs`, one typed row per owner | Read by the scheduler and the features. Each feature writes only its own row. |
| Speech model weights | Cache Storage (transformers.js) | Managed by the library. 454 MB, downloaded once after consent. |
| Spend ledger and client throttle | Server. Local dev: `.data/spend-ledger.json`. Vercel: Upstash Redis | Every serverless instance must share them and they must survive restarts. A per-instance file cannot hold a cap. |

The server keeps no course content and no user state. A server database for content would need accounts or anonymous device IDs, and the audio and textbook blobs would still live in the browser. `navigator.storage.persist()` is requested on the first write so the browser does not evict the data.

### 4.2 Rules that hold across the model

1. **Derive, don't store.** Study blocks, block status, grades, a session's time left and Pomodoro phase, a lecture's liveness, a guide section's staleness and ingest progress are pure functions of stored facts and `now`. None of them is a column.
2. **Settled-only persistence.** An AI product is an optional field: `session.plan`, `segment.text`, `solution`, `section.draft`, `chunk.vector`, `lecture.notes`, `audio.transcribedAt`. Missing means pending. In-flight work lives in memory, keyed by row id, and an effect restarts it idempotently after a reload. No row ever says "loading". This fixes current-app fragile points 10, 11 and 12.
3. **Identity from meaning.** IDs are built from what a thing is: a material from its file hash, an event from its ICS UID or timetable slot, a block from its anchor, a session from its block, a lecture from its event, a chunk from its source and index. Re-import, re-seed, a double-clicked Start and a retried ingest all land on the same row.
4. **One writer per table.** `workstreams.ts` names it. `TABLE_WRITERS` is derived from that list, and a type check fails when a table has no writer or two. Shared state that several screens change (overrides, courses, prefs, chat messages, materials, chunks) has a foundation module as its only writer, and features call its actions.
5. **Citations carry their display facts.** A `SourceRef` holds the material title and kind, lecture number, page label and figure label it needs. `sourceLabel(ref, style)` is therefore pure, and a citation still reads correctly after its material is deleted.
6. **Persist the choice, derive the grade.** An attempt stores only `{ choice }`. Correctness comes from `question.key`, a union that cannot hold an answer without saying where it came from.

### 4.3 Tables, keys and writers

The Dexie schema is `SCHEMA_V1` in the type sketch. Each table is an array of typed key paths, so renaming an indexed field fails typecheck, and `lib/db` joins the entries for Dexie. Features never bump the version. A new index is a change request.

| Table | Primary key, indexes | Writer |
| --- | --- | --- |
| prefs | owner | F (`setPrefs`; features write their own slice) |
| courses | id | F (`courseActions`) |
| events | id; kind, start, courseId, importId, seriesId | C |
| imports | id | C |
| overrides | blockId; status | F (`planActions`) |
| materials | id; courseId, kind, lecture.eventId | F (`ingestFile`, `removeMaterial`) |
| pages | [materialId+index]; materialId | F |
| blobs | id | F |
| chunks | id; courseId, sourceKey | F (`reindexSource`, indexer) |
| lectures, segments, links, audio | id / [lectureId+seq] / id / [lectureId+seq] | L |
| sessions | id (= BlockId); state.status, courseId | S |
| messages | id; thread, [thread+at], courseId, savedToGuideAt | F (`useChat`) |
| practiceSets, questions, attempts, solutions | id / id, [setId+order] / questionId / questionId | P |
| guides, guideSections | courseId / id, [courseId+order] | G |

Today writes no table. It changes state only through `planActions`.

`seedSampleSemester` and `resetAll` are the one exception to single writers. They clear and write every table in one transaction from the sample fragments, each of which is typed to the tables its owner writes (`SampleFragment<T>`).

---

## 5. Domain types and state machines

Field-level types are in `types.ts` sections 3 to 12. Every machine is a discriminated union with pure, idempotent transitions. Pausing a paused session is a no-op, so double clicks and retries are safe.

### 5.1 Entities

- **Course**: the id is the normalized code (`CSC148`), so URLs read `/guides/ECO101` and imports merge by code. `short` (`CSC`) feeds `Mid-week · CSC`. `sources` lists the imports (or `manual`) that asserted the course, so Undo can remove exactly what an import added.
- **CalendarEvent**: a union by kind. Kinds are `lecture` (number, topic, room), `lab`, `test` (label, short, weight: quiz, test, midterm or exam), `deadline` (label, short, effort; `end === start` is the due time), `busy` (any non-course event from a personal calendar) and `note` (all-day text such as `Thanksgiving · no class`). Recurrence is expanded at import (RRULE with EXDATE through ical.js) into instances that share a `seriesId`.
- **ImportBatch**: one per import, including the sample. `planFrom` is the instant before which the scheduler places no rule block for that import's anchors.
- **PlanOverride**: one row per block id, with two independent facts.
  - An optional `placement`: `pinned` (an interval set by Reschedule, a move, or Mark done on a rule block) or `authored` (a hand-written block with any anchor, used by the sample's Paper weeks and by user-added blocks).
  - An optional `status`: `done` or `skipped`.

  The union makes an empty row, or `done` without a placement, unrepresentable. Rescheduling or finishing an authored block keeps its authored text.
- **StudyBlock** (derived): id from its anchor, interval, course, topic `{ full, short }`, note, `why` (days after the anchor, and the test that boosted it), and `placement` (`rule`, `pinned`, `authored` or `locked`).
- **Material, MaterialPage**: kind (slides, textbook, handout, problemSet, pastPaper, notes, syllabus, other), title (`Lecture 8 slides`) and an optional `lecture: { number, eventId? }`. A page has text, a page label (`p. 214`, `Q1`), a section (`§5.2`), optional structured slide content (heading, body, code) and an optional rendered image.
- **Chunk**: a retrieval unit with a `SourceRef`, text, and an optional vector tagged with the embedder that made it.
- **Lecture, Segment, RelatedLink, AudioChunk**: the lecture's state machine is below. A segment holds the engine's `raw` text and the cleaned `text`, plus an optional flag (`model` with the assessment it names, or `user`). Exam hints are flagged segments and are stored nowhere else. A related link points at a `SourceRef` (an assessment, a material page, a practice question).
- **StudySession**: keyed by block id. It holds a snapshot of the block (anchor, planned interval, course, topic, minutes, lecture), the generated plan, timer state as timestamps, the current step and when it began, steps done, ask mode and viewer position.
- **PracticeSet, Question, Attempt, Solution**: today's model plus `type`, `marks`, `key` (union), `origin` (`paper`, or `generated` with the refs it came from), `{ label, text }` steps, `conclusion`, `resources: SourceRef[]`, and a figure that is either a crop Blob or a structured tree.
- **Guide, GuideSection, GuideDraft**: an outline (chapters, with textbook chapter numbers kept apart from guide order) and `lastRead`. Each section has an optional draft: blocks (prose, formula, figure with chart specs, callout), footnotes whose sources are `FootnoteSource`s (a ref plus an optional relation, `used` or `tested`, and an optional note), plain text for Practice, and the source stamp it was written from.
- **ChatMessage**: thread key (`session:…`, `lecture:…`, `question:…`), role, text without citation markers, citations, mode and `savedToGuideAt`.

### 5.2 State machines

**Material ingest** (status derived from rows; `ingestFile` is resumable and keyed by file hash):

```
(no row) -> pending (pages missing; Boot resumes) -> ready
            any page fails: its row has readBy "failed" -> partial; Retry re-reads only those pages
```

**Lecture** (stored state plus derived liveness):

```
ready --start--> recording <--pause/resume--> paused --end and save--> saved --continue recording--> recording
recording with heartbeatAt older than 15 s  =>  derived "interrupted" (offer Resume or Save)
mic denied => stays ready with the error in memory; End and save stays enabled
```

The recorder writes `heartbeatAt` every 5 s. The sidebar badge, Today's lecture row and Calendar read `lectureLive(lecture, now)` from the database, so they never import Lectures code, and a closed tab cannot leave a stale `Recording` behind. The recorder is a module singleton in `features/lectures`. The root layout never remounts, so recording continues when the student opens a related card on another route.

**Transcription engine** (in memory, Lectures-owned):

```
idle -> preparing(loaded/total bytes) -> ready -> running -> stopped
                                      \-> failed(noBackend | download | runtime | micDenied)
```

Pause aborts `run()`. Resume calls `run()` again with `resumeAtMs`, so there are no pause methods to keep in sync. Audio is captured by an AudioWorklet at 16 kHz mono. It is cut at the quietest 200 ms between 12 and 18 s, with a hard cut at 18 s (the measured MediaRecorder timeslice bug does not apply). Each cut is stored as a WAV `AudioChunk` before it is transcribed. A partial line exists only when `capabilities.partials` is true: Parakeet on WebGPU re-decodes the open buffer every 3 s, and the demo engine emits partials from its script. On WASM the live line reads `Listening…` until the cut is decoded.

**Transcript segment**: `raw` is written when the engine finalizes a chunk. `text` is written after `lecture.clean`, then passed through `latexToUnicode` (measured: Lightning writes LaTeX even when asked for Unicode). It stays missing on failure or at the budget cap, and the line shows the raw text. `flag` is written by `lecture.hints` (rolling 60 s window, deduped by quote) or by the user.

**Study session** (timer as timestamps; time left is derived):

```
(no row) --Start (href.study(id, { start: true }))--> running(startedAt, pausedMs 0)
running <--pause/resume--> paused
running|paused --next step on the last step / End session--> completed | ended
```

Opening `/study/[blockId]` without `start` is a preview: the plan is generated in memory and no row is created, so a future block's status never flips. Opening it twice with `start` finds the same row. `sessionClock(session, now, pomodoro)` returns elapsed, left, fraction, the Pomodoro phase (25 minutes focus and 5 minutes break by default, derived from elapsed time) and the current step's overrun.

**Study block status** (derived): `skipped` if its override status says so; `done` if a session completed or ended, or its override status is `done`; `inProgress` if its session is running or paused; `now` inside its interval; `missed` after it; otherwise `upcoming`.

**Practice attempt and solution**: an attempt is `{ choice }`. `gradeOf(question, attempt)` returns `unanswered`, `checking` (a choice exists and the key is `none`) or `answered { correct }`. A solution row either exists or it doesn't. Its loading and error states live in memory, as in today's reducer, so a reload resumes them.

**Guide section**: a missing `draft` means not written yet. `lastError` records the last failed write. With a draft present, that means the old draft stays on screen beside the rewrite error. `sectionStale(section, courseSources)` is derived: `stale` with `because: "Lecture 8 slides added"` when any material or saved lecture for the course is newer than `draft.sourceStamp`.

**Calendar import** (UI state, Calendar-owned): `idle -> reading -> preview(proposal) -> committing -> done(importId, Undo) | failed(kind)`. Undo deletes the import's events and batch, then calls `courseActions.release(importId)`. The plan re-derives without those blocks.

**AI call** (client): `pending -> settled(output) | failed(AiError)`. Streams add `streaming(text so far)`. List tasks add `items(n)`. Both can be stopped.

---

## 6. Scheduler

### 6.1 Signature

```ts
schedule(input: PlanInput): PlanOutput

PlanInput  = { zone, window, courses, events, imports, topics, overrides, sessions, prefs }
PlanOutput = { blocks: StudyBlock[], unplaced: Unplaced[], conflicts: OverrideConflict[] }
```

`schedule` has no clock input and never reads `Date.now()`. Placement depends on the calendar, the imports' `planFrom`, overrides, session snapshots and preferences. `now` only labels status. A block that was planned for this morning stays there after the morning passes. It becomes `missed`, and Reschedule moves it. The window runs from the earliest `planFrom` (or authored block) to the last event plus 7 days, so every view sees the same plan whatever range it shows. A semester is about 400 blocks, and a full run takes milliseconds.

`topics` resolves a lecture's topic: the Lecture record's topic once notes exist, else the event's topic from the syllabus or the sample, else `Lec 9`.

### 6.2 Demand rules

Each rule produces demands with a stable anchor id, minutes, an allowed window and a preferred time.

| Kind (id) | One per | Minutes | Allowed window | Preferred | Titles (calendar / timeline) |
| --- | --- | --- | --- | --- | --- |
| review n 1 (`review.<evt>.1`) | lecture | 30, or 45 when the course has a test within 21 days after the lecture (`why.boostedBy`) | lecture end + 15 min to lecture end + 36 h | first fit that day, else next day from 09:00 | `Review · Recursion` / `Review — Recursion & tree traversal` |
| review n 2 (`review.<evt>.2`), spaced | lecture whose course has a test within 21 days | 45 | the next local day, 09:00 to 22:00 | from 09:00 | same titles; sentence `Review 1 day after lecture` |
| midweek (`midweek.<course>.<week>`) | course × ISO week with 2 or more lectures | 30 | Tue 12:00 to Thu 22:00 | Wed 14:00 to 17:00, then Thu, then Tue | `Mid-week · PSY` / `Mid-week review — Memory & learning` |
| endOfWeek (`eow.<week>`) | ISO week with any lecture | 90 | Sat 09:00 to Sun 22:00 | Sat 11:00 | `End-of-week review` |
| testPrep (`prep.<evt>.<i>`) | test × i of n; n by weight: quiz 0, test 4, midterm 6, exam 8 | 60; the last is 120 with note `Past paper, timed` | day = test day − span + round((i − 1)(span − 1)/(n − 1)), span: test 12, midterm 7, exam 14; 09:00 to 22:00, then the day before | 13:00 | `Test 2 prep · 1 of 4` |
| work (`work.<evt>.<i>`) | deadline × i of n; n = ceil(effort / 120), effort: small 0, medium 120, large 240 | up to 120 | due − 5 days to due − 3 h | 18:00 to 21:00, one per day, block n on the latest day | `Work block · PS4`; the last of 2 or more is `A2 final push` |
| custom (`custom.<key>`) | authored override | as given | as given | n/a | as given |

The prep formula reproduces Paper's numbering: `Test 2 prep · 1 of 4` lands 12 days before a test, and `Midterm prep · 3 of 6` 5 days before a midterm.

### 6.3 Placement

1. **Busy time** per local day: every timed `lecture`, `lab`, `test` and `busy` event, padded by `prefs.bufferMin` (15) on both sides. Deadlines and notes are not busy.
2. **Fixed placements first**:
   - session snapshots (`locked`; history never moves)
   - overrides with status `done` (locked even if they now conflict)
   - `pinned` placements
   - `authored` placements

   A pinned or authored block that now overlaps busy time (the calendar changed under it) is reported in `conflicts`. A pinned block is then placed by rule. An authored custom block goes to `unplaced`. A session whose anchor no longer exists is still emitted from its snapshot.
3. **Demands** are generated and clipped so they start no earlier than `planFrom` of their anchor's import. For midweek and endOfWeek, that is the latest `planFrom` among the lectures in that week. A demand whose window becomes empty produces nothing. A demand whose id was fixed in step 2 is dropped, so an authored override claims its anchor.
4. **Order**: testPrep, work, review, midweek, endOfWeek. Ties go to the earlier window end, then to the id, so input order never matters.
5. **First fit.** Candidate days run in preference order inside the window. Within a day, candidate starts step by 15 minutes from the preferred time forward, then backward. A start fits when the block:
   - lies inside `prefs.dayStart` to `prefs.dayEnd` (08:00 to 22:00, local wall time)
   - overlaps no busy time and no placed block
   - keeps the day under `prefs.maxStudyMinPerDay` (240)
6. **No fit** puts the demand in `unplaced` with its reason. Calendar shows `Couldn't fit 2 blocks before ECO101 PS4` with `Plan more time`, which raises the deadline's effort (an event field, so Calendar owns it). Skipped blocks are omitted.

Wall times are converted per day with `@date-fns/tz`. Sunday 1 November 2026 is the day Toronto falls back an hour, and it sits inside the sample week, so DST is tested from day one.

`findSlot(input, minutes, { after, before })` reuses step 5 for `planActions.reschedule`. `planActions.move` refuses an interval that overlaps busy time.

### 6.4 The sample semester and Paper fidelity

Paper's five weeks (Sep 28 to Nov 1 on the Month artboard, the last of them on Week and Day) are drawn by hand, so the rules alone never reproduce them. The sample handles this with the scheduler's own rules instead of a second mechanism:

- Every study block Paper draws in those weeks is an override with an `authored` placement and the anchor the rules would give it. For example, `Review · Recursion` is `review.evt_sample_csc148_l08.2` at Tue 10:30 to 11:15. Ids stay stable, sessions key by them, and Reschedule and Mark done work on them like any block without losing the authored text.
- The sample import's `planFrom` is Monday 00:00 after the Paper week. Rules plan everything from then on, including the rest of the midterm and Term Test 2 prep series, whose earlier parts are authored.
- Past authored blocks get completed sessions from `lib/sample/study.ts`, so October reads as done, not missed.
- A real import's `planFrom` is the moment it was imported, so a new course gets its reviews this week, and nothing is ever planned into the past.

This replaces both candidates' approaches. Hand-authored block rows that a re-plan deletes (candidate fable) become overrides the plan honours. "At most 8 overrides" (candidate opus) was infeasible: the judges counted about 13 rule-versus-Paper disagreements, and the old override shape could not carry a note.

### 6.5 What sits around the scheduler

- **`usePlan(range)`** reads events, imports, overrides, prefs, lecture topics and session snapshots with `useLive`. It runs `schedule` for the whole window, memoized on a fingerprint of the inputs, so a lecture heartbeat that changes no topic does not re-run it. It returns blocks, fixed events, a merged `agenda` for the range, `unplaced`, `conflicts` and `status(block)`.
- **`blockMaterials(block)`** returns what Today's card and the session viewer show:
  - the materials linked to the anchor lecture
  - course handouts whose title or section matches the topic
  - the lecture transcript
  - the practice question count for the topic, via `topicMatch`: stemmed token overlap of at least half the smaller set, so `Recursion & trees` matches `Recursion & tree traversal`. It feeds `+ 12 practice Qs` and links to the set with the most matches.
- **`blockTitle(block, style)` and `blockReasonText(block, style)`** produce every Paper string: `Review · Recursion`, `Review — Recursion & tree traversal`, `After-lecture · 45m`, `Review 1 day after lecture`, `Due Thu · 2h`, `A2 final push`.
- **`layoutLanes`** (overlap lanes for imported events) is a pure function in `features/calendar/lanes.ts`. Only Calendar draws lanes.

### 6.6 Tests (vitest, foundation-owned, `lib/plan/*.test.ts`)

1. **Sample week golden.** `schedule(sampleInput(2026-10-27T10:12 America/Toronto))` for Mon 26 Oct to Sun 1 Nov, rendered with `blockTitle` and `fmtRange`, equals the 25-row Paper week table in `docs/design/calendar.md`: titles, second lines, starts, ends and the note.
2. **Sample month golden.** The October month cells equal the Month artboard table (study chips per day, in order).
3. **Rules week snapshot.** The same calendar with the authored overrides removed and `planFrom` moved to Mon 26 Oct 00:00 yields `lib/plan/__fixtures__/rules-week.txt`. The foundation owner reviews that snapshot once and commits it. Its header lists the expected differences from Paper (15-minute buffer after lectures, MAT137 reviews on Tue, Wed and Fri, a review for CSC148 Lecture 10, A2 work block 1 of 2, midterm prep 1 and 2 of 6 on Fri and Sat, and prep 3 of 6 at 60 minutes with no note). It changes only in a reviewed commit.
4. **Invariants** on 200 random calendars from a seeded generator:
   - no overlap with busy time or other blocks
   - every block inside the day window
   - reviews after their lecture
   - prep and work end before their anchor
   - daily cap respected
   - no rule block before its `planFrom`
5. **Determinism.** Output is deep-equal for shuffled input arrays and for repeated runs.
6. **Stable ids.** Adding an unrelated event changes no block id.
7. **DST.** The sample Sunday blocks sit at 1 to 2pm and 3 to 5pm local.
8. **History and pins.**
   - a block with a session never moves
   - a done block keeps its interval
   - a pinned block survives an unrelated change
   - a pinned block under a newly imported lecture is reported and re-placed
   - rescheduling an authored block keeps its topic and note
   - Undo of an import removes exactly its blocks

---

## 7. Retrieval and citations

Retrieval feeds the ask panels, session plans, worked solutions, guide sections, question generation and related coursework. It runs in the browser, because the content is in the browser.

### 7.1 Chunking (pure, deterministic ids `<sourceKey>#<n>`)

| Source | Unit | Ref and labels |
| --- | --- | --- |
| Slides | one chunk per slide | `page` ref → `Slide 17`, `Lecture 8 slides · Slide 17`, `Lecture 7 slides 6–8` |
| Textbook, handout, notes, problem set, syllabus | page text split at paragraphs into windows of at most 350 tokens, one paragraph of overlap, section and page label carried | `§5.2`, `Textbook ch. 5, p. 92`, `A2 handout §3`, `Problem Set 4, Q1` |
| Lecture transcript | 45 to 90 s windows of cleaned segments, cut at segment boundaries | `transcript` ref → `Transcript 41:05`, `Lecture 8 transcript · 41:05`, `Lecture 7 at 4:15` |
| Practice question | prompt, options, and the explanation when a solution exists | `question` ref → `2024 Term Test 2, Q4` |

`reindexSource(key)` re-chunks one source and replaces its rows in one transaction, so it is idempotent. It is the only writer of `chunks`. Ingest, lecture save, a solution's arrival and the sample seed call it.

### 7.2 Embeddings

- There is one embedder: `Qwen/Qwen3-Embedding-8B` with `dimensions: 1024`, in token-factory mode only. Mock and OpenRouter modes run lexical retrieval only. This keeps the walkthrough deterministic with no key and no indexer timing in the gate.
- `startIndexer` (started by `<Boot>` in token-factory mode) embeds chunks that have no vector, in batches of 32 through `ai("embed")`. Vectors travel as base64 float32. It backs off on errors and stops on `budget`. Measured cost is about $0.00001 per batch, at a median of 2.65 s.
- Each vector records the embedder that made it, and search compares only vectors from the active one.
- Queries use the prefix `Instruct: Given a student question, retrieve relevant course material\nQuery: …`. Documents are embedded as plain text, per the measurements.

### 7.3 Ranking

`retrieve({ courseId, text, k = 8, within?, prefer?, latency? })`:

1. **Candidates**: the course's chunks (or every course when `courseId` is null), narrowed by `within`.
2. **Lexical**: BM25 over the candidates, with an inverted index built per course in memory and cached by the course's chunk count and newest id. It catches exact terms the embedder blurs: `§5.2`, `Term Test 2`, `is_empty`.
3. **Dense**: brute-force cosine against the query vector, when the chunks have vectors. `latency: "interactive"` (Quick ask) gives the query embedding 500 ms, then falls back to lexical only. `"thorough"` (Deep ask, plans, solutions, guides, generation) waits for it.
4. **Fusion**: reciprocal rank fusion, `Σ 1/(60 + rank)`, plus 0.005 for chunks in `prefer` (the session's lecture). Then at most 2 passages per page or per transcript minute.

There is no reranker on Token Factory, and none is needed at this scale. Passages sent to the model are capped at 24,000 characters, which keeps every request body far under Vercel's 4.5 MB limit.

`livePassages(lectureId, fromMs)` serves the note taker's `Uses the last 5 minutes`. It reads `segments` directly and windows them with the transcript chunker, because transcript chunks are written only at save.

### 7.4 Citations

Passages go to the model as `[S1] Lecture 8 slides · Slide 17\n<text>`. Streamed answers cite with `[S1]` markers. `parseCitations(text, passages)` removes the markers, keeps the citations in order of first mention, drops ids it did not send, and returns `{ text, citations: SourceRef[] }`. Structured outputs (plan steps, solutions, generated questions, guide blocks) carry passage ids, and `refsFor(ids, passages)` is the one resolver.

A guide block's cites become one footnote per block. Each cite can carry `relation` (`used`, `tested`) and `note` (`redrawn from the whiteboard sketch`), and `footnoteText` writes the Paper phrasing: `Lecture 7 at 4:15. Textbook ch. 5, p. 92.`

Chips render `sourceLabel(ref, "chip")`, resource rows `"meta"`, and footnotes `"footnote"`. `useOpenSource()` opens page and transcript refs in `SourcePeek` over the current screen, so a running session or practice paper is never lost. Question, assessment and section refs navigate through `href`. A screen can take over chip clicks with `ChatThread`'s `onOpenSource`, as Study does to switch its own viewer tab.

There is no web search. Paper's `docs.python.org` chip has no source in this design (open question 6).

---

## 8. AI layer

### 8.1 Models and profiles (`lib/ai/models.ts`, the only place model IDs and prices appear)

| Profile | Token Factory model | OpenRouter fallback | Thinking | Temp |
| --- | --- | --- | --- | --- |
| `vision` | `nvidia/Nemotron-3.5-Super-VL` | `nvidia/nemotron-3.5-super-vl:free` | off | 0.1 |
| `reason` | `nvidia/Nemotron-3-Ultra-550b-a55b` | `nvidia/nemotron-3-ultra-550b-a55b:free` | on | 0.6 |
| `chat` | `nvidia/Nemotron-3-Ultra-550b-a55b` | same as above | off | 0.4 |
| `fast` | `nvidia/Nemotron-3_5-Lightning` | `nvidia/nemotron-3.5-lightning:free` | off | 0.2 |
| `embed` | `Qwen/Qwen3-Embedding-8B`, 1,024 dims | none (lexical only) | n/a | n/a |

- **Closed model set.** `ModelKey` is a closed union of these four models, so Super 120B and Nano cannot be named.
- **No paid fallback.** OpenRouter ids are literal `:free` constants, and the `MODEL_*` and `LLM_BASE_URL` overrides are removed, so the uncapped path cannot reach a paid model (fragile point 5).
- **Prices.** The embedder is priced at $0.01/M. An image counts as 3,400 tokens (measured cap 3,317).
- **Thinking switch.** Thinking is turned off with `chat_template_kwargs: { enable_thinking: false }` on Token Factory and `reasoning: { enabled: false }` on OpenRouter.
- **No tools.** No task sends `tools` or `tool_choice`.

### 8.2 Task registry

`lib/ai/registry.ts` is `{ ...chatTasks, ...retrievalTasks, ...materialTasks, ...todayTasks, ...calendarTasks, ...lectureTasks, ...studyTasks, ...practiceTasks, ...guideTasks }`. Foundation writes the nine imports once. Each feature changes only its own `tasks.ts`, and `defineTasks(prefix, …)` prefixes every key, so two features cannot collide. Every task declares `input` (zod), `output` or `item` (zod), `profile`, `maxTokens`, `prompt`, `example` and `mock`.

`response_format` is `json_schema` derived from the output schema with `z.toJSONSchema`, so it cannot drift from the parser. `TaskInput`, `TaskOutput` and `TaskItem` are derived from `typeof registry` (probed in the type sketch), so client calls are typed end to end. With thinking on, every prompt also describes its JSON in the system message, because the grammar constrains only `content` (measured: without it the model answers the first enum value). Empty `content` is a `bad_output` and is retried. A task whose strings carry line breaks (code, page text, paragraphs) sets `multiline: true` and gets the schema in the prompt only, because the grammar drops line breaks inside strings (docs/research/token-factory.md 2.2a).

| Task | Owner (file) | Kind | Model · thinking | max_tokens | Temp | Input → output (zod in the task file) |
| --- | --- | --- | --- | --- | --- | --- |
| `ask` | F `lib/chat/tasks.ts` | stream | Quick: Ultra · off (`chat`); Deep: Ultra · on (`reason`) | 1,000 / 8,000 | 0.4 / 0.6 | `AskInput` (scope, mode, question, 12-turn history, passages, subject with `hideAnswer`) → text with `[S#]` markers; Deep also streams thinking |
| `embed` | F `lib/retrieval/tasks.ts` | embed | Qwen3-Embedding-8B, 1,024 dims | n/a | n/a | `{ texts ≤ 32, as: document \| query }` → `{ vectors }` |
| `material.read` | F `lib/materials/tasks.ts` | json | Super VL · off (`vision`) | 12,000 | 0.1 | `{ pages ≤ 3 }` → `{ pages: { page, text, slide?, section?, label? }[] }`; only pages whose text layer is under 200 chars |
| `today.brief` | T | json | Ultra · off (`chat`) | 300 | 0.4 | `{ sessions, nextTest?, ruleBased }` → `{ headline, subline }`; rule-based text renders first |
| `calendar.read` | C | json, strict | Super VL · off (`vision`) | 2,000 | 0 | `{ pages, termStart }` → `TimetableRead` (day enum, `HH:MM` pattern, dated items); code validates and expands over the term |
| `lecture.clean` | L | json | Lightning · off (`fast`) | 2,000 | 0.2 | `{ raw ≤ 4,000, before }` → `{ sentences ≤ 40 }`; one call per audio chunk |
| `lecture.hints` | L | json | Lightning · off (`fast`) | 2,000 | 0.2 | `{ course, window (60 s), assessments }` → `{ hints, tasks, mentions }` |
| `lecture.notes` | L | json | Ultra · off (`chat`) | 4,000 | 0.3 | `{ course, topic, transcript }` → `{ summary, keyPoints }`; once at save |
| `study.plan` | S | json | Ultra · on (`reason`) | 8,000 | 0.6 | `StudyPlanInput` → `{ steps: { title, kind, minutes, source: S#, check }[], moment: S# }`; code rescales minutes to the focus minutes |
| `practice.parse` | P | json | Super VL · off (`vision`) | 12,000 | 0.1 | `{ pages ≤ 3, totalPages }` → `PaperChunkRead` (questions with marks, answer key) |
| `practice.solve` | P | json | Ultra · on (`reason`) | 8,000 | 0.6 | `{ question, passages }` → `{ answer, explanation, steps {label,text}, conclusion, whyNot, resources: S# }` |
| `practice.generate` | P | list | Ultra · on (`reason`) | 8,000 | 0.8 | `GenerateInput` → items `GeneratedQuestion` (at most 10); each then checked |
| `practice.check` | P | json | Ultra · off (`chat`) | 500 | 0 | `{ prompt, options }` → `{ answer }`; a generated question is dropped when this disagrees with its key |
| `guide.outline` | G | json | Ultra · on (`reason`) | 8,000 | 0.6 | `{ course, materials (titles, headings), lectures }` → `{ chapters: { title, textbookChapter?, sections }[] }` |
| `guide.section` | G | list | Ultra · off (`chat`) | 6,000 | 0.5 | `GuideSectionInput` → items `GuideBlockDraft` (at most 12; cites carry relation and note); placeholders fill block by block; `multiline` (code blocks) |

A list task asks the model for `{ items: T[] }` under `json_schema`. The server parses each completed array element as it arrives, validates it with `item`, and forwards it as one NDJSON line. An invalid item is dropped and counted. Zero valid items is `bad_output`.

### 8.3 Client surface (`lib/ai`)

```ts
ai<N extends JsonTaskName>(name, input, opts?: { signal? }): Promise<TaskOutput<N>>
aiItems<N extends ListTaskName>(name, input, opts?): AsyncIterable<TaskItem<N>>
aiStream<N extends StreamTaskName>(name, input, opts?): AsyncIterable<StreamEvent>   // text | thinking | done
class AiError { kind: AiErrorKind; message; retryAfterMs?; capUsd? }
errorCopy(error): { title; detail?; retry }      // the one place UI copy for errors lives
useAiStatus(): { mode: "token-factory" | "openrouter" | "mock"; embedder; spend? }
```

The client imports the registry with `import type`, so prompts and mocks never ship to the browser. Request bodies, NDJSON lines, usage fields and HTTP codes are private to `lib/ai`. `lib/ai/server/*` imports `server-only`, and `lib/db` imports `client-only`, so a wrong import fails the build.

### 8.4 Server path (`runTask`, called by `app/api/ai/[task]/route.ts`, `maxDuration = 300`)

1. **Origin and throttle.** A cross-origin request is refused (`bad_input`, 403). The client throttle (one key per client IP hash, 60 requests per 10 minutes) answers `rate_limited` with `Retry-After`.
2. **Lookup and input.** An unknown task is 404. A body that fails `task.input` is 400 `bad_input`.
3. **Mock mode** returns `task.mock(input)`, streamed with the real protocol for stream and list tasks.
4. **Prompt and estimate.** Build the prompt. Estimate input tokens as characters / 3 plus 3,400 per image.
5. **Attempts.** Every attempt, retry and repair shares `ROUTE_BUDGET_MS` (280 s).
   - Each attempt reserves its own worst case (Token Factory only), then calls the provider with `signal: req.signal`, SDK `maxRetries: 0` and the remaining budget as its timeout.
   - It settles to real usage, or to the worst case when usage is missing.
   - It retries 429, 5xx and timeouts while more than 30 s remain, honouring `Retry-After` up to 20 s.
   - Stream and list tasks retry only before their first forwarded byte, so text is never duplicated.

   This counts every upstream attempt (fragile point 4), stops upstream work when the browser cancels (fragile point 8), and never outlives the function.
6. **JSON tasks**: `extractJson`, then `task.output.safeParse`. On failure, one repair attempt sends the zod error back, under the same budget rule. Still invalid: 502 `bad_output`.
7. **Stream and list tasks** answer `application/x-ndjson`, encoded and decoded in `lib/ai/wire.ts` only. Usage is read from the final chunk, where `choices` is empty, and settled in `finally`.

Error kinds and status codes: `bad_input` 400, `missing_key` 500, `budget` 402, `rate_limited` 429, `too_large` 413, `bad_output` 502, `upstream` 502. The client adds `offline` and `aborted`. Domain outcomes such as "no questions found" are Practice results, not AI errors.

### 8.5 Spending cap

- **`LedgerStore`** has three methods, `reserve(hold, cap, now)`, `settle(holdId, actual)` and `status(now)`, in integer micro-dollars.
- **Expired holds.** Reserve first charges every expired unsettled hold at its full amount. The hold TTL (10 minutes) is longer than any live call (280 s), so an expired hold means the function died, and the cap stays safe. A late settle corrects the charge down to the actual cost. Settle is idempotent (`settled:<id>`).
- **`FileLedger`** keeps today's JSON file and promise queue for local dev. A corrupt file fails closed instead of reading as $0 (fragile point 3).
- **`RedisLedger`** (Upstash REST) runs reserve and settle as Lua scripts, atomic across every instance. It ships behind `UPSTASH_REDIS_REST_URL` and needs the operator before any deploy.
- **Selection.** Redis when configured. Otherwise the file, unless `VERCEL` is set, in which case every Token Factory call fails closed with `budget` ("the cap can't be checked").
- **`SPEND_CAP_USD`** is parsed at startup as a positive finite number. Anything else fails closed (fragile point 2).
- **Spend display.** `/api/status` returns `{ spentUsd, capUsd }`. In token-factory mode the sidebar's `SpendMeter` shows `$0.03 of $30`. Budget copy reads the configured cap, never a hard-coded `$30` (fragile point 6).

### 8.6 Mocks and live checks

- **Mode selection.** `token-factory` when `NEBIUS_API_KEY` is set; `openrouter` when only `LLM_API_KEY` is set; `mock` when `CUE_AI=mock`, or when no key is set and `NODE_ENV` is not production. `CUE_AI=mock` is refused when `VERCEL_ENV=production`.
- **Mocks** are deterministic and written against `SAMPLE` ids. The `ask` mock cites only passages it actually received (by label), so a retrieval regression fails the walkthrough as a missing chip.
- **`GET /api/ai`** lists every task with its profile and `example`.
- **`scripts/check-nemotron.mjs`** posts each example to a running server. It reads stream and list responses to their `done` line and fails on an `error` line. It refuses to report a pass when `/api/status` says `mock`. Without `NEBIUS_API_KEY` it runs on OpenRouter and reports Token Factory as INCONCLUSIVE.

---

## 9. Routes

| URL | Group | Owner | Renders |
| --- | --- | --- | --- |
| `/` | browse | T | Today. Empty state: `Add your schedule to plan today.`, `Upload calendar`, `Try the sample semester` |
| `/calendar?view=week\|day\|month&date=YYYY-MM-DD&add=1` | browse | C | Calendar; view and date in the URL so reload and Back work; `add=1` opens the import dialog |
| `/study` | browse | S | upcoming blocks with Start, past sessions |
| `/study/[blockId]?start=1&tab=` | focus | S | without `start`: read-only preview (plan in memory, `Start session` button). With `start`: create or resume the session, then drop the param |
| `/lectures` | browse | L | lectures by course, `Record a lecture` for ad hoc notes |
| `/lectures/[lectureId]?t=<ms>` | focus | L | note taker when ready, recording or paused; saved notes when saved; `t` scrolls the transcript. A `lec.<eventId>` id with no row renders the ready state, and the row is created on Start |
| `/practice` | browse | P | papers, upload (Intake), generated sets; `?generate=<scope>` creates a set and replaces the URL with it |
| `/practice/[setId]?q=&topic=` | focus | P | the practice screen; `Esc` returns to the previous browse screen |
| `/guides` | browse | G | redirect to the most recently read course, else the first course with a guide |
| `/guides/[courseId]/[[...section]]` | browse | G | guide with contents nav; no section opens the last-read or first section |
| `/export/guide/[courseId]` | focus | G | every section, print stylesheet, `window.print()` once ready |
| `POST /api/ai/[task]` | | F | the AI gateway, JSON or NDJSON by task kind |
| `GET /api/ai` | | F | task list with examples |
| `GET /api/status` | | F | AI mode, embedder, spend |

- **IDs in URLs** come from constructors that keep them URL-safe: `review.evt_9f2c1a.2`, `prep.evt_x81.3`, `lec.evt_9f2c1a`, `lec.adhoc.k3j9`. A section URL carries only the slug of its `SectionId`.
- **Pages** are client components that read IndexedDB. Route files await `params` (a Promise in Next 16) and pass plain values down. Nothing reads cookies, so no route is forced dynamic, and Cache Components stay off.
- **Cross-feature entry points are URL contracts in `href`**, never imports:
  - Today's Start goes to `href.study(id, { start: true })`.
  - A material chip goes to `href.study(id, { tab })`, which opens the preview.
  - `+ 12 practice Qs` goes to `href.practiceSet(setId, { topic })`.
  - A calendar lecture's `Take notes` goes to `href.lecture(ids.lectureForEvent(eventId))`.
  - Guides' `Quiz me on this section` and Study's `Quiz me on this` go to `href.practice({ generate: scope })`.
  - An assessment link goes to `href.calendar({ view: "day", date })`.

---

## 10. App shell

- **Root layout** (F): Timeless Sans through `next/font/local` with the 400 to 499 range trick kept, `<html className={font.variable}>`, `body.relative`, an `isolate` wrapper, one `TooltipProvider`, the Base UI `Toaster`, and `<Boot>`. Boot requests persistent storage, resumes pending ingests, starts the indexer in token-factory mode and loads `/api/status`.
- **Browse layout** (F):
  - `SidebarProvider` with `--sidebar-width: 232px` and `defaultOpen` on the client (no cookie read).
  - An icon rail from 768 to 1023 px and an off-canvas Sheet below 768.
  - `AppSidebar`: the wordmark link with the mascot, and the six `NAV` items (`Today`, `Calendar`, `Study sessions`, `Lecture notes`, `Practice`, `Study guides`) with `aria-current="page"`.
  - The sidebar footer: `SpendMeter` (token-factory mode only) and `DataMenu` (`Load sample semester`, `Reset all data`).
  - The main column uses document scroll. Today, Calendar, the guide reader and the three index pages are browse screens.
- **Focus layout** (F): a full-bleed `h-dvh` frame with no docked sidebar. `Cmd/Ctrl+B` opens the same `AppNav` in a left Sheet (232 wide) over the content, so a live transcript or a timed paper never reflows. Study session, the note taker and saved notes, the practice paper and the export view are focus screens. Each has its own exit: `End session`, `End and save notes`, `Esc` in Practice.
- **Live badges** (F): `LiveBadges` reads `useLiveActivity(now)`. A lecture whose `lectureLive` is `recording` shows an 8px dot and `Recording` next to Lecture notes. A running session shows its time left next to Study sessions. Neither imports feature code.
- **Keyboard**: single-letter shortcuts exist only on focus screens, only when focus is outside a text field, are declared with `aria-keyshortcuts`, and are scoped to the screen's root element, not `window` (fragile point 13).
- **Tokens**:
  - Cue tokens and the shadcn variables, all in OKLCH (the tables in `practice.md` section 7 and `shadcn-base-ui.md`).
  - `--radius: 10px`, so `rounded-sm` is Paper's 6, and `--radius-xs: 4px`.
  - Color tokens `--color-ink-hover`, `--color-guide`.
  - Type tokens `--text-xs` / `--text-base` / `--text-2xl` for Today, Month and charts, `--weight-regular: 420`, `--tracking-display: -0.02em`.
  - `check-tokens.mjs` scans `app/`, `components/`, `features/` and `lib/` for hex, rgb and hsl colors, and for imports of `@base-ui/react` outside `components/ui`. lucide imports are allowed anywhere.
- **Headers** (`next.config.ts`, F): the Tailwind Turbopack loader, plus `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` on every route, so Parakeet's WASM fallback can use threads. Isolation applies to a whole document, and client navigation keeps the first document, so it cannot be scoped to `/lectures`.

---

## 11. Workstream partition

Six feature worktrees start from the foundation commit. Each owns disjoint paths and writes disjoint tables. They meet only through `@/lib` modules, the database and URLs. Every row's done-check includes the common gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && node scripts/check-ownership.mjs <key> && node scripts/e2e/walkthrough.mjs --only boot,<key>`.

### 11.1 Ownership table

| Workstream | Owns (exact paths; `workstreams.ts` is authoritative) | May read | Must not touch | Done-check (plus the common gate) |
| --- | --- | --- | --- | --- |
| **F** Foundation | `app/layout.tsx`, `app/globals.css`, `app/fonts/**`, `app/(browse)/layout.tsx`, `app/(focus)/layout.tsx`, `app/api/**`, `components/**`, `hooks/**`, `lib/**` except `lib/domain/payload/**` and `lib/sample/{study,lectures,practice,guides}.ts`, `eslint-rules/**`, `scripts/check-*.mjs`, `scripts/e2e/walkthrough.mjs`, `scripts/e2e/lib/**`, `scripts/e2e/steps/boot.mjs`, `scripts/fixtures/audio/**`, `workstreams.ts`, `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `components.json`, `.env.example`, `.gitignore`, `AGENTS.md`, `docs/**` except feature change requests. Writes prefs, courses, overrides, materials, pages, blobs, chunks, messages. Tasks `ask`, `embed`, `material.read` | everything | feature paths after the foundation commit (follow-ups land as integrator commits on main) | section 12's gate; every feature's stub step passes; `node scripts/check-ownership.mjs --all` reports one owner per tracked file |
| **T** Today | `app/(browse)/page.tsx`, `features/today/**`, `scripts/e2e/steps/today.mjs`, `docs/change-requests/today-*.md`. Writes no table. Task `today.brief` | `@/lib/{plan,time,routes,sources,db,prefs,ai}`, `@/components/{ui,cue}`; tables events, lectures, segments (hint counts), sessions, materials, questions | `lib/**`, `components/**`, other features and route folders, `package.json` | the today step passes including the reschedule path; unit tests for brief text rules (`Three sessions today. Start with recursion.`) and row trailing texts |
| **C** Calendar | `app/(browse)/calendar/**`, `features/calendar/**`, `scripts/e2e/steps/calendar.mjs`, `scripts/fixtures/calendar/**`, `docs/change-requests/calendar-*.md`. Writes events, imports. Task `calendar.read` | `@/lib/{plan,time,routes,courses,materials,sources,db,ai}`, `@/components/{ui,cue}`; tables lectures (notes saved, live), sessions | `lib/**` including `lib/plan` (scheduler changes are change requests), `components/**`, other features | the calendar step passes (week, day, month shots; ICS import and Undo; vision import preview); unit tests for ICS (RRULE, EXDATE, stable ids on re-import, course detection, non-course events as `busy`), timetable expansion over the term, `layoutLanes` |
| **L** Lecture notes | `app/(browse)/lectures/**`, `app/(focus)/lectures/**`, `features/lectures/**`, `public/lectures/**`, `lib/domain/payload/lectures.ts`, `lib/sample/lectures.ts`, `scripts/e2e/steps/lectures.mjs`, `scripts/fixtures/lectures/**`, `docs/change-requests/lectures-*.md`. Writes lectures, segments, links, audio; prefs slice `lectures`. Tasks `lecture.clean`, `lecture.hints`, `lecture.notes` | `@/lib/{retrieval,chat,plan,sources,time,routes,db,prefs,ai}`, `@/components/{ui,cue}`; tables events, materials, questions | `lib/**` except its payload and sample files, `components/**`, other features, `next.config.ts` (headers are F's) | the lectures step passes (live Paper state, ask, pause, flag, save, saved view, fresh recording); unit tests for the cutter on `scripts/fixtures/audio/lecture.wav`, segment timestamps, hint dedupe, mention resolution, `latexToUnicode`, demo engine timing; `scripts/e2e/parakeet.mjs` exists (live-only) |
| **S** Study sessions | `app/(browse)/study/**`, `app/(focus)/study/**`, `features/study/**`, `lib/domain/payload/study.ts`, `lib/sample/study.ts`, `scripts/e2e/steps/study.mjs`, `docs/change-requests/study-*.md`. Writes sessions; prefs slice `study`. Task `study.plan` | `@/lib/{plan,retrieval,chat,sources,materials,time,routes,db,prefs,ai}`, `@/components/{ui,cue}`; tables materials, pages, segments, lectures, questions | `lib/**` except its payload and sample files, `components/**`, other features | the study step passes (preview, start, timer, steps, viewer, moment, Quick and Deep ask, budget notice, end); unit tests for plan normalization (minutes sum to focus minutes), step transitions, `Over by 1 min` |
| **P** Practice | `app/(browse)/practice/**`, `app/(focus)/practice/**`, `features/practice/**`, `lib/domain/payload/practice.ts`, `lib/sample/practice.ts`, `scripts/e2e/steps/practice.mjs`, `scripts/fixtures/practice/**`, `docs/change-requests/practice-*.md`. Writes practiceSets, questions, attempts, solutions. Tasks `practice.parse`, `.solve`, `.generate`, `.check` | `@/lib/{materials,retrieval,chat,sources,courses,routes,db,ai}`, `@/components/{ui,cue}`; tables guideSections (draft plainText), messages (generation scopes) | `lib/**` except its payload and sample files, `components/**`, other features | the practice step passes (Paper state, resources, filter, Ask why, Write questions, migrated harness scenarios); unit tests for the reducer, `buildExam`, parse and solve schemas, generated-question checks |
| **G** Study guides | `app/(browse)/guides/**`, `app/(focus)/export/**`, `features/guides/**`, `lib/domain/payload/guides.ts`, `lib/sample/guides.ts`, `scripts/e2e/steps/guides.mjs`, `scripts/fixtures/guides/**`, `docs/change-requests/guides-*.md`. Writes guides, guideSections. Tasks `guide.outline`, `guide.section` | `@/lib/{retrieval,sources,materials,routes,db,ai}`, `@/components/{ui,cue}` incl. `AddMaterialDialog`; tables materials, lectures, segments, messages (saved answers) | `lib/**` except its payload and sample files, `components/**`, other features | the guides step passes (Paper section, footnotes, charts, course switch, write, stale and rewrite, export); unit tests for chart geometry against `study-guide.md` 3.3 (Q2 10.03, x 150.25; `Q2 Q1` merge under 24 px) and footnote numbering from cites |

### 11.2 Guards that make a wrong change fail where it is made

- **`eslint.config.mjs`** builds its rules from `workstreams.ts`:
  - In `features/<x>/**`, imports of `@/features/<y>` are errors.
  - Outside `components/ui`, imports of `@base-ui/react` are errors.
  - Everywhere, imports of `@/lib/*/internal/*` are errors.
  - Imports of `@/lib/domain/payload/<x>` are errors outside `features/<x>`, `lib/db` and `lib/sample/<x>.ts`.
- **`eslint-rules/table-writers.mjs`** (`cue/table-writers`) walks every call chain rooted at `db.<table>`, including `where(...)`, `filter(...)`, `toCollection()` and `Collection.modify()` / `.delete()`. A write method (`put`, `add`, `update`, `delete`, `bulk*`, `clear`, `modify`) on a table the file's workstream does not write is an error. `db.table(...)` is banned outside `lib/db`.
- **`eslint-rules/prefs-owner.mjs`** (`cue/prefs-owner`) makes the first argument of `setPrefs` in `features/<x>/**` the literal `"<x>"`.
- **`scripts/check-ownership.mjs <key>`** fails when `git diff --name-only main...` touches a path outside the workstream's globs. `--all` checks that every tracked file has exactly one owner and that every route folder belongs to someone.
- **Compile-time checks in the type sketch**: `OWNERSHIP_CHECK` fails when a table has no writer or two, and `SCHEMA_V1`'s typed key paths fail on a renamed indexed field.

### 11.3 Change requests

A feature that needs a shared change writes `docs/change-requests/<key>-<n>.md`, one file per request, so requests never conflict textually. Each file has five lines: what is needed, why, the proposed diff (type, index, field, dependency, component or href), the local workaround in use, and the step it unblocks. The integrator lands accepted requests on main as small commits during the parallel phase, and every worktree rebases.

Expected requests are cheap by design. A feature may add optional fields to its own payload file and rows to its own sample fragment without asking.

### 11.4 Merge order

Foundation follow-ups first, then Practice (it touches the most moved code), Calendar, Lectures, Study, Guides, Today (it reads everything and writes nothing). Paths are disjoint, so order matters only for the walkthrough. The walkthrough runs with `--integrated` after each merge, which turns on the cross-screen assertions in every step.

---

## 12. Foundation unit: exact scope

Foundation is one owner, blocking. Features start when steps 1 to 9 pass. Steps 10 and 11 may trail into the parallel phase, because no feature depends on them.

1. **Tooling.**
   - Tailwind 4 through the Turbopack loader.
   - `shadcn@4.23.0 init -b base -p nova`, then add every component the specs name: button, select, tabs, sidebar, sheet, dialog, alert-dialog, popover, dropdown-menu, tooltip, progress, scroll-area, badge, card, input, input-group, textarea, separator, toggle-group, checkbox, collapsible, skeleton, toast, item, kbd, field, empty, spinner, drawer. Restyle them to Cue.
   - The `use-mobile` fix; ESLint with the TypeScript 6 alias; vitest; Playwright.
   - Every dependency a feature needs: dexie, dexie-react-hooks, @date-fns/tz, ical.js, @huggingface/transformers, @upstash/redis, lucide-react, zod, openai, pdfjs-dist, client-only, server-only.

   Done when: `pnpm typecheck && pnpm lint && pnpm build` pass on an empty shell.
2. **Tokens, fonts, both layouts, the shell.** The sidebar with NAV, the nav Sheet, `LiveBadges`, `SpendMeter`, `DataMenu`, `<Boot>`. COOP/COEP headers.

   Done when: `/` and a stub focus route render at 1440 and 375 with no console errors.
3. **Core data.** `lib/db` (all 21 tables, `SCHEMA_V1`, `useLive`, `useLiveActivity`), `lib/domain` (every type in `types.ts`, the derived functions and their tests), `lib/time` (with the Paper format tests), `lib/courses`, `lib/prefs`, `lib/routes`, `lib/testids`, `lib/sources` (`sourceLabel` and `footnoteText` tests against every Paper string), and `workstreams.ts` with the derived `TABLE_WRITERS`.
4. **`lib/plan`.** Schedule, `findSlot`, `usePlan`, `planActions`, titles, `blockMaterials`, `topicMatch`, with tests 1 to 8 of section 6.6 passing. The rules-week snapshot is reviewed and committed.
5. **`lib/ai`.** Models, profiles, define, registry with all nine task files (feature files as stubs `defineTasks(prefix, {})`, except Practice, whose tasks move here from `lib/llm.ts`), the wire protocol including list tasks, `runTask` with the shared deadline, `FileLedger` with expired-hold charging, the throttle, `/api/ai` and `/api/status`, `errorCopy`.

   Done when: one ledger contract suite passes against `FileLedger` and an in-memory Lua-equivalent store, and every task's `mock(example)` parses with its own schema.
6. **Shared AI-backed modules.** `lib/materials` (ingest, resume, remove, pages), `lib/retrieval` (chunkers, BM25, fusion, indexer, `livePassages`, `parseCitations`, `refsFor`), `lib/chat` (`useChat`, the four scope prompts, the `ask` task and its mock), and the shared `components/cue` parts (ChatThread, Composer, SourceChip, SourceView, SourcePeek, TranscriptLine, AddMaterialDialog, BudgetNotice).

   Done when: ranking tests pass (the Study question ranks slide 17, transcript 41:05 and A2 §3 in the top 8 with lexical only).
7. **`lib/sample`.**
   - Core: four courses, the events for Sep 28 to the end of term, authored blocks for the five Paper weeks, the CSC148 Lecture 8 slides, Lab 6 and A2 handouts, the ECO101 textbook pages, and the Paper study chat.
   - All four feature fragments at Paper fidelity: the MAT137 Tuesday lecture with its segments and links (both scenarios); past completed sessions; the CSC148 2024 Midterm with 15 questions, 8 attempts and the Q7 solution; the ECO101 guide outline with the drafted `Price elasticity of demand` section.

   Done when: the sample week and month goldens pass.
8. **Practice in the shell.** The files moved per section 3, the routes on IndexedDB and `useChat`, the old routes deleted, and `scripts/e2e/steps/practice.mjs` carrying the migrated harness scenarios.
9. **Harness and stubs.**
   - `scripts/e2e/walkthrough.mjs`, its step context and the boot step.
   - `check-tokens.mjs`, `check-ownership.mjs`, and the lint rules from section 11.2.
   - A stub page in every feature route (an `h1` and the feature's `testids.ts`), a stub `tasks.ts` per feature, and a stub step file per feature that the runner already calls. `docs/change-requests/README.md`.

   **Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, the walkthrough passes `boot` and `practice` with every other step a stub, and `check-ownership --all` is clean.
10. *Trailing.* `RedisLedger` and its Lua scripts, run against the contract suite when `UPSTASH_REDIS_REST_URL` is set.
11. *Trailing.* `scripts/check-nemotron.mjs`.

---

## 13. Verification plan

### 13.1 The runner

`node scripts/e2e/walkthrough.mjs [--only today,calendar] [--integrated] [--keep-server]`, after `pnpm build`:

- Runs `rm -rf .next` only if the build fails on stale route types (`shadcn-base-ui.md` gotcha 4). Then starts `pnpm start` with `CUE_AI=mock` on a free port, waits for `/api/status`, and refuses to run unless `mode` is `mock`.
- Uses Chromium from Playwright's default lookup, with the fake-media flags (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`). Context: 1440×900, `timezoneId: "America/Toronto"`, locale `en-US`, fresh storage.
- `page.clock.install({ time: "2026-10-27T10:12:00-04:00" })`. Steps move the clock with `t.clock.setSystemTime` and `t.clock.runFor`, which also drives the demo transcription engine and the session timer.
- Runs `boot`, then the steps in `WORKSTREAMS` order. Each step gets the `StepContext` from `types.ts` section 18. `reseed()` goes through the sidebar `DataMenu` (Reset, then Load sample semester), so no step depends on an earlier one.
- After each step: no console errors, no failed requests other than the routes a step stubs on purpose, and `t.checkNarrow()` on the step's main screen.
- Screenshots go to `.verify/e2e/<run>/<name>-1440.png` for the Paper judge. Exit code 0 only when every step passes.

### 13.2 Hooks

- **Roles and accessible names first.** `data-testid` is used only for regions with no role.
- **Test id files.** Shared ids are in `lib/testids.ts` (`shell-spend`, `shell-main`, `chat-thread`, `source-peek`). Each feature's ids are in `features/<x>/testids.ts`: plain `as const` objects with no imports, which the step file imports directly (Node 26 strips the types).
- **States** are asserted through the `data-state` attributes the components already need for styling (`flagged`, `current`, `missed`, `done`, `emphasized`, `generating`).
- **Mutations** are asserted on screen, not by reading IndexedDB, except the Calendar overlap check, which compares rendered boxes.

### 13.3 Main path per feature

Assertions marked **[integrated]** cross into another workstream's screen. They run only with `--integrated`.

**boot (F)**, clock 10:12, fresh storage:

1. `/` shows h1 `Add your schedule to plan today.`, a button `Upload calendar` and a button `Try the sample semester`. Click the second. The h1 becomes `Two sessions today. Start with recursion.`
2. `navigation` named `Main` has six links in order. `Today` has `aria-current="page"`.
3. `/practice/<SAMPLE set>` shows no docked sidebar. `ControlOrMeta+B` opens a `dialog` named `Navigation` with the same six links, and `Escape` closes it.
4. `getByTestId("shell-spend")` has count 0 in mock mode. Button `Data` opens a menu with `Load sample semester` and `Reset all data`.
5. `checkNarrow()` on `/`: button `Open navigation` is visible and there is no horizontal overflow.

**today (T)**, clock 10:12, `reseed()`:

1. h1 `Two sessions today. Start with recursion.` Paragraph `Your CSC148 midterm is in 10 days, so Cue moved this morning's review up. Everything you need is already pulled from yesterday's lecture.`
2. Inside the next-up card `tid.nextUp`:
   - text `CSC148` and `Next up · 10:30–11:15am · Review 1 day after lecture`
   - h2 `Recursion & tree traversal`
   - links `Lecture 8 slides`, `Lecture 8 transcript`, `Lab 6 handout`, `+ 12 practice Qs`, `Start session`
3. Header text `3 blocks · 2h 45m of study`. The list named `Today` has 4 items:
   - `9am MAT137 Lecture — Integration by parts Transcript ready`
   - `10:30am CSC148 Review — Recursion & tree traversal After-lecture · 45m`, with `aria-current="time"`
   - `3pm Café shift Campus café`
   - `7pm ECO101 Work block — Problem Set 4 Due Thu · 2h`
4. Shot `today`.
5. `Lecture 8 slides` goes to `/study/review.evt_sample_csc148_l08.2?tab=slides`, which shows no `End session` button (preview), then Back.
6. `Start session` goes to a URL matching `/study/review.evt_sample_csc148_l08.2`. **[integrated]** h1 `CSC148 · Recursion & tree traversal`, then Back.
7. The lecture row link goes to `/lectures/lec.evt_sample_mat137_tue`.
8. `setSystemTime(11:40)`: row 2's trailing text is `Missed · Reschedule`. Click `Reschedule`. A row with time `11:45am` and title `Review — Recursion & tree traversal` exists.
9. `checkNarrow()`.

**calendar (C)**, clock 10:40, `reseed()`:

1. `/calendar` resolves to `view=week&date=2026-10-27`. h1 `October 2026`. The `columnheader` for Tue 27 has `aria-current="date"`. `tid.hours` has `scrollTop` 360.
2. `tid.weekGrid` contains 25 buttons (8 lectures, 14 study blocks, 3 deadline chips), matching the Paper week table.
3. Button `Review · Recursion, Tuesday 27 October, 10:30 to 11:15am` contains `10:30–11:15am · now`. Button `CSC148 A2 due 11:59pm` exists. Shot `calendar-week`.
4. Click the Wed 28 `Mid-week · PSY` block. A popover offers `Start session`, `Reschedule` and `Mark done`. `Mark done` makes the block show `· done` with `data-state="done"`. **[integrated]** `Start session` from another block opens the session screen.
5. Lecture button `MAT137 Lecture, Thursday 29 October, 9 to 10am, MP 102` opens a popover. Link `Take notes` has href `/lectures/lec.evt_sample_mat137_thu`. **[integrated]** Following it shows button `Start recording`.
6. Combobox `View`, option `Day`: the URL has `view=day`. Shot `calendar-day`. Option `Month`: Wed 28 shows `+4 more`, and Tue 27 shows 2 items. Shot `calendar-month`. Buttons `Next month`, `Previous month` and `Today` move the period.
7. `Add schedule`, then set the input file to `fixtures/calendar/timetable.ics`. The preview shows checkbox `AST101 · Tue, Thu 3–4pm · …`. Click `Add 1 course`. A toast matches `/^Added 1 course\. Cue planned \d+ study blocks\.$/`. In week view, no study block's box intersects a lecture block's box in any day column. `Undo`: no `AST101` text remains in the grid.
8. Same dialog with `fixtures/calendar/timetable.png` (mock `calendar.read`): the preview lists the parsed courses, then `Cancel`.
9. `checkNarrow()` (default view at 375 is Day).

**lectures (L)**:

1. **Live state.** `setSystemTime(2026-10-27T09:47:30)`, `reseed({ scenario: "liveLecture" })`. `/lectures/lec.evt_sample_mat137_tue` shows h1 `MAT137 · Integration by parts`, `role=status` `Paused` and button `Resume`.
2. Click `Resume`, then `runFor(42_000)`:
   - status `Recording`
   - `progressbar` named `Lecture time` with `aria-valuetext` `38 minutes 12 seconds of 50 minutes`, and the text `38:12 of 50:00`
   - `role=log` named `Live transcript` holds the rows `29:30` to `37:10`
   - the `33:20` row has `data-state="flagged"` and text `Flagged · on Term Test 2`
   - the last row starts with `Live` and `…the same trick comes back`
3. In `tid.related`, the first card is `Term Test 2` with `Nov 13 · Prof. Chen says this will be on it` and `data-state="emphasized"`. Shot `lectures-live`.
4. Fill textbox `Ask about the last 5 minutes` with `Which choice of u was the mistake?` and press Enter. An answer appears with chip `Transcript 33:20`.
5. `Pause` shows status `Paused` and button `Resume`. `Resume`. Hover the `35:47` row and click `Flag`: the row reads `Flagged by you`. Then `Unflag`.
6. `End and save notes` shows `Saving…`, then the saved view: status `Saved`, h2s `Summary`, `Exam hints · 1`, `Key points`, `Your questions · 1`, a button matching `/^Full transcript · \d+ lines$/`, textbox placeholder `Ask about this lecture…`, button `Review now`. Shot `lectures-saved`. **[integrated]** `Review now` opens `/study/custom.…` with an `End session` button.
7. **Fresh recording.** Clock 10:12, `reseed()`. `/lectures`, button `Record a lecture`, pick `CSC148`, then `Start recording`, then `runFor(60_000)`: a row `0:45` appears. `checkNarrow()`.

**study (S)**, clock 10:30:00, `reseed()`:

1. `/study/review.evt_sample_csc148_l08.2?start=1`: h1 `CSC148 · Recursion & tree traversal`. List `Session plan` has 5 items. Step 1 has `aria-current="step"`. Composer placeholder `Ask anything about Lecture 8…`.
2. `runFor(5:00)`, then `Next step`: step 2 is current with meta `Slides 12–17 · 8 min`. Press `ArrowRight` twice on the slide viewer: `Slide 14 of 32`, h2 `Preorder traversal`, a code block that begins `def preorder(self) -> list:`.
3. `runFor` to 13:12 elapsed: `31:48 left`, and `progressbar` value 29.
4. Button `32:14 …` selects tab `Transcript`, labelled `Transcript · 32:14`. Back to tab `Slides`. Shot `study` (Paper state, including the seeded conversation with chips `Slide 17`, `Transcript 41:05`, `A2 handout §3`).
5. Send `Why does preorder visit the root first?` in Quick mode. The answer streams and chips appear. Chip `Slide 17` switches the viewer to `Slide 17 of 32`.
6. Radio `Deep`, then send. `Thinking…` shows before the answer. `Add to study guide` becomes `Added to study guide`.
7. `Pause` shows `Paused · 31:48 left`. `Resume`.
8. Route `**/api/ai/ask` once with 402 `budget`, then send. The notice reads `The $30 spending cap is reached.` and the composer is disabled. Unroute.
9. `End session` opens alertdialog `End this session?`. Click `End session`: the URL is `/`. **[integrated]** The row `Review — Recursion & tree traversal` reads `Done · 45m`.
10. Preview: `/study/<SAMPLE block for Wed Mid-week · CSC>` shows button `Start session` and no running timer. After a reload it is still a preview. `checkNarrow()`.

**practice (P)**, clock 10:12, `reseed()`:

1. `/practice` lists link `CSC148 · 2024 Midterm`. Open it:
   - h1 `CSC148 · 2024 Midterm`, eyebrow `Question 7 · Multiple choice · 2 marks`
   - option B `D, E, B, C, A` with `Your answer · correct`; C `That's inorder`; D `Reversed preorder`
   - `Worked solution` steps `B's subtree / D, E, then B`, `C's subtree / C`, `Root / A`, then `So the order is D, E, B, C, A.`
   - `Relevant resources` has 3 links
   - tiles named `Question 3, missed` and `Question 7, current, correct`

   Shot `practice`.
2. Link `Postorder traversal Lecture 8 slides · Slide 17` opens `tid source-peek` showing `Slide 17`. `Escape`: still question 7.
3. Combobox `Topic`, option `Big-O & efficiency`: `tid.bar` shows 5 tiles.
4. `Ask why` opens the chat column. A reply streams.
5. `Write questions`, then `5`, then `Write questions`. Five tiles with `data-state="generating"`, then eyebrow `Question 16 · Written by Cue · Multiple choice`, and tile names containing `written by Cue`.
6. Migrated harness on `fixtures/practice/sample-quiz.pdf`:
   - forced 429 on the first `practice.parse`, then `Retry`
   - parsing progress, then a new set with 5 tiles
   - key `2` answers correctly
   - keyless Q4 shows `Your answer · checking…`, then answered
   - the figure crop `img` is present
   - a reload keeps the state
   - a forced 402 on `practice.solve` shows the budget line with the configured cap
7. `Escape` returns to `/practice`. `checkNarrow()`.

**guides (G)**, clock 10:12, `reseed()`:

1. `/guides` redirects to `/guides/ECO101/price-elasticity-of-demand`. h1 `ECO101 · Study guide`. `navigation` named `Contents` has link `Price elasticity of demand` with `aria-current="page"`.
2. Two `role=img` figures, named `/^Elastic demand curve/` and `/^Inelastic demand curve/`. The inelastic SVG has exactly one text `Q2 Q1`. A `note` is named `Common mistake · will be on the midterm`. A `role=math` element is present.
3. The footnote list has 4 items. Item 1 is `Lecture 7 at 4:15. Textbook ch. 5, p. 92.` and item 3 is `Lecture 7 at 18:40, redrawn from the whiteboard sketch. Textbook Figure 5-1.` Marker link `1` focuses `#fn-1`. Shot `guides`.
4. Combobox `Course`, option `CSC148`: the URL starts `/guides/CSC148`. Click `Write this guide` (mock outline). The first section's placeholders fill block by block, and footnotes appear. The section shows a code block (the region named by its caption `Tree.is_empty is true…`) containing `def is_empty(self) -> bool:`, kept at `white-space: pre` and scrolling sideways, and `checkNarrow()` passes on it.
5. Back on ECO101: `Add material`, then `fixtures/guides/eco101-lecture8-slides.pdf` as ECO101 slides. The section shows `Lecture 8 slides added. Rewrite this section?` Click `Rewrite`: the line disappears.
6. Stub `window.print`, then `Export PDF`: the URL is `/export/guide/ECO101`, print media is emulated, the nav is hidden, and `print` was called once. Shot `guides-print`.
7. Key `]` moves to `Elasticity and total revenue`.
8. **[integrated]** `Quiz me on this section` goes to `/practice/<new set>`, whose question 1 provenance names `ECO101 guide · Price elasticity of demand`.
9. `checkNarrow()`.

### 13.4 Unit tests (vitest, `pnpm test`)

| Owner | Tests |
| --- | --- |
| F | scheduler (section 6.6); `lib/time` against every Paper string (`9am`, `10:30–11:15am`, `11:15am–12pm`, `3h 15m`, `31:48`, `41:05`); `sourceLabel` and `footnoteText` against the guide footnotes, Practice resource metas and session chips; `topicMatch`; chunkers; BM25 and fusion on the sample; `parseCitations`, `refsFor`; `sessionClock` (Pomodoro phases, `stepOverMs`), `lectureLive`, `gradeOf`, `sectionStale`, `ingestStatus`; list-task item extraction from split JSON; `runTask` deadline and retry rules with a fake provider; the ledger contract suite (expired-hold charging, idempotent and late settle) against `FileLedger`, an in-memory Lua-equivalent store, and Redis when configured; every task's `mock(example)` parses with its own schema; `capFromEnv`, `aiModeFromEnv` |
| T | brief rules, row trailing texts and states |
| C | ICS import, timetable expansion, `layoutLanes` |
| L | cutter, segment timestamps, hint dedupe, mention resolution, `latexToUnicode`, demo engine timing |
| S | plan normalization, step transitions |
| P | reducer, `buildExam`, schemas, generated-question checks |
| G | chart geometry (study-guide.md 3.3 fixtures), footnote numbering |

### 13.5 Definition of done mapping

| plan.md item | How this design meets it |
| --- | --- |
| 1. typecheck, lint, build | `pnpm typecheck`, `pnpm lint` (includes the boundary, table-writer and prefs rules), `pnpm build`, plus `pnpm test` |
| 2. walkthrough | `scripts/e2e/walkthrough.mjs --integrated` against the production build, section 13 |
| 3. check-nemotron | `GET /api/ai` lists every task and example; the script calls each, reading streams and lists to the end |
| 4. check-tokens | scans for hex, rgb, hsl and direct `@base-ui/react` imports |
| 5. Paper judge | 1440×900 shots per screen. Calendar and the guide render inside the 232 px sidebar, and the judge records that as intended. Past blocks carry ` · done` in week and day views, also recorded as intended |
| 6. design passes | per-screen review on the shots and the live build |

`scripts/e2e/parakeet.mjs` (L, live-only) runs the real engine in Chrome for Testing (WebGPU) with `--use-file-for-fake-audio-capture=scripts/fixtures/audio/lecture.wav`. It checks that the transcript contains "term test 2" (or "two"). It needs the 454 MB model, so it waits for the operator's approval and stays out of the gate.

---

## 14. Shape

Data first. Twenty-one IndexedDB tables, each with one writer derived from one manifest. The plan is not one of them. `schedule()` derives blocks from events, imports, overrides and session snapshots with no clock input, and block ids come from anchors, so a session keyed by block id survives every re-plan. Everything that waits on a model is an optional field, so a reload never strands a "loading" row. Citations are self-describing `SourceRef`s, and one function turns them into every Paper phrasing.

Load-bearing decisions, each with the principle behind it:

- **Local-first IndexedDB with one durable server store for spend.** The ledger is the only state two actors share, and it gets an atomic store (per separate-before-serializing-shared-state).
- **The plan is derived.** Overrides are the only stored plan state, and history is locked by session snapshots. No caller ever re-plans or syncs blocks (per make-operations-idempotent and model-the-domain).
- **Paper weeks are authored overrides inside the same plan**, not a second code path (per subtract-before-you-add).
- **One `SourceRef` and one label formatter.** A new citation target is a type change, and five screens cannot drift (per encode-lessons-in-structure).
- **Zod schemas as the task contract.** The JSON schema, the parse and the client types derive from them, so the drift in fragile point 16 cannot recur (per type-system-discipline).
- **One AI route, one wire protocol, one error type, one deadline.** Per-feature routes were pass-through shells (per laziness-protocol).
- **A reservation per upstream attempt, and expired holds charged in full.** This closes the uncounted-retries and dead-function holes in the layer that owns the budget (per fix-root-causes).
- **Ownership in one manifest that lint, the type checker and a diff check all read** (per encode-lessons-in-structure, applied to the build itself).

Interface depth, module by module:

- **`lib/ai`** exposes `ai`, `aiItems`, `aiStream`, `AiError`, `errorCopy` and `defineTasks`. Behind them: provider choice, model IDs and prices, thinking flags, schema derivation and restatement, JSON extraction and repair, incremental item parsing, retries under one deadline, a reservation per attempt, abort propagation, the ledger, the throttle, mocks and the wire format. Callers learn one function and a task name.
- **`lib/plan`** exposes `schedule`, `usePlan`, `planActions` and the title helpers. Behind them: six demand rules, `planFrom` clipping, slot search, buffers, the daily cap, overrides, locked history, DST and status derivation.
- **`lib/chat`** exposes `useChat({ thread, scope })`. Behind it: the context source per scope (retrieval or live segments), the prompt per scope (including Practice's "don't reveal the answer"), streaming, stop, citation parsing and persistence.
- **`lib/retrieval`** exposes `retrieve`, `livePassages`, `parseCitations`, `refsFor` and `reindexSource`. Behind them: chunkers, the indexer, BM25, cosine, fusion and the latency policy. The one caller-facing option, `latency`, states a policy rather than a stage.
- **`lib/db`** is the widest surface: the tables themselves. It is wide on purpose, because rows are the domain types. Writes are narrowed by the lint rule, not by a repository layer that would only forward calls.

Validation lives at the edges: zod on every AI input and output, on ICS and timetable imports, and on the sample seed in tests. Inside, code trusts the types (per boundary-discipline). The design does not include accounts, sync across devices, web search, a server vector store, a reranker or a hash embedder.

Red-flag screen:

| Flag | Where it could appear | How the design avoids it |
| --- | --- | --- |
| Shallow module | a `lib/db` repository; panels wiring their own retrieval | no repository; `useChat` takes a scope, not a context callback |
| Information leakage | wire types, usage fields, passage ids, model IDs | NDJSON, usage and model IDs never leave `lib/ai`; passage ids resolve only through `refsFor`; `response_format` comes from zod |
| Temporal decomposition | ingest stages | `lib/materials` owns "file to pages", `lib/retrieval` owns "pages to searchable chunks", and progress is a message, not a stage enum |
| Pass-through method | route files | Next requires them; they await params and render one feature component |
| Split ownership | overrides, courses, prefs, chunks, messages, the recording badge, exam hints | one writer module each; prefs slices are lint-enforced; badges derive from rows; hints are flagged segments only |
| Two ways to do one task | old `/api/*`, `AskChat`, localStorage session; two lecture threads; two viewers | deleted in foundation; one `lecture:` thread for live and saved; `SourcePeek` everywhere, with a hook for Study's own tabs |
| Importable internals | `lib/*/internal`, payload files, server modules | lint errors; `server-only` and `client-only` imports |
| Hand-synced list | NAV vs href, table writers vs workstreams, schema vs row types, registry vs types | NAV built from `href`; `TABLE_WRITERS` derived with a compile-time check; typed key paths; task types derived from `typeof registry` |

---

## 15. Synthesis decision

**Base: candidate opus.** It scored higher on average (41 vs 38.5 across both judges) and led on interface depth (8 and 8) and verifiability (8 and 8). Its defects were mostly local: an override shape, a missing writer action, a timeout budget. Fable's sat at the centre of its contract: registry types that resolve to `unknown`, `replanWindow` deleting the seeded blocks the walkthrough depends on, and stubs that throw across workstream boundaries. Opus's derived plan, settled-only persistence, generated lint guards and walkthrough already met most of the brief, and the judges' graft lists for it were long.

**Grafted from fable:**

- **AudioWorklet capture.** 16 kHz PCM, cut at the quietest point between 12 and 18 s, stored as WAV chunks, which avoids MediaRecorder's timeslice decode problem.
- **Fail-at-build module guards.** `client-only` on `lib/db` and `server-only` on `lib/ai/server/*`.
- **A mock-mode gate in the runner.** It refuses to run unless `/api/status` reports mock.
- **Reciprocal rank fusion** instead of weighted normalized scores, and the 24,000-character passage cap for request bodies.
- **Per-owner settings rows**, turned into typed `prefs` slices with a lint rule so they stay one-writer.
- **`layoutLanes`** as a pure Calendar function.
- **The after-merge tag**, here `t.integrated(...)` with an `--integrated` run, so cross-screen assertions never fail inside one worktree.
- **The guide-section state "stale because …"**, as derived text: `Lecture 8 slides added`.
- **Lexical retrieval that degrades silently** when embeddings are missing, now the only mode outside token-factory.
- **Feature-owned payload shapes and sample fragments**, from the judge's suggested graft, so a feature can fix its own sample rows and AI-product shapes.
- **Fixture names and per-feature step modules.**

**Rejected from fable, and why:**

- **A stored `blocks` table with `replanWindow`.** It turns a pure function into a sync protocol and deletes the authored Paper blocks on the first import.
- **Hand-authored sample blocks outside the plan.** Kept as an idea, but rebuilt as authored overrides that the plan honours.
- **A Materials workstream with no route.** It would mount UI in files other workstreams own. Materials stays in foundation, with `AddMaterialDialog` as a shared component.
- **Transferring shared task files (`askQuick`, `embed`) to single features.** That is split ownership of shared behaviour.
- **Chat threads with inline message arrays.** Every streamed delta would rewrite the whole thread row.
- **Banning lucide outside `components/ui`.** Every feature needs icons, so it would block them.
- **`decisions.tsv` as the request channel.** It guarantees textual conflicts. Change requests are one file each.
- **Pricing OpenRouter `:free` models through the ledger.** Unnecessary once the paid overrides are gone.
- **`Lecture.status` beside `timer.status`.** It is a second encoding of the same pause state.

**Judged defects and their resolution** (every defect that held up after rereading the specs):

| Defect (judge) | Resolution |
| --- | --- |
| Settings had no writer action for Lectures, Guides or Calendar (opus) | `prefs` slices per owner through `setPrefs`, with a lint guard. `lastGuide` moved to `Guide.lastRead`. `termEnd` is derived. `planningSince` became `ImportBatch.planFrom` |
| Calendar Undo could not remove courses (opus) | `Course.sources` plus `courseActions.release(importId)` |
| The golden week's "at most 8 overrides" was infeasible; the buffer contradicted Paper; overrides could not carry a note (opus) | Paper weeks are authored overrides. The rules plan from `planFrom` on and are proved by a reviewed rules-week snapshot plus invariants (section 6.4) |
| `PlanOverride` allowed illegal rows (opus) | a union over `placement` (pinned or authored) and `status` (done or skipped); no empty row, no done without a placement, and authored text survives a reschedule |
| `Question.answer` and `answerSource` could disagree (opus) | the `AnswerKey` union |
| The live-lecture ask had no passages (opus) | `livePassages` reads segments directly |
| `EmbedTask` had no mock or output (opus) | added; the app never embeds in mock mode |
| The retry budget exceeded `maxDuration`; dead functions never settled; expired holds were dropped (opus) | one 280 s deadline across attempts; stream and list retries only before the first byte; expired holds charged in full, with late settles correcting down |
| Ownership globs overlapped (opus) | audio fixtures moved to `scripts/fixtures/audio`; `check-ownership --all` asserts one owner per file |
| `usePlan` re-ran on every heartbeat (opus) | memoized on an input fingerprint |
| `sectionStale` depended on an undefined version (opus) | `CourseSources.stamp` derived from materials and saved lectures |
| `+ 12 practice Qs` used free-text topic equality (opus) | `topicMatch` with stemmed overlap, unit-tested; residual risk noted |
| `check-nemotron` passed failed streams on HTTP 200 (opus) | reads streams and lists to `done` |
| Duplicated facts (`answerKey`, `lectureNumber`) and NAV duplicating `href` (opus) | removed; `Material.lecture` is a single field; NAV built from `href` |
| Month artboard vs the prep table (opus) | weeks before `planFrom` are authored |
| `Review now` was not tied to a block (opus) | `planActions.reviewNow` creates a custom block |
| Feature shapes and sample frozen in foundation (opus) | feature-owned payload files and sample fragments |
| Illegal states (opus): unbounded step, empty-set `current`, `courseId` on any anchor, draft beside failed | step clamped by transitions; `current: QuestionId \| null`; block `courseId` derived from the anchor; `lastError` beside a draft documented as meaningful |
| The write lint missed `modify`, `where().delete()` and `db.table()` (opus) | the `cue/table-writers` rule walks call chains; `db.table` banned |
| Completed blocks could move (opus) | session snapshots and done overrides are locked placements |
| No throttle on the public route (opus) | same-origin check plus a per-client throttle |
| `guide.section` showed blank for 8 s; generation came in one batch (opus) | list tasks stream validated items |
| Footnotes could not carry free text, a figure, a relation or a section (opus) | `FootnoteSource { ref, relation, note }`, `page.figure`, the `section` ref |
| Walkthrough flake from the indexer; `runFor(38:12)` (opus) | no hash embedder (lexical-only mock); a `liveLecture` scenario at 37:30 |
| `AskScope` naming and the speculative guide scope (opus) | scopes `study`, `liveLecture`, `lecture`, `question` |
| Lightning writes LaTeX (opus) | `latexToUnicode` in Lectures |
| Passage ids leaked into every feature (opus) | the one `refsFor` resolver |
| Hand-synced writer list and index strings (opus) | derived writers with a compile-time check; typed key paths |
| Foundation over-built (opus) | dropped the hash embedder and MMR; Redis and check-nemotron trail the gate |
| Registry types collapsed to `unknown`; task kind not a discriminant (fable, for the grafted registry) | per-task generics; types derived from `typeof registry` (probed); kind-specific mocks |
| The partial line had no mechanism (fable) | partials only when the engine says so (WebGPU re-decode every 3 s), else `Listening…` |
| The session preview started the timer (fable) | preview creates no row; `?start=1` does |
| The ask chip in the live step cited `30:02`, outside the 5-minute window (both) | the step asserts `Transcript 33:20` |
| Calendar's `· now` at 10:12 (fable) | Calendar runs at 10:40 by `setSystemTime` |

---

## 16. Tradeoffs accepted

- We accept a heavier foundation (scheduler, retrieval, chat, ingest, the full sample) in exchange for six features that build on real data from the first hour and never edit shared code. plan.md put the scheduler in the Calendar workstream. Three screens consume it and the sample's fidelity depends on it, so it moves to foundation.
- We accept that the sample's Paper weeks are authored, not rule output, in exchange for exact Paper fidelity without bending the rules. The rules are proved on a reviewed snapshot and 200 random calendars instead.
- We accept that a block can move when the calendar changes in exchange for never syncing stored blocks with their inputs. Pinned, done and started blocks hold.
- We accept local-only data (no second device, and clearing site data loses it) in exchange for no accounts, no server content store, and audio and textbooks that never leave the browser beyond the pages the model reads.
- We accept lexical-only retrieval in mock and OpenRouter modes in exchange for a deterministic gate and no mixed vector spaces.
- We accept one AI route with one `maxDuration` in exchange for one place that enforces validation, the cap, retries, the throttle and mocks.
- We accept global COOP/COEP headers in exchange for a WASM fallback that can use threads. Every cross-origin resource must then be CORS-enabled or credentialless-compatible.
- We accept WAV audio chunks (about 1.9 MB per minute, deleted after a full transcription) in exchange for exact cuts with no decode step.
- We accept that the ask scopes live in foundation. A new scope is a change request. That is the most likely request in the parallel phase.
- We accept `lib/ai/registry.ts` importing nine task files, six of them feature-owned, in exchange for one registry that the gateway, the client types and `check-nemotron` all read.

---

## 17. Alternatives considered

- **Stored study blocks with a re-plan step** (candidate fable's shape). Callers would call `replanWindow()` after every import or edit and reconcile it with user moves and seeded blocks. Lost: it exposes a sync protocol to three screens and hides less than the pure function.
- **A rules-only sample with Paper reproduced by pins and skips.** Simpler on paper, but the override shape must grow labels and notes, and about 13 overrides drift with every rule change. Lost to authored weeks plus `planFrom`, which needs no new mechanism.
- **One API route per feature.** Each route would repeat validation, reservation, retries, mock switching and error mapping, so the cap's correctness would depend on six copies. Lost on depth.
- **A server database for content** (Postgres with anonymous device ids). It gives multi-device sync, but needs an identity scheme the brief rules out, a server copy of private audio and textbooks, and a second persistence path for blobs. Lost on the no-accounts constraint and on exposure.
- **Features build their own ask context** and pass passages to a generic chat. More flexible, but each screen would carry retrieval calls, prompt rules and citation parsing, and they would drift. Lost on depth; the four scopes are known now.

---

## 18. Open questions and risks

1. **Pomodoro.** This design derives 25-minute focus and 5-minute break cycles inside the block, and plan steps sum to the focus minutes. Is that the intended structure, or should each plan step be an interval with breaks between steps?
2. **Mode labels.** Paper's mode switch reads `Quick · Nano`, but both modes run Ultra (decisions row 10). Should the labels read `Quick` and `Deep`, with the model name in a tooltip?
3. **Ledger store.** Is Upstash Redis through the Vercel Marketplace acceptable? It is an outward-facing integration and needs the operator before any deploy.
4. **Parakeet on WASM.** Can Parakeet CTC on the WASM fallback keep up with live speech on the demo laptop? It is unmeasured. Without WebGPU, chunks queue in IndexedDB and transcribe late, with no partials. Is that acceptable, or should the note taker refuse to start?
5. **Sample clocks.** The judge gets Today at 10:12 and Calendar at 10:40, matching each artboard. Is a single clock preferred (today.md flag 13)?
6. **Web citations.** Paper cites `docs.python.org`. Is web search in scope, or do chips cite course material only?
7. **Lecture start offset.** Lectures start ten minutes past the hour (Paper shows `of 50:00` for a 9 to 10am slot). Is `prefs.lectureStartsPastMin = 10` the right default for real imports?
8. **Done styling.** Past blocks show ` · done` in week and day views, but Paper draws them plain. Keep the honest status, or hide done markers on past days?
9. **COEP risk.** Will global `COEP: credentialless` break anything the app loads? pdf.js workers and the Hugging Face model download need a check in the first foundation build.
10. **`topicMatch` on real data.** Practice topics come from the parser, and block topics from the syllabus or lecture notes. Is a fuzzy match good enough for real imports, or should Practice tag questions to lectures when it can?
11. **Foundation size.** Steps 1 to 9 are most of a day of focused work for one owner. If the parallel phase must start sooner, which can a feature absorb: the sample fragments (already feature-owned files), or the Practice move?
12. **Guide shell.** The study guide is a browse screen with the sidebar, so its chapter column shrinks to about 840 and the chart must be fluid. Confirm, or make it a focus screen?

---

## 19. Next implementation step

Write `lib/domain`, `lib/time` and `lib/plan/schedule.ts` from `docs/architecture/types.ts`, with the sample-week golden and the rules-week snapshot, because the sample semester and three screens depend on its output.

---

## 20. Operator-away defaults for section 18 (set by the lead, 2026-10-28)

The operator is away, so each open question gets a default. Each one is reversible and logged in `docs/decisions.tsv`.

1. **Pomodoro.** 25-minute focus and 5-minute break cycles inside the block. Plan steps sum to the focus minutes.
2. **Mode labels.** `Quick` and `Deep`. Both run Nemotron 3 Ultra: Quick with thinking off, Deep with thinking on. A tooltip names the model and the mode.
3. **Ledger store.** Build `RedisLedger` behind `UPSTASH_REDIS_REST_URL`. Provisioning Upstash waits for the operator together with the deploy.
4. **Parakeet on WASM.** The note taker starts anyway. Chunks queue in IndexedDB and transcribe late, and the screen says so plainly.
5. **Sample clock.** One clock: Tue 27 Oct 2026, 10:12 in America/Toronto, for every screen in the walkthrough. The real app uses the real clock and the sample is dated relative to the current week.
6. **Web citations.** Course material only. No web search.
7. **Lecture start offset.** `prefs.lectureStartsPastMin = 10` by default, editable.
8. **Done styling.** Paper fidelity: past blocks draw plain and missed blocks draw dashed. Done is visible in the block's popover and in the screen reader name.
9. **COEP.** Check in the first foundation build. If `credentialless` breaks pdf.js or the model download, drop COOP/COEP and run the single-threaded WASM fallback.
10. **topicMatch.** Fuzzy match is enough for now.
11. **Foundation size.** One owner, who may fan out internally to foreground workers over disjoint modules once tooling, tokens and `lib/domain` land.
12. **Guide shell.** A browse screen with the sidebar. The sidebar collapses to an icon rail (Cmd/Ctrl+B) and the chart is fluid.
