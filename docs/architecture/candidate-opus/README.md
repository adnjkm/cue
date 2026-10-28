# Cue architecture, candidate "opus"

Cue grows from cue-practice into six screens on one local-first core. Everything a student owns lives in IndexedDB in their browser. The server holds one thing, the spend ledger. The study plan is never stored: a pure scheduler derives it from the calendar and a small table of user overrides. Every model call goes through one typed gateway. [`types.ts`](types.ts) is the type sketch. This file is the usage, the module map and the rationale.

---

## 1. Usage (caller's view)

### 1.1 The contract a feature agent works under

```
You own     features/<you>/**, your route folders under app/(browse) and app/(focus),
            scripts/e2e/steps/<you>.mjs, scripts/fixtures/<you>/**
You import  @/lib/<module> (its index only), @/components/ui/*, @/components/cue/*
You never   import another feature, a lib module's internal/ folder, or @base-ui/react directly
You write   only the IndexedDB tables workstreams.json gives you; other state changes go
            through the owning module's actions (planActions, chat, ensureCourse, ingestFile)
You link    with href.* from @/lib/routes, never a hand-built URL
You call AI with ai()/aiStream() on your own tasks (features/<you>/tasks.ts) or the shared
            ones, which you reach through lib modules (useChat, retrieve, ingestFile)
You need    a new table, index, field, dependency, shadcn component or href: file a change
            request; the integrator lands it on main and every worktree rebases
```

`pnpm lint` (boundary rules generated from `workstreams.json`) and `node scripts/check-ownership.mjs <you>` (diff against main touches only owned paths) fail the build when a worktree breaks this.

### 1.2 Call sites

**Today reads the derived plan.** No feature ever asks for a re-plan. Importing a calendar, recording a lecture or rescheduling a block changes the inputs, and every `usePlan` re-derives.

```tsx
// features/today/TodayPage.tsx
"use client";
import Link from "next/link";
import { usePlan, blockReasonText } from "@/lib/plan";
import { useNow, fmtRange } from "@/lib/time";
import { href } from "@/lib/routes";
import { buttonVariants } from "@/components/ui/button";
import { SampleSemesterButton } from "@/components/cue/sample";

export function TodayPage() {
  const now = useNow("minute");
  const day = usePlan({ day: now });            // undefined until IndexedDB answers
  if (!day) return <TodaySkeleton />;
  if (day.isEmpty) return <FirstRun action={<SampleSemesterButton />} />;
  const next = day.blocks.find((b) => day.status(b) !== "done" && day.status(b) !== "missed");
  return (
    <>
      <Brief day={day} />
      {next && (
        <NextUpCard
          block={next}
          meta={`Next up · ${fmtRange(next, day.zone)} · ${blockReasonText(next, "sentence")}`}
          start={<Link href={href.study(next.id)} className={buttonVariants()}>Start session</Link>}
        />
      )}
      <Timeline agenda={day.agenda} status={day.status} />
    </>
  );
}
```

**A feature defines its AI tasks once and calls them with types end to end.** The profile picks the model, thinking flag, price and provider IDs. The feature never names a model.

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
import { ai, AiError } from "@/lib/ai";
const { sentences } = await ai("lecture.clean", { raw, before }, { signal });
// AiError.kind is "budget" | "rate_limited" | ...; errorCopy(error) gives the UI line.
```

**Every ask panel is one hook.** Retrieval, the prompt for the scope, streaming, citation parsing and persistence sit behind it.

```tsx
// features/study/AskPanel.tsx
import { useChat, threadKey } from "@/lib/chat";
import { ChatThread, Composer } from "@/components/cue/chat";

const chat = useChat({
  thread: threadKey.session(session.id),
  scope: { kind: "lecture", courseId: session.courseId, lectureId: session.lectureId, focus: step.source },
});
return (
  <>
    <ChatThread chat={chat} followUps={(m) => <SessionFollowUps message={m} />} />
    <Composer chat={chat} modes placeholder="Ask anything about Lecture 8…" />
  </>
);
// chat.messages[i].citations: SourceRef[]  -> <SourceChip> renders "Slide 17", "Transcript 41:05"
// chat.saveToGuide(messageId)              -> "Add to study guide"; Guides reads saved messages
```

**The scheduler is a pure function.** `usePlan` is a memoized call to it; tests call it directly.

```ts
import { schedule } from "@/lib/plan";
const { blocks, unplaced, conflicts } = schedule({ zone, window, courses, events, topics, overrides, prefs });
```

**Plan changes are override rows written by one owner.**

```ts
import { planActions } from "@/lib/plan";
const moved = await planActions.reschedule(block.id, { after: now });   // null when nothing fits this week
await planActions.markDone(block.id);
```

**Bringing a file in is one call; asking the course material is another.**

```ts
import { ids } from "@/lib/domain";
import { ingestFile } from "@/lib/materials";
import { retrieve, sourceKey } from "@/lib/retrieval";

const materialId = await ingestFile(file, { courseId: ids.course("CSC148"), kind: "slides", lecture: eventId }, onProgress);
const passages = await retrieve({ courseId, text: "postorder delete subtrees", prefer: [sourceKey.lecture(lectureId)] });
```

**The demo starts from a fresh browser with one call**, dated against the current week.

```ts
import { seedSampleSemester } from "@/lib/sample";
await seedSampleSemester({ now: Date.now(), zone: currentZone() });
```

**A walkthrough step drives the production build by roles and labels.**

```js
// scripts/e2e/steps/today.mjs
export default async function today(t) {
  await t.page.goto("/");
  await t.expect(t.page.getByRole("heading", { level: 1 })).toHaveText("Three sessions today. Start with recursion.");
  await t.expect(t.page.getByTestId(t.tid.today.nextUp)).toContainText("Next up · 10:30–11:15am · Review 1 day after lecture");
  await t.shot("today");
}
```

---

## 2. Module map

`F` foundation, `T` Today, `C` Calendar, `L` Lecture notes, `S` Study sessions, `P` Practice, `G` Study guides. Foundation writes every file below once. After that, ownership is the letter shown.

```
app/
  layout.tsx                                   F  fonts, <TooltipProvider>, <Toaster>, <Boot> (persist(), indexer)
  globals.css                                  F  Tailwind 4, shadcn variables and Cue tokens, all OKLCH
  (browse)/layout.tsx                          F  SidebarProvider + AppSidebar + SidebarInset (document scroll)
  (browse)/page.tsx                            T  /
  (browse)/calendar/page.tsx                   C  /calendar?view=&date=
  (browse)/study/page.tsx                      S  /study (upcoming blocks, past sessions)
  (browse)/lectures/page.tsx                   L  /lectures (by course; record now)
  (browse)/practice/page.tsx                   P  /practice (papers, upload, ?generate=)
  (browse)/guides/page.tsx                     G  /guides -> last course
  (browse)/guides/[courseId]/[[...section]]/page.tsx   G
  (focus)/layout.tsx                           F  full-bleed h-dvh frame, nav Sheet on Cmd/Ctrl+B
  (focus)/study/[blockId]/page.tsx             S
  (focus)/lectures/[lectureId]/page.tsx        L  note taker or saved notes, by lecture state
  (focus)/practice/[setId]/page.tsx            P
  (focus)/export/guide/[courseId]/page.tsx     G  print view for Export PDF
  api/ai/[task]/route.ts                       F  the one AI gateway (POST); GET lists tasks + examples
  api/status/route.ts                          F  provider mode, active embedder, spend
components/
  ui/*                                         F  shadcn base-nova, restyled to Cue; complete set installed up front
  cue/                                         F  shared Cue parts:
    shell/ AppSidebar, AppNav, NavSheet, SpendMeter, DataMenu, Mascot, LiveBadges
    chat/ ChatThread, Composer (Quick/Deep), SourceChip, SourceChips
    source/ SourceView (slide, page, transcript window), SourcePeek (sheet), openSource()
    TranscriptLine (final | flagged | live), CourseChip, SectionLabel, FocusToolbar, TimerBar,
    Prose, EmptyState, ErrorLine, sample/SampleSemesterButton, AddMaterialDialog
features/
  today/**                                     T
  calendar/**                                  C
  lectures/**                                  L  (engine/, recorder, pipeline, worker)
  study/**                                     S
  practice/**                                  P  (moved here from components/ and lib/ by F)
  guides/**                                    G  (charts/, print)
lib/
  db/          F  Dexie schema v1 (every table), useLive, table owners
  domain/      F  entity types, id constructors, pure derivations (sessionClock, lectureLive, gradeOf)
  courses.ts   F  ensureCourse (the one writer of courses)
  time/        F  zone math (@date-fns/tz), useNow, Paper formatting ("10:30–11:15am", "3h 15m", "41:05")
  plan/        F  schedule (pure), findSlot, usePlan, planActions, blockStatus, titles, blockMaterials
  materials/   F  ingestFile (render, text layer first, vision fallback), pages.ts (from lib/pages.ts), task material.read
  retrieval/   F  chunkers, embedders (qwen, hash), indexer, retrieve, parseCitations, task embed
  chat/        F  useChat, scope -> context, threadKey, saveToGuide, task ask
  sources.ts   F  sourceLabel(ref, style), footnoteText(refs)
  ai/          F  models+prices, profiles, define, registry, client (ai, aiStream), server (runTask),
                  provider, spend/ (ledger, FileLedger, RedisLedger), errors (errorCopy), json
  sample/      F  seedSampleSemester, resetAll, SAMPLE ids, per-entity sample content
  routes.ts    F  href builders and NAV
  testids.ts   F  data-testid constants
scripts/
  e2e/walkthrough.mjs                          F  runner: build check, server, browser, clock, steps
  e2e/steps/{boot,today,calendar,lectures,study,practice,guides}.mjs   boot F, rest per feature
  check-tokens.mjs, check-nemotron.mjs, check-ownership.mjs            F
  fixtures/{calendar,lectures,practice,guides}/**                      per feature; existing audio F
workstreams.json                               F  ownership manifest read by eslint, check-ownership, walkthrough
```

Moves and deletions done by foundation: `lib/llm.ts` splits into `lib/ai/*` and the Practice tasks. `lib/spend.ts` becomes `lib/ai/spend/`. `lib/schema.ts` goes to `features/practice/schema.ts`, except `extractJson`, which goes to `lib/ai/json.ts`. `lib/session.ts` (reducer) goes to `features/practice/session.ts`, and its localStorage functions are deleted. `components/{App,Intake,Practice,Navigator}.tsx` go to `features/practice/`. `components/AskChat.tsx` and `lib/client.ts` ask/solve helpers are replaced by `useChat` and `ai()`. `components/icons.tsx` is replaced by lucide. `app/api/{parse,solve,ask}` are deleted once Practice calls `/api/ai/practice.*`. `.verify/harness` scenarios move into `scripts/e2e/steps/practice.mjs`.

---

## 3. Data model

### 3.1 Where each entity lives

| Entity | Store | Why |
| --- | --- | --- |
| Courses, calendar events, imports, plan overrides | IndexedDB | No accounts. The plan is computed in the browser from these. |
| Materials, pages, blobs (source files, page images, figure crops) | IndexedDB, Blobs not data URLs | A textbook is megabytes. It stays on the device; only the pages the model must read leave it. |
| Chunks with embeddings (`Float32Array`) | IndexedDB | Retrieval runs in the browser over local text. 5,000 chunks × 1,024 dims is 20 MB. |
| Lectures, transcript segments, related links, audio chunks | IndexedDB | Audio and transcripts are private. Audio chunks are the durable queue for transcription. |
| Study sessions, chat messages | IndexedDB | One row per session; one row per message, written once when the reply settles. |
| Practice sets, questions, attempts, solutions | IndexedDB | Replaces the single localStorage blob. One row per record, versioned schema. |
| Guide outlines and sections | IndexedDB | Generated text is the product; it must survive reloads and work offline. |
| Settings (zone, prefs, planning start, sample flag, engine) | IndexedDB, one row | Read by the scheduler. |
| Speech model weights | Cache Storage (transformers.js) | Managed by the library; 454 MB, downloaded once after consent. |
| Spend ledger | Server. Local dev: `.data/spend-ledger.json`. Vercel: Upstash Redis | Must be shared by every serverless instance and survive restarts. A per-instance file cannot hold a cap. |

The server keeps no course content and no user state. A server database for content would need accounts or anonymous device IDs, and the audio and textbook blobs would still have to live in the browser. `navigator.storage.persist()` is requested on the first write so the browser does not evict the data.

### 3.2 Rules that hold across the model

1. **Derive, don't store.** Study blocks, block status, grades, a session's time left, a lecture's liveness, a guide section's staleness and the Pomodoro phase are pure functions of stored facts and `now`. None is a column.
2. **Settled-only persistence.** An AI product is an optional field: `session.plan`, `segment.text`, `solution`, `section.draft`, `chunk.vector`, `lecture.notes`, `audio.transcribedAt`. Missing means pending. In-flight work lives in memory, keyed by row id, and an effect restarts it idempotently after a reload. No row ever says "loading".
3. **Identity from meaning.** IDs are built from what a thing is: a material from its file hash, an event from its ICS UID or timetable slot, a block from its anchor, a session from its block, a lecture from its event, a chunk from its source and index. Re-import, re-seed, a double-clicked Start and a retried ingest all land on the same row.
4. **One writer per table.** `workstreams.json` names it. Shared state that several screens change (overrides, courses, chat messages, materials) has a foundation module as its only writer, and features call its actions.
5. **Citations carry their display facts.** A `SourceRef` holds the material title and kind, lecture number and page label it needs, so `sourceLabel(ref, style)` is a pure function and a citation still reads correctly after its material is deleted.
6. **Persist the choice, derive the grade.** An attempt stores only `{ choice }`. Correctness comes from `question.answer` when it exists. This fixes the old reload bug where a "checking" answer was dropped (current-app fragile point 12).

### 3.3 Entities

Field-level types are in `types.ts`, sections 3 to 12.

- **Course**: id is the normalized code (`CSC148`), so URLs read `/guides/ECO101` and imports merge by code. `short` (`CSC`, `PSY`) feeds `Mid-week · CSC`.
- **CalendarEvent**: a union by kind. `lecture` (number, topic, room), `lab`, `test` (label, weight: quiz, test, midterm, exam), `deadline` (label, effort size; `end === start` is the due time), `busy`, `note` (all-day text such as `Thanksgiving · no class`). Recurrence is expanded at import into instances that share a `seriesId`.
- **PlanOverride**: one row per block id. `pin` (a user-chosen interval), `status` (`done` or `skipped`), or `custom` (a block the user added). This is the only stored plan state.
- **StudyBlock** (derived): id from its anchor, interval, course, topic `{ full, short }`, note, and `why` (days after the anchor, and which test boosted it).
- **Material, MaterialPage**: kind (slides, textbook, handout, problemSet, pastPaper, notes, syllabus), title (`Lecture 8 slides`), linked lecture event. A page has text, a page label (`§5.2`, `p. 214`), optional structured slide content (heading, body, code) and an optional rendered image.
- **Chunk**: retrieval unit with a `SourceRef`, text and an optional vector tagged with the embedder that made it.
- **Lecture, Segment, RelatedLink, AudioChunk**: a lecture's state machine is in section 4. A segment holds `raw` engine text and `text` after cleanup, plus an optional flag (`model` with the assessment it names, or `user`). A related link points at a `SourceRef` or an assessment.
- **StudySession**: keyed by block id. A snapshot of title, course, minutes and lecture; the generated plan; timer state as timestamps; current step; steps done; ask mode; viewer position.
- **PracticeSet, Question, Attempt, Solution**: today's model plus `type`, `marks`, `origin` (`paper` or `generated`), `{ label, text }` steps, `conclusion`, `resources: SourceRef[]`, and a figure that is either a crop Blob or a structured tree.
- **Guide, GuideSection**: outline (chapters with textbook chapter numbers kept apart from guide order), then a draft per section: blocks (prose, formula, figure with chart specs, callout) and footnotes whose sources are `SourceRef`s with an optional relation (`used`, `tested`).
- **ChatMessage**: thread key (`session:…`, `lecture:…`, `question:…`, `section:…`), role, text without citation markers, citations, mode, `savedToGuideAt`.

### 3.4 Dexie schema v1

All tables exist from the first foundation commit. Features never bump the version; a needed index is a change request.

```ts
db.version(1).stores({
  settings:      "key",
  courses:       "id",
  events:        "id, kind, start, courseId, importId, seriesId",
  imports:       "id",
  overrides:     "blockId",
  materials:     "id, courseId, kind, lecture",
  pages:         "[materialId+index], materialId",
  blobs:         "id",
  chunks:        "id, courseId, sourceKey",
  lectures:      "id, courseId, eventId, state.status",
  segments:      "[lectureId+seq], lectureId",
  links:         "id, lectureId",
  audio:         "[lectureId+seq], lectureId",
  sessions:      "id, state.status, courseId",
  messages:      "id, thread, [thread+at], courseId, savedToGuideAt",
  practiceSets:  "id, courseId",
  questions:     "id, setId, [setId+order]",
  attempts:      "questionId, setId",
  solutions:     "questionId",
  guides:        "courseId",
  guideSections: "id, courseId, [courseId+order]",
});
```

| Writer | Tables |
| --- | --- |
| F (`lib/*` modules) | settings, courses (`ensureCourse`), overrides (`planActions`), materials, pages, blobs (`ingestFile`), chunks (indexer), messages (`useChat`) |
| C | events, imports |
| L | lectures, segments, links, audio |
| S | sessions |
| P | practiceSets, questions, attempts, solutions |
| G | guides, guideSections |
| T | none (writes only through `planActions`) |

`seedSampleSemester` and `resetAll` are the one exception. They write every table in one transaction, and they live in foundation.

---

## 4. State machines

Each machine is a discriminated union in `types.ts` with pure transition functions. A transition applied twice returns the same state (pause on a paused session is a no-op), so double clicks and retries are safe.

**Material ingest** (progress derived from rows; `ingestFile` is resumable and keyed by file hash):

```
(no row) -> rendering -> reading pages (text layer, or vision for pages under 200 chars) -> indexing -> ready
            any page fails: page row keeps readBy "failed"; status "partial"; Retry re-reads only those pages
```

**Lecture** (stored state plus derived liveness):

```
ready --start--> recording <--pause/resume--> paused --save--> saved --continue--> recording
recording|paused with heartbeatAt older than 15 s  =>  derived "interrupted" (offer Resume or Save)
mic denied => stays ready with error shown; End and save stays enabled
```

The recorder writes `heartbeatAt` every 5 s. The sidebar badge and Today's lecture row read `lectureLive(lecture, now)` from the database, so they never import Lectures code and a closed tab can't leave a stale "Recording" behind.

**Transcription engine** (in memory, Lectures-owned):

```
idle -> preparing(loaded/total bytes) -> ready -> running -> stopped
                                      \-> failed(kind: no-webgpu-and-wasm-too-slow | download | runtime)
```

Pause aborts `run()`. Resume calls `run()` again with `resumeAtMs`. There are no pause methods to keep in sync.

**Transcript segment**: `raw` written when the engine finalizes a chunk. `text` written after `lecture.clean`; it stays missing on failure and the line shows raw text. `flag` is written by `lecture.hints` or by the user.

**Study session** (timer as timestamps; time left is derived):

```
(no row) --open /study/[blockId]--> running(startedAt, pausedMs 0)     plan generated in memory if missing
running <--pause/resume--> paused
running|paused --next step on last step / End session--> completed | ended(early)
```

`sessionClock(session, now)` returns elapsed, left, fraction, over-by and the Pomodoro phase (25 minutes focus, 5 minutes break, derived from elapsed time). Opening the URL twice finds the same row because the session id is the block id.

**Study block status** (derived): `skipped` if overridden; `done` if a session completed or ended, or the user marked it; `inProgress` if its session is running or paused; `now` inside its interval; `missed` after it; otherwise `upcoming`.

**Practice attempt and solution**: an attempt is `{ choice }`. `gradeOf(question, attempt)` returns `unanswered`, `checking` (choice made, no answer known yet) or `answered { correct }`. A solution row exists or it doesn't. Its loading and error states live in memory, which matches today's reducer.

**Guide section**: `draft` missing means not written yet, `failed` records the last error kind, and `stale` is derived when the course's source version is newer than `draft.sourceVersion`.

**Calendar import** (UI state, Calendar-owned): `idle -> reading -> preview(proposal) -> committing -> done(importId, Undo) | failed(kind)`.

**AI call** (client): `pending -> settled(output) | failed(AiError)`. Streams add `streaming(text so far)` and can be stopped.

---

## 5. Scheduler

### 5.1 Signature

```ts
schedule(input: PlanInput): PlanOutput

PlanInput  = { zone, window: { from, to }, courses, events, topics: Map<EventId, Topic>, overrides, prefs }
PlanOutput = { blocks: StudyBlock[], unplaced: Unplaced[], conflicts: OverrideConflict[] }
```

`schedule` has no clock input and never reads `Date.now()`. Placement depends only on the calendar, overrides and preferences. `now` only labels status. A block that was planned for this morning stays there after the morning passes; it becomes `missed`, and Reschedule pins it somewhere new. The window runs from `settings.planningSince` to the term end (last event plus 7 days), so every view sees the same plan whatever range it shows. A semester is about 400 blocks; a full run takes milliseconds and `usePlan` memoizes it on the identity of its inputs.

`topics` resolves a lecture's topic: the Lecture record's topic after notes exist, else the event's topic from the syllabus or sample, else `Lec 9`.

### 5.2 Demand rules

Each rule produces demands with a stable anchor id, minutes, an allowed window and a preferred time.

| Kind | One per | Minutes | Allowed window | Preferred | Titles (calendar / timeline) |
| --- | --- | --- | --- | --- | --- |
| review | lecture in the window | 30, or 45 when the course has a test within 14 days (`why.boostedBy`) | lecture end + 15 min to lecture end + 36 h | first slot that day, else next day from 09:00 | `Review · Recursion` / `Review — Recursion & tree traversal` |
| midweek | course × ISO week with 2 or more lectures | 30 | Tue 12:00 to Thu 22:00 | 14:00 to 17:00 | `Mid-week · PSY` / `Mid-week review — Memory & learning` |
| endOfWeek | ISO week with any lecture | 90 | Sat 09:00 to Sun 22:00 | Sat 11:00 | `End-of-week review` |
| testPrep | test × i of n; n by weight: quiz 0, test 4, midterm 6, exam 8 | 60; the last is 120 with note `Past paper, timed` | one day each, spread evenly over the prep span (test 12 days, midterm 7, exam 14), last on the day before | 13:00 | `Test 2 prep · 1 of 4` |
| work | deadline × i of n; effort small 0, medium 2 h, large 4 h; n = ceil(effort / 2 h) | up to 120 | due − 5 days to due − 3 h | 18:00 to 21:00 | `Work block · PS4`; the last of 2 or more is `A2 final push` |
| custom | override with `custom` | as given | pinned | n/a | as given |

### 5.3 Placement

1. Fixed busy time per day: every timed `lecture`, `lab`, `test` and `busy` event, padded by `prefs.bufferMin` (15) on both sides.
2. Pinned and custom blocks are placed first, as given. A pin that now overlaps a fixed event (the calendar changed under it) is dropped, the block is placed by rule, and the clash is returned in `conflicts`.
3. Remaining demands are placed in this order: testPrep, work, review, midweek, endOfWeek. Ties go to the earlier window end, then to the id, so input order never matters.
4. For each demand, candidate days run in preference order inside its window. Within a day, candidate starts step by 15 minutes from the preferred time forward, then backward. The first start that fits wins. It must lie inside `prefs.dayStart` to `prefs.dayEnd` (08:00 to 22:00, local wall time), overlap no busy time and no placed block, and keep the day under `prefs.maxStudyMinPerDay` (240).
5. A demand with no fit goes to `unplaced` with its reason. Calendar shows `Couldn't fit 2 blocks before ECO101 PS4` with `Plan more time`, which raises the deadline's effort (an event field, so Calendar owns it).
6. Skipped blocks are omitted. Done blocks keep their placement.

Wall times are converted per day with `@date-fns/tz`. Sunday 1 November 2026 is the day Toronto falls back an hour, and it sits inside the sample week, so DST is tested from day one.

`findSlot(input, minutes, { after, before })` reuses step 4 for `planActions.reschedule`. `planActions.pin` refuses an interval that overlaps fixed busy time.

### 5.4 Tests (vitest, foundation-owned)

1. **Golden week.** `schedule(sampleInput(TUE_27_OCT_2026_1012_TORONTO))` for Mon 26 Oct to Sun 1 Nov equals the Paper week table in `docs/design/calendar.md` (titles, second lines, starts and ends). The sample semester seeds pin and skip overrides wherever the rules and Paper disagree (Paper is hand-drawn and not rule-consistent; for example the MAT137 Tuesday lecture has no review). The test also asserts the sample needs at most 8 overrides, so the rules stay close to the drawing instead of being pinned into it.
2. **Invariants** on 200 random calendars from a seeded generator: no overlap with busy time or other blocks; every block inside the day window; reviews after their lecture; prep and work end before their anchor; daily cap respected.
3. **Determinism.** Deep-equal output for shuffled input arrays and for repeated runs.
4. **Stable ids.** Adding an unrelated event changes no block id.
5. **DST.** Sample Sunday blocks are at 1 to 2pm and 3 to 5pm local.
6. **Pins and conflicts.** A pin survives an unrelated change; a pin under a newly imported lecture is reported and re-placed.

### 5.5 What sits around the scheduler

- `usePlan(range)` reads events, overrides, settings, lecture topics and sessions with `useLive`, runs `schedule` once per input change for the whole window, and returns blocks, fixed events and a merged `agenda` for the range, plus `status(block)`.
- `blockMaterials(block)` returns what Today's card and the session viewer show: materials linked to the anchor lecture, the course handouts tagged with the topic, the transcript, and the practice question count for the topic (`+ 12 practice Qs`).
- `blockTitle(block, style)` and `blockReasonText(block, style)` produce every Paper string (`Review · Recursion`, `Review — Recursion & tree traversal`, `After-lecture · 45m`, `Review 1 day after lecture`, `Due Thu · 2h`).

---

## 6. Retrieval

Retrieval feeds the ask panels, session plans, guide sections, question generation and related coursework. It runs in the browser, because the content is in the browser.

### 6.1 Chunking (pure, deterministic ids `<sourceKey>#<n>`)

| Source | Unit | Ref |
| --- | --- | --- |
| Slides | one chunk per slide | `{ page, materialId, doc }` → `Slide 17`, `Lecture 8 slides · Slide 17` |
| Textbook, handout, notes, problem set, syllabus | page text split at paragraphs into windows of at most 350 tokens, one paragraph of overlap, section label carried | `p. 92`, `§5.2`, `A2 handout §3` |
| Lecture transcript | 45 to 90 s windows of cleaned segments, cut at segment boundaries | `{ transcript, atMs, toMs }` → `Transcript 41:05`, `Lecture 7 at 4:15` |
| Practice question | prompt, options and the explanation when a solution exists | `2024 Term Test 2, Q4` |

Re-chunking a source deletes its rows by `sourceKey` and writes the new ones in one transaction, so it is idempotent. Ingest, lecture save and solution arrival call `reindexSource(key)`.

### 6.2 Embeddings

- Active embedder from `/api/status`: `qwen3-embedding-8b@1024` on Token Factory, otherwise `hash@1024`, a deterministic feature-hashing embedder that runs in the browser. Mock mode and OpenRouter use the hash embedder. The walkthrough is deterministic without any key.
- Each vector records the embedder that made it. Search compares only vectors from the active embedder, so two embedders never mix.
- The indexer (`startIndexer`, started by `<Boot>`) embeds chunks missing a vector in batches of 32 through `ai("embed")`, which returns base64 float32 on the wire. It backs off on errors and stops on `budget`. Measured price: about $0.00001 per batch.
- Queries use the `Instruct: Given a student question, retrieve relevant course material\nQuery: …` prefix. Documents are embedded as plain text, per the Token Factory measurements.

### 6.3 Ranking

`retrieve({ courseId, text, k = 8, within?, prefer? })`:

1. Candidates: the course's chunks, narrowed by `within` (for example the last 5 minutes of the live lecture).
2. Lexical score: BM25 over the candidates, with an inverted index built per course and cached by the course's chunk version. It catches exact terms the embedder blurs: `§5.2`, `Term Test 2`, `is_empty`.
3. Dense score: cosine against the query vector, brute force. 2,000 chunks × 1,024 dims is about 2M multiply-adds.
4. Score `0.65 · dense + 0.35 · lexical` (normalized), plus 0.1 for chunks in `prefer` (the session's lecture). With no vectors yet, lexical alone.
5. MMR (λ 0.7) picks `k`, at most 2 per page or transcript minute.

There is no reranker on Token Factory, and the measurements show none is needed at this scale.

### 6.4 Citations

Passages go to the model as `[S1] Lecture 8 slides · Slide 17\n<text>`. The model cites with `[S1]` markers. `parseCitations(text, passages)` removes the markers, keeps the citations in order of first mention, drops ids it did not send, and returns `{ text, citations: SourceRef[] }`. Chips render `sourceLabel(ref, "chip")`. Guide sections return `refs: ["S1", "S4"]` on each block. The client numbers them into footnotes, and `footnoteText(refs)` writes the Paper phrasing: `Lecture 7 at 4:15. Textbook ch. 5, p. 92.`

There is no web search. The Paper chip `docs.python.org` has no source in this design; see open questions.

---

## 7. AI layer

### 7.1 Models and profiles (`lib/ai/models.ts`, the only place model IDs and prices appear)

| Profile | Token Factory model | OpenRouter fallback | Thinking | Default temp |
| --- | --- | --- | --- | --- |
| `vision` | `nvidia/Nemotron-3.5-Super-VL` | `nvidia/nemotron-3.5-super-vl:free` | off | 0.1 |
| `reason` | `nvidia/Nemotron-3-Ultra-550b-a55b` | `nvidia/nemotron-3-ultra-550b-a55b:free` | on | 0.6 |
| `chat` | `nvidia/Nemotron-3-Ultra-550b-a55b` | same as above | off | 0.4 |
| `fast` | `nvidia/Nemotron-3_5-Lightning` | `nvidia/nemotron-3.5-lightning:free` | off | 0.2 |
| `embed` | `Qwen/Qwen3-Embedding-8B`, 1,024 dims | none (hash embedder) | n/a | n/a |

`ModelKey` is a closed union of these four models, so Super 120B and Nano cannot be named. OpenRouter IDs are literal `:free` constants; the `MODEL_*` and `LLM_BASE_URL` overrides are removed, so the uncapped path cannot reach a paid model (current-app fragile point 5). Prices include the embedder at $0.01/M, and an image is counted as 3,400 tokens (measured cap 3,317).

### 7.2 Tasks (the role registry)

`lib/ai/registry.ts` is `{ ...chatTasks, ...retrievalTasks, ...materialTasks, ...todayTasks, ...calendarTasks, ...lectureTasks, ...studyTasks, ...practiceTasks, ...guideTasks }`. Foundation writes the nine imports once. `defineTasks(prefix, …)` prefixes every key, so two features cannot collide. Every task declares `input` (zod), `output` (zod, or stream), `profile`, `maxTokens`, `prompt`, `example` and `mock`. The JSON schema sent as `response_format` is derived from `output` with `z.toJSONSchema`, so it can't drift from the parser.

| Task | Owner | Profile | max_tokens | Output | Notes |
| --- | --- | --- | --- | --- | --- |
| `ask` | F `lib/chat` | `chat` (Quick) or `reason` (Deep) | 1,000 / 8,000 | stream, `[S#]` markers | Deep streams `thinking` events |
| `embed` | F `lib/retrieval` | `embed` | n/a | vectors | batches of up to 32 |
| `material.read` | F `lib/materials` | `vision` | 12,000 | pages: text, slide heading/body/code, section labels | up to 3 pages per call; only pages whose text layer is under 200 characters |
| `today.brief` | T | `chat` | 300 | headline, subline | optional rewrite of the rule-based brief |
| `calendar.read` | C | `vision`, temp 0 | 2,000 | strict: weekly meetings (day enum, `HH:MM`), dated items | code validates times and expands over the term |
| `lecture.clean` | L | `fast` | 2,000 | sentences | one call per audio chunk; prompt asks for Unicode math |
| `lecture.hints` | L | `fast` | 2,000 | hints (quote, assessment), tasks, mentions | rolling 60 s window, deduped by quote |
| `lecture.notes` | L | `chat`, temp 0.3 | 4,000 | summary, key points, hints | once at save |
| `study.plan` | S | `reason` | 8,000 | steps (kind, minutes, source passage, check question), moment | schema described in the prompt; code rescales minutes to the block |
| `practice.parse` | P | `vision` | 12,000 | today's parse schema plus type and marks | was `/api/parse` |
| `practice.solve` | P | `reason` | 8,000 | answer, explanation, `{label,text}` steps, conclusion, whyNot, resources `[S#]` | was `/api/solve` |
| `practice.generate` | P | `reason`, temp 0.8 | 8,000 | questions | each is then checked |
| `practice.check` | P | `chat`, temp 0 | 1,000 | answer | a generated question is dropped when this disagrees with its key |
| `guide.outline` | G | `reason` | 8,000 | chapters and sections | |
| `guide.section` | G | `chat`, temp 0.5 | 6,000 | blocks and footnote refs | ~8 s at 300 tok/s |

With thinking on, every prompt also describes its JSON, because the grammar constrains only `content` (measured).

### 7.3 Client surface (`lib/ai`)

```ts
ai<N extends JsonTaskName>(name: N, input: TaskInput<N>, opts?: { signal?: AbortSignal }): Promise<TaskOutput<N>>
aiStream<N extends StreamTaskName>(name: N, input: TaskInput<N>, opts?): AsyncIterable<StreamEvent>
class AiError { kind: AiErrorKind; message: string; retryAfterMs?: number }
errorCopy(error: AiError): { title: string; detail?: string }   // the one place UI copy for errors lives
useAiStatus(): { mode: "token-factory" | "openrouter" | "mock"; embedder; spend?: { spentUsd; capUsd } }
```

The client imports the registry with `import type`, so prompts and mocks never ship to the browser. Request bodies, NDJSON lines and HTTP codes are private to `lib/ai`.

### 7.4 Server path (`runTask`, called by `app/api/ai/[task]/route.ts`)

1. Unknown task: 404. Body fails `task.input`: 400 `bad_input`.
2. Mock mode: return `task.mock(input)`.
3. Build the prompt. Estimate input tokens as characters / 3 plus 3,400 per image.
4. Up to 3 attempts. Each attempt reserves its own worst case (Token Factory only), calls the provider with `signal: req.signal`, SDK `maxRetries: 0` and a 280 s timeout, then settles to the real usage, or to the worst case when usage is missing. Retry on 429, 5xx and timeouts, honoring `Retry-After` up to 20 s. This counts every upstream attempt against the cap (fragile point 4) and stops upstream work when the browser cancels (fragile point 8).
5. JSON tasks: `extractJson`, then `task.output.safeParse`. On failure, one repair attempt that sends the zod error back, under the same budget rule. Still bad: 502 `bad_output`.
6. Stream tasks: `application/x-ndjson` lines `{"t":"text","d":…}`, `{"t":"think","d":…}`, `{"t":"done"}`, `{"t":"error","error":…}`. Usage is read from the final chunk, where `choices` is empty, and settled in `finally`.

Error kinds and status codes: `bad_input` 400, `missing_key` 500, `budget` 402, `rate_limited` 429, `too_large` 413, `bad_output` 502, `upstream` 502. The client adds `offline` and `aborted`. Domain outcomes such as "no questions found" are Practice results, not AI errors.

### 7.5 Spending cap

- `LedgerStore` has three methods: `reserve(hold, cap)`, `settle(holdId, actual)` and `status(now)`. Amounts are integer micro-dollars, so repeated settles don't drift.
- `RedisLedger` (Upstash REST) runs reserve and settle as Lua scripts. Reserve drops expired holds from a sorted set, sums live holds, compares against the cap and adds the hold, all in one atomic step across every instance. Settle uses `SET NX` on `settled:<id>`, so a second settle is a no-op, and it records the actual cost even if the hold already expired.
- `FileLedger` keeps today's JSON file and promise queue for local dev.
- Selection: Redis when `UPSTASH_REDIS_REST_URL` is set. Otherwise the file, unless `VERCEL` is set, in which case every Token Factory call fails closed with `budget` ("the cap can't be checked").
- `SPEND_CAP_USD` is parsed at startup as a positive finite number. Anything else fails closed (fragile point 2). A corrupt ledger file fails closed instead of reading as $0 (fragile point 3).
- Hold TTL stays 10 minutes, longer than one attempt's 280 s timeout.
- `/api/status` returns `{ spentUsd, capUsd }`. The sidebar's `SpendMeter` shows `$0.03 of $30`, and budget copy reads the configured cap instead of a hard-coded `$30` (fragile point 6).

### 7.6 Mocks and live checks

- Mode: `token-factory` when `NEBIUS_API_KEY` is set; `openrouter` when only `LLM_API_KEY` is set; `mock` when `CUE_AI=mock`, or when no key is set and `NODE_ENV` is not production. `CUE_AI=mock` is refused when `VERCEL_ENV=production`, so a public deploy cannot serve canned answers.
- Each task's `mock` is deterministic and written against `SAMPLE` ids, so canned answers cite real sample sources. The `ask` mock cites passages by label from the ones it actually received, which means a retrieval regression shows up as a missing chip in the walkthrough.
- `GET /api/ai` lists every task with its profile and `example`. `scripts/check-nemotron.mjs` posts each example to a running server and checks for a 200 (the server has already validated the output). Without `NEBIUS_API_KEY` it runs on OpenRouter and reports Token Factory as INCONCLUSIVE.

---

## 8. Routes

| URL | Group | Owner | Renders |
| --- | --- | --- | --- |
| `/` | browse | T | Today. Empty state with `Try the sample semester` and `Upload calendar`. |
| `/calendar?view=week\|day\|month&date=YYYY-MM-DD` | browse | C | Calendar; view and date in the URL so reload and Back work |
| `/study` | browse | S | upcoming blocks with Start, past sessions |
| `/study/[blockId]` | focus | S | create-or-resume the session for the block, then the session screen |
| `/lectures` | browse | L | lectures by course, `Record a lecture` for ad hoc notes |
| `/lectures/[lectureId]?t=<ms>` | focus | L | note taker when ready, recording or paused; saved notes when saved; `t` scrolls the transcript |
| `/practice` | browse | P | papers, upload (Intake), generated sets; `?generate=<scope>` creates a set and replaces the URL with it |
| `/practice/[setId]?q=<questionId>` | focus | P | the practice screen |
| `/guides` | browse | G | redirect to the last course read |
| `/guides/[courseId]/[[...section]]` | browse | G | guide with contents nav; no section opens the last-read or first section |
| `/export/guide/[courseId]` | focus | G | every section, print stylesheet, `window.print()` once ready |
| `POST /api/ai/[task]` | | F | the AI gateway, JSON or NDJSON by task kind |
| `GET /api/ai` | | F | task list with examples (for `check-nemotron`) |
| `GET /api/status` | | F | AI mode, embedder, spend |

IDs in URLs are built by constructors that keep them URL-safe: `review.evt_9f2c1a`, `prep.evt_x81.3`, `lec.evt_9f2c1a`, `lec.adhoc.k3j9`. Pages are client components that read IndexedDB; route files await `params` (a Promise in Next 16) and pass plain values down. Nothing reads cookies, so no route is forced dynamic, and Cache Components stay off.

Cross-feature entry points are URL contracts in `href`: Today's Start goes to `href.study(blockId)`, a calendar lecture's `Take notes` goes to `href.lecture(ids.lectureForEvent(eventId))`, Guides' `Quiz me on this section` and Study's `Quiz me on this` go to `href.practice({ generate: scope })`, and a transcript citation goes to `href.lecture(id, { atMs })`. Slide and page citations open `SourcePeek` in place, so nobody loses a running session or practice paper.

---

## 9. Shell

- **Root layout** (F): Timeless Sans through `next/font/local` with the 400 to 499 range trick kept, `<html className={font.variable}>`, `body.relative`, an `isolate` wrapper, one `TooltipProvider`, the Base UI `Toaster`, and `<Boot>`. Boot requests persistent storage, starts the indexer and loads `/api/status`.
- **Browse layout** (F): `SidebarProvider` with `--sidebar-width: 232px`, `defaultOpen` on the client (no cookie read), an icon rail from 768 to 1023 px and an off-canvas Sheet below 768. `AppSidebar`: wordmark link with the mascot, the six `NAV` items (`Today`, `Calendar`, `Study sessions`, `Lecture notes`, `Practice`, `Study guides`) with `aria-current="page"`, and a footer with `SpendMeter` and `DataMenu` (`Load sample semester`, `Reset all data`). The main column uses document scroll. Today, Calendar and the guide reader are browse screens.
- **Focus layout** (F): a full-bleed `h-dvh` frame with no docked sidebar. `Cmd/Ctrl+B` opens the same `AppNav` in a left Sheet over the content, so a live transcript or a timed paper never reflows. Study session, the note taker and saved notes, the practice paper and the export view are focus screens. Each has its own exit: `End session`, `End and save notes`, `Esc` in Practice.
- **Live badges** (F): `LiveBadges` reads the database. A lecture whose `lectureLive` is `recording` shows `Recording` next to Lecture notes. A running session shows its time left next to Study sessions. Neither imports feature code. The recorder itself is a module singleton in `features/lectures`, so it keeps running when the student opens a related card and leaves the note-taker route; the root layout never remounts.
- **Tokens**: Cue tokens and the shadcn variables in OKLCH (the tables in `practice.md` section 7 and `shadcn-base-ui.md`), plus `--radius-xs: 4px`, `--color-ink-hover`, `--color-guide`, `--text-xs/base/2xl` for the sizes Today, Month and charts use, `--weight-regular: 420`, `--tracking-display: -0.02em`. `check-tokens.mjs` scans `app/`, `components/`, `features/` and `lib/` for hex, rgb and hsl, and for imports of `@base-ui/react` outside `components/ui`.
- **Headers** (`next.config.ts`, F): the Tailwind Turbopack loader, and `Cross-Origin-Opener-Policy: same-origin` with `Cross-Origin-Embedder-Policy: credentialless` on every route, so the WASM fallback for Parakeet can use threads. Isolation applies to a whole document, and client navigation keeps the first document, so it can't be scoped to `/lectures`.

---

## 10. Workstream partition

Six feature worktrees start from the foundation commit. Each owns disjoint paths and writes disjoint tables. They meet only through `@/lib` modules, the database and URLs.

| Workstream | Owns (exact paths) | Writes | AI tasks | Reads and calls |
| --- | --- | --- | --- | --- |
| **F** Foundation | `app/layout.tsx`, `app/globals.css`, `app/(browse)/layout.tsx`, `app/(focus)/layout.tsx`, `app/api/**`, `components/**`, `lib/**`, `scripts/e2e/walkthrough.mjs`, `scripts/e2e/steps/boot.mjs`, `scripts/check-*.mjs`, `scripts/fixtures/lecture*`, `scripts/fixtures/chunks*/**`, `scripts/fixtures/mediarecorder/**`, `workstreams.json`, `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `components.json`, `.env.example`, `docs/architecture.md` | settings, courses, overrides, materials, pages, blobs, chunks, messages | `ask`, `embed`, `material.read` | everything |
| **T** Today | `app/(browse)/page.tsx`, `features/today/**`, `scripts/e2e/steps/today.mjs` | none | `today.brief` | `usePlan`, `planActions`, `blockMaterials`, lectures (live state, hint counts), sessions |
| **C** Calendar | `app/(browse)/calendar/**`, `features/calendar/**`, `scripts/e2e/steps/calendar.mjs`, `scripts/fixtures/calendar/**` | events, imports | `calendar.read` | `usePlan`, `planActions`, `ensureCourse`, `renderPages`, `ingestFile` (syllabus) |
| **L** Lecture notes | `app/(browse)/lectures/**`, `app/(focus)/lectures/**`, `features/lectures/**`, `scripts/e2e/steps/lectures.mjs`, `scripts/fixtures/lectures/**` | lectures, segments, links, audio | `lecture.clean`, `lecture.hints`, `lecture.notes` | events, `retrieve`, `reindexSource`, `useChat` |
| **S** Study sessions | `app/(browse)/study/**`, `app/(focus)/study/**`, `features/study/**`, `scripts/e2e/steps/study.mjs` | sessions | `study.plan` | `usePlan`, `blockMaterials`, `retrieve`, `useChat`, `SourceView` |
| **P** Practice | `app/(browse)/practice/**`, `app/(focus)/practice/**`, `features/practice/**`, `scripts/e2e/steps/practice.mjs`, `scripts/fixtures/practice/**` | practiceSets, questions, attempts, solutions | `practice.parse`, `.solve`, `.generate`, `.check` | `ingestFile`, `retrieve`, `reindexSource`, `useChat`, guide sections and messages (generation scopes) |
| **G** Study guides | `app/(browse)/guides/**`, `app/(focus)/export/**`, `features/guides/**`, `scripts/e2e/steps/guides.mjs`, `scripts/fixtures/guides/**` | guides, guideSections | `guide.outline`, `guide.section` | `retrieve`, materials, lectures, saved messages, `AddMaterialDialog` |

What foundation delivers before any feature starts, in build order:

1. Tooling: Tailwind 4, shadcn base-nova with every component the specs name (button, select, tabs, sidebar, sheet, dialog, alert-dialog, popover, dropdown-menu, tooltip, progress, scroll-area, badge, card, input, input-group, textarea, separator, toggle-group, checkbox, collapsible, skeleton, toast, item, kbd, field, empty, spinner, drawer) restyled to Cue, ESLint with the TypeScript 6 alias, vitest, Playwright, the check scripts, `workstreams.json`. Every dependency any feature needs: dexie, dexie-react-hooks, @date-fns/tz, ical.js, @huggingface/transformers, @upstash/redis, lucide-react, zod, openai, pdfjs-dist.
2. Tokens, fonts, both layouts, the sidebar, the nav Sheet, Boot.
3. `lib/db`, `lib/domain`, `lib/time`, `lib/courses`, `lib/routes`, `lib/testids`, `lib/sources`.
4. `lib/plan` with the golden-week test passing.
5. `lib/ai` with both ledgers, the status route, and Practice's tasks moved from `lib/llm.ts`.
6. `lib/materials`, `lib/retrieval`, `lib/chat` and the shared `components/cue` parts.
7. `lib/sample`: the full sample semester, consistent across all six Paper screens.
8. Practice moved into the shell on IndexedDB and `useChat`, with its walkthrough step.
9. A stub page in every feature route (an `h1` and its test ids), a stub `tasks.ts` in every feature with `defineTasks(prefix, {})`, and a stub step file per feature that the runner already calls.

Guards that make a wrong change fail where it is made:

- `eslint.config.mjs` builds its rules from `workstreams.json`: in `features/<x>/**`, imports of `@/features/<y>` are errors; outside `components/ui`, imports of `@base-ui/react` are errors; anywhere, imports of `@/lib/*/internal/*` are errors; and `db.<table>.(put|add|update|delete|bulkPut|bulkAdd|bulkDelete|clear)` on a table the workstream does not own is an error (a `no-restricted-syntax` selector per table).
- `scripts/check-ownership.mjs <workstream>` fails when `git diff --name-only main...` touches a path outside the workstream's globs. It also checks that every route folder and every table has exactly one owner.
- Merge order at integration: foundation follow-ups first, then Practice (it touches the most existing code), Calendar, Lectures, Study, Guides, Today. Paths are disjoint, so order matters only for the walkthrough, which runs after each merge.

---

## 11. Verification plan

### 11.1 The runner

`node scripts/e2e/walkthrough.mjs [--only today,calendar] [--keep-server]`, after `pnpm build`:

- Starts `pnpm start` with `CUE_AI=mock`, waits for `/api/status`.
- Chromium from Playwright's default lookup. Context: 1440×900, `timezoneId: "America/Toronto"`, locale `en-US`, fresh storage.
- `page.clock.install({ time: "2026-10-27T10:12:00-04:00" })`. Steps move the clock with `t.clock.setSystemTime` and `t.clock.runFor`, which also drives the demo transcription engine and the session timer.
- Runs `boot`, then the steps in `workstreams.json` order. Each step gets `{ page, expect, clock, shot, tid, sample, reseed }`. `reseed()` uses `DataMenu` (Reset, then Load sample semester), so a step never depends on an earlier feature's side effects.
- After each step: no console errors; at 375×812, `document.documentElement.scrollWidth <= 375` on that step's main screen.
- Screenshots go to `.verify/e2e/<run>/<name>-1440.png` for the Paper judge. Exit code 0 only when every step passes.

Hooks: roles and accessible names first. `data-testid` only for regions with no role, all listed in `lib/testids.ts` (`today.nextUp`, `today.timeline`, `calendar.weekGrid`, `calendar.hours`, `calendar.monthGrid`, `study.plan`, `study.viewer`, `chat.thread`, `lectures.related`, `practice.bar`, `guides.section`, `guides.footnotes`, `shell.spend`). The step files import `lib/testids.ts` directly; Node 26 strips the types. States are asserted through `data-state` attributes the components already need for styling (`flagged`, `current`, `missed`).

### 11.2 Main path per screen

| Step | Main path (abridged) | States and hooks checked | Shots |
| --- | --- | --- | --- |
| boot (F) | `/` on a fresh browser shows `Add your schedule to plan today.`; click `Try the sample semester` | h1 becomes `Three sessions today. Start with recursion.` | |
| today (T) | at 10:12: headline and subline verbatim; next-up card; timeline; lecture row opens saved notes; `Start session` opens the session | chip `CSC148`; meta `Next up · 10:30–11:15am · Review 1 day after lecture`; chips `Lecture 8 slides`, `Lecture 8 transcript`, `Lab 6 handout`, `+ 12 practice Qs`; `ol` named `Today` with 4 rows (`9am MAT137 Lecture — Integration by parts · Transcript ready`, …); `4 blocks · 3h 15m of study`; nav `Today` has `aria-current="page"`; URL `/study/review.…` | today |
| calendar (C) | at 10:40, `/calendar`: week grid; lecture popover `Take notes`; Day and Month via the View select; previous and next; `Today`; Add schedule with `fixtures/calendar/timetable.ics` then Undo; same with `timetable.png` (mock `calendar.read`) | h1 `October 2026`; Tue header `aria-current="date"`; hours scroller `scrollTop` 360; button named `Review · Recursion, Tuesday 27 October, 10:30 to 11:15am` shows `· now`; due chip `CSC148 A2 due 11:59pm`; `Take notes` URL `/lectures/lec.…`; month Wed 28 shows `+2 more`; toast `Added 1 course. Cue planned N study blocks.`; Undo removes them | calendar-week, calendar-day, calendar-month |
| lectures (L) | saved notes of Tuesday's MAT137 lecture; then Thursday's MAT137 lecture: `Start recording` (demo engine), `runFor(38:12)`, ask about the last 5 minutes, Pause, Resume, `End and save notes` | `role=status` reads `Recording`; `role=log` named `Live transcript` holds the Paper lines with `33:20` `data-state="flagged"` and `Flagged · on Term Test 2`, then a `Live` row; progress `aria-valuetext="38 minutes 12 seconds of 50 minutes"`; first related card `Term Test 2`; answer chip `Transcript 30:02`; `Paused` and `Resume`; saved view shows `Summary`, `Exam hints · 1`, `Key points` | lectures-live, lectures-saved |
| study (S) | at 10:30 from Today, `Start session`; plan generates (mock); `runFor(5:00)`; `Next step`; slides to 14; `runFor` to 13:12 elapsed; transcript moment; Quick ask; chip opens `SourcePeek`; Deep toggle; `Add to study guide`; `End session` and confirm | h1 `CSC148 · Recursion & tree traversal`; list `Session plan` with step 2 `aria-current="step"`; `Slide 14 of 32`, heading `Preorder traversal`; `31:48 left` and progress 29; moment opens tab `Transcript` at `32:14`; chips `Slide 17`, `Transcript 41:05`, `A2 handout §3`; `Added to study guide`; alertdialog `End this session?`; back on `/` the row reads `Done` | study |
| practice (P) | `/practice` lists `CSC148 · 2024 Midterm`; open it; then the migrated `verify.mjs` scenarios on `fixtures/practice/sample-quiz.pdf`; `Write questions` for 5 | eyebrow `Question 7 · Multiple choice · 2 marks`; option B `Your answer · correct`; tile names (`Question 3, missed`, `Question 7, current, correct`); 3 resource rows; forced 429 then Retry (route interception); forced 402 on `practice.solve` shows the budget line with the configured cap; topic filter through the Base UI Select; 5 tiles in the generating state, then `Written by Cue`; reload keeps state; `Esc` returns to `/practice` | practice |
| guides (G) | `/guides` redirects to ECO101 `Price elasticity of demand`; footnote marker; course Select to CSC148; `Write this guide` (mock outline and first section); `Export PDF` | h1 `ECO101 · Study guide`; nav `Contents` with the section `aria-current="page"`; figure `role=img` named from data (`Elastic demand curve…`); note named `Common mistake · will be on the midterm`; 4 footnotes, marker 1 focuses `#fn-1`; export URL `/export/guide/CSC148` with print media and one `window.print` call (stubbed) | guides, guides-print |

### 11.3 Unit tests (vitest, `pnpm test`)

| Owner | Tests |
| --- | --- |
| F | scheduler (section 5.4); `lib/time` against every Paper string (`9am`, `10:30–11:15am`, `11:15am–12pm`, `3h 15m`, `31:48`, `41:05`); `sourceLabel` and `footnoteText` against the guide footnotes and Practice resource metas; chunkers; BM25 and hybrid ranking on the sample (the Study question must rank slide 17, transcript 41:05 and A2 §3 in the top 8); `parseCitations`; `sessionClock`, `pomodoroPhase`, `lectureLive`, `gradeOf`; one ledger contract suite run against `FileLedger` and an in-memory Lua-equivalent store, and against Redis when `UPSTASH_REDIS_REST_URL` is set; every task's `mock(example)` parses with its own `output` schema |
| C | ICS import (RRULE expansion, stable event ids on re-import, course detection), timetable expansion over the term, overlap lanes |
| L | segment splitting and timestamp interpolation, hint dedupe, mention resolution, demo engine timing |
| S | plan normalization (minutes sum to the block), step transitions |
| P | the existing reducer, parse and solve schemas, generated-question checks |
| G | chart geometry against the derived values in `study-guide.md` 3.3 (Q2 10.03, x 150.25; label merge under 24 px) |

### 11.4 Definition of done mapping

| plan.md item | How this design meets it |
| --- | --- |
| 1. typecheck, lint, build | `pnpm typecheck`, `pnpm lint` (includes boundary rules), `pnpm build`, plus `pnpm test` |
| 2. walkthrough | `scripts/e2e/walkthrough.mjs`, section 11.1 |
| 3. check-nemotron | `GET /api/ai` lists every task and example; the script calls each |
| 4. check-tokens | scans for hex, rgb, hsl and direct `@base-ui/react` imports |
| 5. Paper judge | 1440×900 shots per screen. Calendar and the guide render inside the 232 px sidebar; the judge records that as intended. |
| 6. design passes | per-screen review on the shots and the live build |

An optional `scripts/e2e/parakeet.mjs` runs the real engine with Chrome for Testing (WebGPU), `--use-file-for-fake-audio-capture=scripts/fixtures/lecture.wav`, and checks that the transcript contains "term test 2" (or "two"). It needs the 454 MB model, so it waits for the operator's approval and stays out of the walkthrough.

---

## 12. Rationale

### Problem

The product needs six screens that share one picture of a student's term: a calendar, a plan derived from it, course material, lecture transcripts, practice, and generated text with citations. Three constraints shape it. There are no accounts, and the demo must work in a fresh browser. Every Token Factory call must pass a $30 cap that has to hold on Vercel. And after one foundation unit, six agents build the features in parallel worktrees and must never edit a shared file. The existing code fixes some choices: the provider switch, reserve-then-settle spending, the zod gates and the practice reducer all work and are kept. Paper fixes the strings, and many of them are derived values (`3h 15m of study`, `Review 1 day after lecture`, `31:48 left`), so the model has to produce them, not hard-code them.

### Shape

Data first. Twenty-one IndexedDB tables, each with one writer. The plan is not one of them. `schedule()` derives blocks from events, overrides and preferences with no clock input, and block ids come from anchors, so a session keyed by block id survives every re-plan. Everything that waits on a model is an optional field, so a reload never strands a "loading" row. Citations are self-describing `SourceRef`s, and one function turns them into every Paper phrasing.

Interface depth, module by module:

- `lib/ai` exposes `ai`, `aiStream`, `AiError`, `errorCopy` and `defineTasks`. Behind them: provider choice, model IDs and prices, thinking flags, the JSON schema derived from zod, JSON extraction and repair, retries with a reservation per attempt, abort propagation, the ledger, mocks and the wire format. Callers learn one function and a task name.
- `lib/plan` exposes `schedule`, `usePlan`, `planActions` and title helpers. Behind them: five demand rules, slot search, buffers, the daily cap, overrides, DST and status derivation.
- `lib/chat` exposes `useChat({ thread, scope })`. Behind it: retrieval for the scope, the prompt per scope (including Practice's "don't reveal the answer"), streaming, stop, citation parsing and persistence. Before this, three screens would each have wired retrieval and parsed markers.
- `lib/retrieval` exposes `retrieve`, `parseCitations` and `reindexSource`. Behind them: chunkers, two embedders, the background indexer, BM25, cosine and MMR.
- `lib/db` is the widest surface: the tables themselves. It is wide on purpose, because rows are the domain types. Writes are narrowed by the lint rule, not by a repository layer that would only forward calls.

Validation lives at the edges: zod on every AI input and output, on ICS and timetable imports, and on the sample seed in tests. Inside, code trusts the types (per boundary-discipline). The design does not include accounts, sync across devices, web search, a server vector store or a reranker.

### Synthesis decision

Filled in by arena. This package is one candidate.

### Tradeoffs accepted

- We accept a heavier foundation (scheduler, retrieval, chat, ingest and the full sample semester all land before features start) in exchange for six features that build on real data from the first hour and never need to edit shared code. plan.md put the scheduler in the Calendar workstream; three screens consume it and the sample semester's fidelity depends on it, so it moves to foundation.
- We accept that a block can move when the calendar changes (a new event takes its slot) in exchange for never syncing stored blocks with their inputs. Pins hold where the user put them.
- We accept local-only data (no second device, and clearing site data loses it) in exchange for no accounts, no server content store, and audio and textbooks that never leave the browser beyond the pages the model reads.
- We accept one AI route with one `maxDuration` in exchange for one place that enforces validation, the cap, retries and mocks.
- We accept a weak hash embedder in mock and OpenRouter modes in exchange for deterministic retrieval with no key and no mixed vector spaces.
- We accept golden-test overrides in the sample semester (up to 8 pins and skips) in exchange for rules that stay general instead of being bent to a hand-drawn week.
- We accept global COOP/COEP headers in exchange for a WASM fallback that can use threads; every cross-origin resource must then be CORS or credentialless-compatible.
- We accept that `lib/ai/registry.ts` imports nine task files, six of them feature-owned, in exchange for one registry that `check-nemotron` and the gateway both read. The import list is fixed; features change only their own file.

### Alternatives considered

- **Stored study blocks with a re-plan step.** Callers would call `replan()` after every import, recording or edit, and reconcile it with user moves; three screens would each have to remember to. Lost because it turns a pure function into a sync protocol with more surface for callers.
- **One API route per feature** (`/api/lectures/clean`, …). Each route would repeat validation, reservation, retries, mock switching and error mapping, so the cap's correctness would depend on six copies. Lost on depth: the per-feature surface grows and hides nothing new.
- **A server database for content** (Postgres or Supabase with anonymous device ids). It would give multi-device sync, but it needs an identity scheme the brief rules out, a server copy of private audio and textbooks, and a second persistence path for blobs. Lost on the no-accounts constraint and on exposure.
- **The scheduler in the Calendar workstream** (plan.md's split). Today and Study would read a stub during parallel work, and the sample semester could not be checked against Paper until integration. Lost because the plan has three consumers, and shared logic belongs in foundation.
- **Features build their own ask context** and pass passages to a generic chat. More flexible, but each screen would carry retrieval calls, prompt rules and citation parsing, and they would drift. Lost on depth; the four scopes are known now.

### Open questions and risks

1. Should the Pomodoro break be derived (5 minutes after every 25 of focus, inside the block), or should each plan step count as an interval with breaks between steps?
2. Paper's mode switch reads `Quick · Nano`. Both modes run Ultra now. Should the labels read `Quick` and `Deep`, with the model name in a tooltip?
3. Is Upstash Redis through the Vercel Marketplace acceptable as the ledger store? It is an outward-facing integration and needs the operator before any deploy.
4. Can Parakeet CTC on the WASM fallback keep up with live speech on the demo laptop? It is unmeasured. Without WebGPU, chunks queue in IndexedDB and transcribe late; is that acceptable, or should the note taker refuse to start?
5. Which sample clock should the judge use: 10:12 (Today's `Next up`) or 10:40 (Calendar's `· now`)? This plan shoots Today at 10:12 and Calendar at 10:40 in the same run.
6. Paper cites `docs.python.org`. Is web search in scope, or do chips cite course material only?
7. Lectures start ten minutes past the hour (Paper shows `of 50:00` for a 9 to 10am slot). Is `prefs.lectureStartsPastMin = 10` the right default for real imports?
8. Will global `COEP: credentialless` break anything the app loads? pdf.js workers and the Hugging Face model download need a check in the first foundation build.
9. Does the Node 26 type stripping that lets `.mjs` steps import `lib/testids.ts` hold on the CI image? If not, `testids` becomes JSON.

### Next implementation step

Write `lib/time`, the `lib/domain` plan types and `lib/plan/schedule.ts` with the golden-week test against the Paper table, because the sample semester and three screens depend on its output.

---

## 13. Red-flag screen

| Flag | Where it could appear | How the design avoids it |
| --- | --- | --- |
| Shallow module | a `lib/db` repository layer | not built; rows are domain types, writes are limited by lint |
| Information leakage | wire types and model IDs | NDJSON, request bodies and model IDs never leave `lib/ai`; `response_format` is derived from the zod schema |
| Temporal decomposition | ingest stages | `lib/materials` owns "file to pages"; `lib/retrieval` owns "pages to searchable chunks", the knowledge each protects |
| Pass-through method | route files | Next requires them; they await params and render one feature component |
| Split ownership | overrides, courses, messages, the recording badge | one writer module each; the badge derives from the lecture row and its heartbeat |
| Two ways to do one task | old `/api/parse`, `/api/solve`, `/api/ask`, `AskChat`, localStorage session | deleted in foundation after their callers move |
| Importable internals | `lib/*/internal`, other features | lint errors from the generated config |
| Hand-synced list | nav, routes, workstreams, registry, schema, prices | `NAV` and `href` live in `lib/routes.ts`; `check-ownership` checks routes and tables against `workstreams.json`; the registry is spread from task files; prices sit next to model IDs; the JSON schema comes from zod |

Residual risk: the `ask` task's four scope prompts live in foundation. A feature that needs a fifth scope has to file a change request. That is deliberate, but it is the most likely change request during the parallel phase.
