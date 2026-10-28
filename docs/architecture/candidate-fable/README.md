# Cue architecture, candidate "fable"

The type sketch is in [`types.ts`](types.ts). This file is the rationale and the module map. Sections follow the order the task asked for: usage, module map, data model, state machines, scheduler, retrieval, AI layer, routes, shell, workstream partition, verification. The rationale sections (problem, shape, tradeoffs, alternatives, open questions, next step) wrap around them.

## Problem

Cue grows from a one-screen practice app into six screens that share courses, materials, a calendar, lectures and chats, with no user accounts, a $30 model budget, and six feature agents building in parallel worktrees after one foundation unit. Three facts make the shape non-obvious. First, all student data has nowhere to live but the browser, so every AI call must carry its own context in the request body and the server stays stateless except for the spend ledger, which must be durable and atomic on Vercel. Second, five screens cite course material in five visual forms (source chips, resource rows, footnotes, related-link cards, plan steps) and the data for all five comes from one retrieval path, so citation has to be one type or the features will each invent one. Third, the parallel build only works if every shared decision (tables, roles, citation, shell, sample data, test hooks) is fixed in files no feature edits, and every feature's writes land in tables no other feature writes. Constraints carried over from Phase A: the existing reducer, parse pipeline, `budgeted()` wrapper and zod gate are kept (`docs/research/current-app.md` §8); the measured role table in `docs/research/token-factory.md` §9 is the model policy; `docs/decisions.tsv` rows 7, 8, 10 and 11 (cap, durable ledger, Ultra for quick chat, Parakeet in the browser) are fixed.

## Usage (caller's view)

This is the quickstart a feature agent reads on day one. Seven public surfaces: `db`, `SourceRef`, `retrieve`, `ai`, `useChat`, `planStudy`, `TranscriptionEngine`. Everything else is behind one of them.

### Read and write data

```ts
import { db } from "@/lib/db";                       // Dexie; client-only, fails the build on the server
import { useLiveQuery } from "dexie-react-hooks";    // screens subscribe; no copy of DB state in React

// Today: every block on today's calendar, joined with its session for state
const blocks = useLiveQuery(() => db.blocks.where("start").between(dayStart, dayEnd).sortBy("start"), [dayStart]);
const sessions = useLiveQuery(() => db.sessions.where("blockId").anyOf(blocks?.map((b) => b.id) ?? []).toArray(), [blocks]);
const state = blockState(block, sessions.find((s) => s.blockId === block.id), now, nextId); // derived, never stored
```

Writes go through the owning feature's commands, never through `db.table.put` from a screen:

```ts
import { startSession } from "@/lib/sessions/commands";
const sessionId = await startSession(block.id);      // idempotent; returns the live session if one exists
router.push(`/sessions/${sessionId}`);
```

### Cite course material

```ts
import { describeRef } from "@/lib/refs";
import { useOpenRef } from "@/components/shared/source-sheet";

const resource = describeRef({ kind: "transcript", lectureId, atSec: 2465 as Seconds }, lookup);
// → { ref, label: "Transcript 41:05" }  (practice meta: "Lecture 8 transcript · 41:05")
<SourceChip resource={resource} />                    // renders the label; click → openRef(resource.ref)
const openRef = useOpenRef();                         // slides/pages/transcript open in the SourceSheet, others navigate
```

### Ask the model with retrieval

```ts
import { retrieve, toContext } from "@/lib/retrieval";
import { useChat } from "@/lib/chat/use-chat";

// Study session ask panel, scoped to this lecture's materials
const chat = useChat({ kind: "session", sessionId, lectureId }, {
  courseId,
  context: async (text) => toContext(await retrieve({ courseId, text, scope: { materialIds: plan.materialIds, lectureIds: [lectureId] } }, lookup)),
});
await chat.send("Is postorder just preorder backwards?", "quick");
// chat.thread.messages[last] streams in; on done, .sources holds [Slide 17, Transcript 41:05, …] from the [n] citations
```

A non-chat role is one call:

```ts
import { ai } from "@/lib/ai/client";
const plan = await ai.run("planSession", { block, minutes, materials, hints }, { signal });   // typed by the role's zod output
// throws ai.Error with .api.kind ∈ budget | rate_limited | empty_output | … ; the BudgetNotice component renders kind "budget"
```

### Transcribe a lecture

```ts
import { useLectureRecorder } from "@/lib/lectures/recorder-provider";
const rec = useLectureRecorder();                      // one instance above both layouts
await rec.open(lectureId, settings.engine);            // "parakeet" or "demo"; downloads the model, status "starting"
await rec.start();                                     // lines appear in db.transcript via liveQuery; links in db.links
await rec.endAndSave();                                // idempotent; status "saved"; router.push(`/lectures/${lectureId}`) shows the saved view
```

### Plan study around a calendar

```ts
import { planStudy } from "@/lib/scheduler/plan";      // pure
const out = planStudy({ now, window, courses, events, existing, locked, prefs });
// out.blocks is the full desired set for the window; out.added/removed/moved are keys; commands diff and write in one transaction
```

### Verification hook

```tsx
import T from "@/lib/testids.json";
<button data-testid={T.today.start}>Start session</button>
// scripts/e2e/steps/today.mjs: await page.getByTestId(T.today.start).click();
```

## Module map

Owner column: **F** foundation, then one of Today, Calendar, Sessions, Lectures, Practice, Guides, Materials. A file has exactly one owner. Foundation files are frozen when features start; a feature that needs a change to a foundation file records it in `docs/decisions.tsv` and the integrator applies it at merge.

```
app/
  layout.tsx                                   F   fonts, globals.css, <Providers> (TooltipProvider, SourceViewer, LectureRecorder), isolate wrapper
  globals.css                                  F   @import tailwindcss + shadcn base-nova; Cue OKLCH tokens; weights 420/500; sizes 13/20 (+12/15/32 for Today)
  (browse)/layout.tsx                          F   SidebarProvider + AppSidebar + SidebarInset
  (browse)/page.tsx                            Today
  (browse)/calendar/page.tsx                   Calendar
  (browse)/sessions/page.tsx                   Sessions     index: upcoming blocks, past sessions
  (browse)/lectures/page.tsx                   Lectures     index: lectures by course, "Record now"
  (browse)/practice/page.tsx                   F→Practice   index + intake (ported), Practice extends
  (browse)/guides/page.tsx                     Guides       redirects to last course's last section
  (browse)/guides/[courseId]/page.tsx          Guides       redirects to first/last-read section
  (browse)/guides/[courseId]/[sectionId]/page.tsx  Guides
  (focus)/layout.tsx                           F   FocusFrame (no docked sidebar) + NavSheet on Cmd/Ctrl+B
  (focus)/sessions/[sessionId]/page.tsx        Sessions
  (focus)/lectures/[lectureId]/page.tsx        Lectures     live note taker or saved view, by lecture.status
  (focus)/practice/[setId]/page.tsx            F→Practice   ported screen; Practice adds ask column, resources, generation
  api/ai/[role]/route.ts                       F   the one AI route: validate with ROLES[role].input, runRole, JSON or NDJSON
  api/spend/route.ts                           F   GET status
  api/health/route.ts                          F   GET { provider, mock } for the harness
components/
  ui/*                                         F   shadcn base-nova output plus Cue variants (Button chip/icon-sm, Badge course/today). Never edited by features
  shell/{app-sidebar,app-nav,nav-items,mascot,focus-frame,nav-sheet,providers,spend-line}.tsx   F
  shared/{section-label,course-chip,transcript-line,composer,chat-thread,source-chip,source-sheet,
          budget-notice,empty-state,skeletons,time-text}.tsx                                      F
  today/*                                      Today
  calendar/*                                   Calendar     week/day/month grids, popovers, import dialog, now line
  sessions/*                                   Sessions     plan list, timer, material viewer (slides/transcript/textbook), check row
  lectures/*                                   Lectures     live transcript, related list, saved view
  practice/{practice-screen,option-row,navigator,solution-panel,intake}.tsx   F (ported)
  practice/{ask-column,resources,generate-dialog}.tsx                         Practice
  guides/*                                     Guides       contents nav, blocks, GuideChart (SVG), print stylesheet
  materials/{add-material-dialog,ingest-progress,materials-list}.tsx   Materials
lib/
  domain/*.ts                                  F   the entity types in types.ts, split by area; no logic
  refs.ts                                      F   describeRef, formatClock, hrefForRef
  db/{schema,index}.ts                         F   Dexie class, DB_SCHEMA_V1, resetDb, client-only
  retrieval/{index,lexical,vector,chunk,citations}.ts   F
  ai/{registry,run,provider,spend,spend-store-file,spend-store-upstash,stream,client,errors}.ts  F
  ai/roles/<role>.ts  (15 files)               F writes each with schemas, draft prompt, mock, fixture; after foundation the
                                                   feature that calls the role owns its file (table in §Workstreams)
  chat/use-chat.ts                             F
  pages.ts                                     F   existing renderPages/cropFigure, Blob output instead of data URLs
  testids.json                                 F
  sample/{semester,courses,calendar,materials,lecture-transcript,practice,guide}.ts   F
  scheduler/{plan,rules,lanes,commands}.ts     Calendar  (foundation ships stubs with the signatures)
  calendar/{ics,import,commands,format}.ts     Calendar
  sessions/{commands,planner,timer}.ts         Sessions
  lectures/{recorder,recorder-provider,engine,engines/parakeet,engines/parakeet.worker,engines/demo,audio-cut,commands,links}.ts   Lectures (stubs at F for recorder-provider and engine)
  practice/{commands,reducer,build-exam}.ts    F (ported); practice/generate.ts  Practice
  guides/{commands,outline,generate,print}.ts  Guides
  materials/{commands,ingest,embed}.ts         Materials (stubs at F)
scripts/
  e2e/walkthrough.mjs                          F   runner: build, start, mock clock, seed, run every step module
  e2e/steps/{shell,today,calendar,sessions,lectures,practice,guides,materials}.mjs   one per feature (shell: F)
  e2e/fixtures/{sample-quiz.pdf,timetable.ics,timetable.png,slides.pdf,lecture.wav}  F + features
  check-nemotron.mjs                           F   iterates ROLES; calls each with its fixture; validates with its output schema
  check-tokens.mjs                             F   no hex/rgb/hsl in app, components, lib; no imports that bypass components/ui
```

Removed from the current app: `components/App.tsx` (phase machine), `lib/session.ts` load/save/clear (localStorage), `lib/client.ts` (folded into `lib/ai/client.ts` and `lib/practice/commands.ts`), `components/icons.tsx` (lucide), `components/Credit.tsx` (becomes `shell/spend-line`), the three `app/api/*` routes (one route), `app/page.tsx` with `ssr: false` (only client islands are client-only now).

## Data model

Local-first. Every entity the student creates lives in IndexedDB (Dexie 4, database `cue`, version 1). The server holds exactly one durable thing, the spend ledger, because it is the only state that must be shared across every browser and every serverless instance. Why not a server DB for the rest: there are no accounts to key rows on, the demo must work on a fresh browser with no backend state, materials are up to tens of MB of page images and audio that would cost upload time and storage for no product gain, and Vercel's 4.5 MB body limit already forces AI context to travel per request anyway.

| Table | Entity | Key | Written only by | Read by |
| --- | --- | --- | --- | --- |
| courses | Course | id | calendar import, sample seed | all |
| events | CalendarEvent | id | calendar import, sample seed | Today, Calendar, Scheduler, Lectures, flagHints |
| blocks | StudyBlock | id, unique `key` | scheduler commands, sample seed | Today, Calendar, Sessions |
| sessions | StudySession | id | sessions commands | Today, Calendar, Sessions, nav badge |
| materials, pages, chunks | Material, MaterialPage, Chunk | id / [materialId+page] / id | materials commands, sample seed; `chunks` also by lectures (transcript chunks) | retrieval, SourceSheet, Sessions viewer, Guides |
| lectures, transcript, audio, links, notes | Lecture… | id / id / [lectureId+seq] / id / lectureId | lectures commands (via the recorder) | Today, Calendar, Sessions (moments), Lectures, nav badge |
| sets, questions, attempts, solutions, figures | Practice… | id / id / questionId… | practice commands | Practice, Today ("+12 practice Qs"), Guides (quiz) |
| chats | ChatThread | id, unique `scopeKey` | `useChat` | every ask panel, saved notes "Your questions" |
| guides, sections | Guide, GuideSection | id / id | guides commands | Guides, Lectures related links |
| settings | Setting | key | each feature writes its own key | same |

Transcript chunks are the one case of two writers on a table (`chunks`): materials writes `materialId` rows, lectures writes `lectureId` rows. The rows are disjoint by construction and each writer only deletes its own, so the question "what happens if both write?" has the answer "nothing".

Blobs (page JPEGs, figure crops, WAV audio) are stored as `Blob` values, never data URLs. Dexie structured-clones them; a 30-page scan is about 6 MB, a 50-minute lecture at 16 kHz mono is about 96 MB, both inside the browser's default quota.

Indexes come from the dominant access patterns traced in the sketch: Today and Calendar range on `blocks.start` and `events.start`; Sessions looks up `sessions.blockId`; the recorder appends by `[lectureId+seq]`; retrieval filters `chunks` by `courseId`, then `materialId` or `lectureId`; Practice orders by `[setId+order]`; nav badges query `lectures.status` and `sessions.timer.status`. No access pattern needs a map built in memory.

Encoded invariants: ids are branded, times are branded epoch numbers, `StudyBlock` has no status field (state is derived from `StudySession` and the clock), `TranscriptLine.final` plus the unique live line, `Resource.label` is computed once so the UI never formats a ref twice. `blocks.key` is unique so a re-plan cannot duplicate a block.

## State machines

| Entity | States | Transitions | Writer |
| --- | --- | --- | --- |
| Material.status | queued → rendering(page/pages) → reading(done/total) → indexing → ready; any → error; error → queued | `ingest()` writes each step; retry restarts from the first unfinished page (pages already read are kept) | Materials |
| StudySession.timer | running ⇄ paused → ended | `startSession` (running), `pauseSession`, `resumeSession`, `endSession`; elapsed = accumulated + (now − runningSince), so reload loses nothing | Sessions |
| Block state (derived) | upcoming, next, in_progress, done, missed | `blockState(block, session, now)`: session with running/paused timer → in_progress; ended → done; no session and end < now → missed; else next/upcoming | nobody |
| Lecture.status | idle → starting → recording ⇄ paused → saving → saved; starting/recording/paused → error; error → starting; saved → recording | the recorder; `endAndSave` is idempotent | Lectures |
| TranscriptLine | partial (final: false, one per lecture) → final | engine `chunk` event replaces the live line with final lines and opens a new live line | Lectures |
| Attempt | unanswered → checking → answered; unanswered → answered | `choose` (answered if a key exists, else checking); `requestSolution` resolves checking | Practice |
| Solution | loading → ready / error → loading | `requestSolution`; the solve queue is 3 in flight, prefetch only the current and next | Practice |
| GuideSection.status | pending → writing → ready; ready → stale → writing; writing → error → writing | `writeSection`; `markStale` from Materials after a new material is ready | Guides |
| ChatMessage.status | streaming → done / error | `useChat`; on reload any `streaming` message becomes `error` with kind "cancelled" so nothing hangs | foundation |
| AI request (server) | reserved → settled; reserved → expired after 10 min | `reserve` per upstream attempt; `settle` once; TTL guards a crash | foundation |

## Scheduler

`planStudy(input): SchedulerOutput` in `lib/scheduler/plan.ts` is pure: no clock, no DB, no randomness. The command around it reads events, blocks, sessions and prefs, calls it for a window (today → +14 days), diffs by `key` and writes the diff in one Dexie transaction. "Reschedule" calls `nextFreeSlot` with the same input and writes one block.

Inputs: `now`, the window, courses, fixed events (lectures, deadlines, exams, including anchors up to 7 days past the window so prep series are complete), existing blocks, the set of locked block ids (any block with a session), prefs (day start 8:00, day end 22:00, 240 min/day max, review lengths 45/30/90, hours and prep sessions by deadline weight, 15 min gap after a lecture). Output: the full desired block set with `added`, `removed`, `moved` keys and `unplaced` reasons.

Rules in order (earlier rules take the better slots):

1. After-lecture review, 45 min, the same day if a 45-minute gap exists at least 15 min after the lecture, else the next day's first free slot after 9:00. Topic = the lecture's topic, title `Review · {topic}`, reason `after-lecture`, materials = that lecture's slides, transcript and handouts.
2. Test-prep series: N sessions by weight (2/4/6) across the 7 days before an exam, one per day, 60–120 min, titled `{Test} prep · i of N`, the last on the eve with note `Past paper, timed`.
3. Work blocks before a deadline: hours by weight (2/4/6) spread over the 3 days before it, evenings first, the last on the eve titled `{item} final push`, reason `deadline` with `dueAt`.
4. Mid-week review per course, 30 min, Wed or Thu, title `Mid-week · {SHORT}`.
5. End-of-week review, Saturday 11:00–12:30, all courses.

Placement never overlaps an event or a block (touching is allowed), stays inside the day window, respects the daily maximum, prefers the earliest slot after the anchor and falls back day by day. Keys are deterministic (`review:evt_csc148_l8:1`, `prep:evt_mat137_t2:1/4`), so re-running on the same inputs is a no-op, a locked block keeps its id, and an import that adds a course only adds blocks. Lane layout for overlapping imported events is a second pure function, `layoutLanes`, used by the week and day grids.

The sample semester does not run the scheduler. Its blocks are hand-authored to match the Paper screens exactly; the scheduler runs on imports, on "Reschedule" and on "Plan more time", and the Calendar walkthrough step proves it on the `.ics` fixture.

## Retrieval

Chunking happens at ingest and is stored: slides one chunk per slide (`ref: slide`), textbook/handout/notes about 400 tokens per window with 60 overlap inside one page (`ref: page` with the running section), transcripts 60-second windows over final lines (`ref: transcript` at the window start). Each chunk keeps a lowercased token array for the lexical ranker.

`retrieve(query)` runs in the browser: a BM25-style lexical score over the scoped chunks always; when the chunks carry embeddings and the `embed` role answers within 2 s, a cosine pass over the stored 1024-dim vectors (Qwen3-Embedding-8B, `dimensions: 1024`, query prefixed `Instruct: … Query:`), merged by reciprocal rank fusion; top 8 by default. Embeddings are a background pass per course (`embedCourse`, batches of 32, about $0.00001 per batch) and never block ingest. An embed failure, no key, or the cap being hit all degrade to lexical silently, which is also what makes mock mode and the walkthrough deterministic: the mock `embed` returns a 256-dim feature-hash vector, so the vector path still runs.

Citations: `toContext` numbers the hits `[1]…[k]`; prompts ask the model to cite numbers; `extractCitations` maps `[n]` in the finished answer to `Resource`s in first-mention order. Source chips, practice resource rows and guide footnotes all render `Resource.label`. Label wording lives in `describeRef` only: `Slide 17`, `Lecture 8 slides · Slide 17`, `Transcript 41:05`, `Lecture 7 at 4:15`, `Textbook ch. 5, p. 92`, `Textbook Figure 5-1`, `Lecture 7 slides 6–8`, `A2 handout §3`, `Used in Problem Set 4, Q1`. Guide footnotes join sources with `. ` and end with `.`.

Context size is capped at 24k characters so an ask body stays far under Vercel's 4.5 MB limit even with the 12-message history.

## AI layer

One registry, `ROLES: Record<RoleName, RoleSpec>`, fifteen roles, each a file in `lib/ai/roles/`. A role is: model key, thinking on/off, max tokens, temperature, a zod `input` schema, a zod `output` schema, a `prompt(input)` builder, a `mock(input)` and a `fixture`. Three things derive from the output schema so they cannot drift: the `response_format` JSON schema (`z.toJSONSchema`), the parse of the model's reply, and the TypeScript types the client sees (`RoleInput<R>`, `RoleOutput<R>`). The compiler rejects a registry that misses a role.

| Role | Model | Thinking | Output | Caller |
| --- | --- | --- | --- | --- |
| parseExam | Super VL | off | json | Practice intake (existing parse) |
| parseDocument | Super VL | off | json | Materials ingest |
| parseCalendar | Super VL | off | json, strict, day enum + HH:MM | Calendar import |
| brief | Ultra | off | json {headline, subline} | Today (rule-based text first, swap when it returns) |
| planSession | Ultra | on | json SessionPlan | Sessions (rules fallback) |
| solve | Ultra | on | json Solution with resources | Practice |
| generateQuestions | Ultra | on | json questions; each then solved with Ultra off, disagreements dropped | Practice |
| askQuick | Ultra | off | stream | every ask panel, live-lecture composer |
| askDeep | Ultra | on | stream with thinking events | ask panels with the Deep toggle |
| cleanTranscript | Lightning | off | json lines | Lectures recorder, per chunk |
| flagHints | Lightning | off | json hints + links | Lectures recorder, rolling 60 s window |
| lectureNotes | Ultra | off | json summary, key points, hints | Lectures end-and-save |
| writeGuideOutline | Ultra | on | json chapters/sections | Guides |
| writeGuideSection | Ultra | off | json blocks + footnotes | Guides, per section |
| embed | Qwen3-Embedding-8B | n/a | Float32Array[] | retrieval, embedCourse |

Super 120B and Nano do not exist in `ModelKey`, so they cannot be selected.

Transport: `POST /api/ai/[role]`. The route looks the role up, validates the body with `ROLES[role].input` (400 `unreadable` on failure), calls `runRole`, and returns JSON for json/embedding roles or an NDJSON stream for stream roles. `runRole` (server-only) builds the request from the role and the provider config, turns thinking off with the provider's switch, restates the schema in the system prompt when thinking is on (measured: constrained output without it answers the first enum value), reserves the worst case, runs the call with SDK retries disabled and its own loop (429 and 5xx, two retries, each attempt its own reservation so a timed-out attempt is still counted), settles to usage, parses JSON output with the role's schema and retries once with the validation error appended before failing with `empty_output`. Streams read usage from the final chunk with empty `choices`.

Stream protocol (NDJSON, encoded and decoded in `lib/ai/stream.ts` only): `thinking`, `delta`, `done {usage}`, `error {ApiError}`. The client reconstructs the message; sources are derived client-side from citations after `done`, so the server never needs the chunk table.

Errors: one `ApiError { kind, message }` with kinds `missing_key, rate_limited, unreadable, no_questions, too_large, budget, empty_output, cancelled, offline, upstream`; HTTP mapping is in `lib/ai/errors.ts` only. `budget` is HTTP 402 and every ask panel shows the shared `BudgetNotice` (copy from the specs) and disables its composer; `GET /api/spend` feeds the sidebar footer line.

Spend: `lib/ai/spend.ts` keeps the current reserve-then-settle logic and price table (now keyed by `ModelKey`, with embed at $0.01/M, images at 3,400 tokens, and the OpenRouter `:free` models priced [0, 0] so every call passes through one ledger and the "cap only covers Token Factory" branch disappears). `SPEND_CAP_USD` is parsed as a positive finite number at startup or the server refuses to start. The ledger is a `SpendStore` port with two adapters: `FileSpendStore` for local dev (`.data/spend-ledger.json`, promise-serialized, as today, but a corrupt file fails closed) and `UpstashSpendStore` for Vercel, where one Lua `EVAL` reads spent, sums live holds, checks the cap and writes the hold atomically, and settle is `HDEL` + `INCRBYFLOAT` (non-atomic between the two is safe: a lingering hold only over-counts until its TTL). The adapter is chosen by `UPSTASH_REDIS_REST_URL`.

Mock mode is unchanged in spirit: no key outside production routes every role to its `mock`, deterministic and aligned with the sample semester, with the same latencies the walkthrough expects. `api/health` reports it so the harness can refuse to run a live check against mocks.

Cancellation: the route passes `req.signal` through to the SDK so a cancelled ask stops the upstream call, and the client's `AbortSignal` reaches the route.

## Routes

Pages (App Router, one root layout, two route groups):

| URL | Group | Screen | Notes |
| --- | --- | --- | --- |
| `/` | browse | Today | "Try the sample semester" when `settings.sample` is absent |
| `/calendar?view=week\|day\|month&date=YYYY-MM-DD` | browse | Calendar | view and date in the URL so reload and back work |
| `/sessions` | browse | Sessions index | upcoming blocks with Start, past sessions |
| `/sessions/[sessionId]` | focus | Study session | opened by `startSession`; preview mode when the block is in the future |
| `/lectures` | browse | Lectures index | by course; "Record now" creates an ad-hoc lecture |
| `/lectures/[lectureId]` | focus | Note taker or saved notes | one route; `lecture.status` picks the view |
| `/practice` | browse | Practice index + intake | sets by course; drop zone |
| `/practice/[setId]?q=&topic=` | focus | Practice | ported screen; `Esc` leaves |
| `/guides` → `/guides/[courseId]` → `/guides/[courseId]/[sectionId]` | browse | Study guide | redirects land on the last-read section |

API: `POST /api/ai/[role]` (JSON or NDJSON), `GET /api/spend`, `GET /api/health`. No audio route: transcription is in the browser. No materials route: files never leave the browser except as rendered page images inside a `parse*` role call.

Navigation from a `SourceRef` (`hrefForRef`): questions go to `/practice/[setId]?q=`, events to `/calendar?view=day&date=`, web to a new tab; slides, pages and transcript moments open in the `SourceSheet` over the current screen so Practice and Session state survive.

## Shell

Two tiers, per `docs/design/today.md` §7. `(browse)/layout.tsx` wraps pages in `SidebarProvider` with `--sidebar-width: 232px`, the docked `AppSidebar` (wordmark, mascot, six nav items from `NAV_ITEMS`, footer with the spend line) and `SidebarInset`. `(focus)/layout.tsx` renders `FocusFrame` (padding 28/40/32, 100dvh, no page scroll) and a `NavSheet` (232 wide, left) that `Cmd/Ctrl+B` opens; both layouts render the same `AppNav`. The root layout holds the providers that must outlive route changes: `TooltipProvider`, `SourceViewerProvider` (the SourceSheet), `LectureRecorderProvider` (the live engine, so leaving a focus screen never stops a recording). Nav badges are not provider state: the Lecture notes item shows `Recording` when a `lectures` row is recording/paused and the Study sessions item shows the remaining time when a `sessions` row is running, both via `useLiveQuery`, so there is no second copy of "what is live".

Responsive follows the specs: docked at ≥1024, icon rail 768–1023, off-canvas Sheet below 768, driven by one `(min-width)` query, `defaultOpen` on the client with no server cookie read (keeps every route static-capable and `cacheComponents` off).

Tokens: the Paper hex values become OKLCH on `:root` (`--page`, `--ink`, `--graphite`, `--rule`, `--wash`, `--fill`, `--border`, `--control`, `--ink-hover`, `--guide`) mapped in `@theme inline` to the shadcn variables (`--background`, `--foreground`, `--muted-foreground`, `--border`→rule, `--input`→border, `--secondary`→control, `--muted`→fill, `--accent`→wash, `--primary`→ink) and to Tailwind utilities (`bg-control`, `text-graphite`). `--radius: 10px` so `rounded-sm` is the Paper 6; `--radius-xs: 4px` added. Weights `--font-weight-normal: 420`, `--font-weight-medium: 500`. Sizes 13 and 20 with the Today extras 12, 15, 32.

Keyboard: single-letter shortcuts exist only on focus screens, only when focus is outside a text field, declared with `aria-keyshortcuts`, and scoped to the screen's root element (not `window`), which fixes the shell collision in fragile item 13.

## Workstream partition with file ownership

Foundation runs first and alone. It ends when `pnpm typecheck && pnpm lint && pnpm build` pass, the walkthrough runner seeds the sample semester and completes the `shell` and the ported `practice` steps, and every other step module exists as a stub that passes trivially. Internal order inside foundation, so a slip is visible early: toolchain (Tailwind 4 loader, shadcn init base-nova, ESLint with the TS6 alias, `use-mobile` fix) → tokens and fonts → `lib/domain` + `lib/db` → `lib/refs` + retrieval → AI layer with all 15 role files (schemas, prompts drafted from the measured probes, mocks, fixtures) + spend stores → shell layouts and shared components → sample semester → Practice port → e2e runner, testids, check scripts.

| Workstream | Owns (exclusively) | Role files owned after foundation | Reads from others (signatures only) |
| --- | --- | --- | --- |
| Foundation | everything marked F in the module map; stubs for `lib/scheduler/*`, `lib/lectures/recorder-provider.tsx`, `lib/lectures/engine.ts`, `lib/materials/*` | all 15 at creation | — |
| Today | `app/(browse)/page.tsx`, `components/today/*`, `scripts/e2e/steps/today.mjs` | `brief` | `startSession`, `rescheduleBlock`, `openLectureForEvent` |
| Calendar | `app/(browse)/calendar/*`, `components/calendar/*`, `lib/calendar/*`, `lib/scheduler/*`, `steps/calendar.mjs`, fixtures `timetable.ics`, `timetable.png` | `parseCalendar` | `startSession`, `markBlockDone`, `openLectureForEvent` |
| Sessions | `app/(browse)/sessions/*`, `app/(focus)/sessions/*`, `components/sessions/*`, `lib/sessions/*`, `steps/sessions.mjs` | `planSession` | `retrieve`, `useChat`, `createSetFromQuestions`, `addAnswerToGuide` |
| Lectures | `app/(browse)/lectures/*`, `app/(focus)/lectures/*`, `components/lectures/*`, `lib/lectures/*` (fills the stubs), `steps/lectures.mjs`, fixture `lecture.wav` | `cleanTranscript`, `flagHints`, `lectureNotes` | `retrieve` (for links), `useChat`, `chunkTranscript`, `startSession` ("Review now") |
| Practice | `components/practice/{ask-column,resources,generate-dialog}.tsx`, `lib/practice/generate.ts`, `steps/practice.mjs`; extends the ported `practice-screen.tsx` and `lib/practice/commands.ts` (ownership moves to Practice at hand-off) | `parseExam`, `solve`, `generateQuestions`, `askQuick`, `askDeep` | `retrieve`, `useChat` |
| Guides | `app/(browse)/guides/*`, `components/guides/*`, `lib/guides/*`, `steps/guides.mjs` | `writeGuideOutline`, `writeGuideSection` | `retrieve`, `useChat`, `createSetFromQuestions` |
| Materials | `components/materials/*`, `lib/materials/*` (fills the stubs), `steps/materials.mjs`, fixture `slides.pdf` | `parseDocument`, `embed` | `chunkMaterial`, `markStale`, `renderPages` |

Rules that keep merges clean: a feature never edits `components/ui`, `lib/db`, `lib/domain`, `lib/refs.ts`, `lib/ai/{registry,run,provider,spend,stream,client,errors}.ts`, `lib/sample/*`, `lib/testids.json`, the layouts or `scripts/e2e/walkthrough.mjs`. A feature that needs a new test id, a new shadcn variant, a new DB index or a new role field writes a one-line row in `docs/decisions.tsv` and keeps a local workaround; the integrator applies the shared change in the merge commit. Cross-feature calls go only through the command signatures in `types.ts` §16; a stub throws until merge, and the walkthrough steps that cross a boundary (Today's Reschedule, Calendar's Take notes, Guide's Quiz me) are tagged `after-merge` in their step module and skipped until the integration run.

Merge order: Materials, Calendar, Sessions, Lectures, Practice, Guides, Today (Today last because it reads everything and writes nothing).

## Verification plan

`scripts/e2e/walkthrough.mjs` (Playwright 1.64, Chromium from Playwright's own install, no keys so mocks are on): `pnpm build`, `next start` on a free port, `GET /api/health` must report `mock: true`, launch with the fake-mic flags and `lecture.wav`, `page.clock.install({ time: <Tuesday of the current week, 10:12 local> })`, go to `/`, click `T.today.loadSample`, then run every step module in order at 1440×900, then the responsive subset at 375×812. A step is a list of assertions on roles, labels and `data-testid`s; no class names, no native-select calls, no localStorage. Console errors fail the run. Screenshots per step go to `.verify/run-<ts>/` for the Paper judge.

| Step | Main path proved |
| --- | --- |
| shell (F) | six nav links with the right hrefs and icons; active item has `aria-current="page"`; focus route hides the docked sidebar; `Cmd+B` opens the NavSheet; spend line reads `$0.00 of $30`; wordmark links home |
| today | headline matches `/^\w+ sessions? today\./`; subline present; next-up card has a course chip, meta `Next up · 10:30–11:15am · …`, three material chips, `+ 12 practice Qs`; four timeline rows with the drawn times and trailing texts; `Transcript ready` on the past lecture; Start session → `/sessions/<id>`; after-merge: Reschedule moves a missed row and shows the new time |
| calendar | week shows the 25 drawn items (lectures, study blocks, deadline chips), `Review · Recursion` has ` · now`; Select switches day/month and the URL updates; Today returns; arrows move one period; a block opens a Popover with Start session and Mark done; Mark done flips the block to `· done`; Add schedule → drop `timetable.ics` → preview lists 2 courses → commit → toast `Added 2 courses. Cue planned N study blocks.`; `page.evaluate` over Dexie asserts no planned block overlaps any event; after-merge: lecture Popover → Take notes → `/lectures/<id>` |
| sessions | `/sessions/<id>`: timer reads `31:48 left` after `clock.runFor(13*60+12 s)` from a fresh start; progress width 46px; step 2 is `aria-current="step"`; Next step marks it done and advances; tabs switch and the label changes per tab; the transcript moment opens Transcript at 32:14; composer: send Quick → message streams → source chips appear → `Slide 17` chip opens the Slides tab at 17; toggle Deep → `Thinking…` line appears; `window.fetch` stub returns 402 once → BudgetNotice shows and Send is disabled; End session → AlertDialog → confirm → `/` with the row reading `Done · 45m` |
| lectures | `/lectures/<id>` with engine demo (set in `settings.transcription` by the seed in mock mode): status `Starting…` → Start → `Recording` with the dot; after `clock.runFor(40 s)` ≥ 3 final lines with tnum timestamps and one live line; the `33:20` line is flagged with `Flagged · on Term Test 2`; a related card is emphasized; Pause → `Paused`, button `Resume`; composer send → answer above composer cites `Transcript 33:20`; End and save → `Saving…` → saved view with summary, `Exam hints · 1`, key points, `Full transcript · N lines` collapsible; the fake-mic variant with engine parakeet is tagged `live-only` and runs only with `--live`, not in the gate |
| practice | `/practice` lists the sample set; open → `CSC148 · 2024 Midterm`; key `2` answers Q7 correctly; option B shows `Your answer · correct`, C and D show their why-not notes; solution panel shows labelled steps and three resource rows; a resource row opens the SourceSheet; tiles show 6 correct, 2 missed, current inverted, with `aria-label`s; shadcn Select picks `Big-O & efficiency` and the bar narrows; Ask why focuses the composer; Write questions dialog → 5 → skeleton tiles → tiles 16–20 with the dot; `Esc` returns to `/practice`; drop `sample-quiz.pdf` on the index → parsing progress → new set with 5 questions (the existing harness scenarios, incl. forced 429 then Retry) |
| guides | `/guides/eco101/price-elasticity-of-demand`: contents nav with Elasticity expanded and the current section `aria-current="page"`; formula block with `role="math"`; two `role="img"` charts whose `aria-label`s mention elastic and inelastic; the inelastic chart draws one merged `Q2 Q1` label; callout with the ink border and `will be on the midterm`; four footnotes rendered as `Lecture 7 at 4:15. Textbook ch. 5, p. 92.` etc.; clicking marker 1 focuses footnote 1; course Select → CSC148 opens its last section; Export PDF calls `window.print` (stubbed) with the print stylesheet hiding nav and toolbar; `[`/`]` move sections; after-merge: Quiz me → `/practice/<new set>` with questions whose provenance names the section |
| materials | from `/practice` or `/guides` empty state: Add material → `slides.pdf` as CSC148 slides, Lecture 9 → status goes queued → rendering → reading → ready; `db.chunks` has one chunk per page; a guide section for CSC148 becomes `stale` with `Rewrite`; the SourceSheet opens slide 3 |

`scripts/check-nemotron.mjs` imports `ROLES` (via a tiny TS loader), calls every role with its `fixture` on Token Factory, validates each reply with the role's `output` schema, prints the measured latency and cost, and reports INCONCLUSIVE per role on OpenRouter. `scripts/check-tokens.mjs` scans `app`, `components`, `lib` for hex/rgb/hsl and for imports of `@base-ui/react` or `lucide-react` outside `components/ui` and `components/shell`.

## Shape

Data first. The core types are `SourceRef` (one citation union for every screen), the entity set with one writer per table and no stored status that can be derived, and `RoleSpec` with zod schemas as the single source of wire shape, validation and types. Data flows: upload → `renderPages` → `parse*` role → pages and chunks in IndexedDB; microphone → engine → `cleanTranscript`/`flagHints` → transcript lines and links; a question → `retrieve` → numbered context → `ask*`/`solve`/`writeGuideSection` → an answer whose `[n]` citations become `Resource`s. Every screen reads with `useLiveQuery` and writes through one command module.

Load-bearing decisions and the principle behind each:

- Local-first IndexedDB with one durable server store for spend (per boundary-discipline and separate-before-serializing-shared-state: the only state two actors share is the ledger, and it gets an atomic store).
- One `SourceRef` and one `Resource` label formatter (per encode-lessons-in-structure: a new citation target is a type change, and five screens cannot drift).
- Derived state over stored state for blocks, nav badges and "transcript ready" (per the single-source-of-truth rule: derive instead of sync).
- Zod schemas as the role contract, JSON schema and types derived (per type-system-discipline: parse at the boundary, no hand-written wire types, the drift in fragile item 16 cannot recur).
- One AI route and one stream protocol (per laziness-protocol: the three per-role routes were pass-through shells).
- Pure scheduler with deterministic keys (per make-operations-idempotent and model-the-domain).
- Per-attempt spend reservations with SDK retries off (per fix-root-causes: the uncounted-retries hole is closed in the layer that owns the budget).
- Owners per table and per file, with cross-feature calls only through fixed command signatures (per separate-before-serializing-shared-state applied to the build itself).

Validation lives at four boundaries only: the AI route (role input schema), the AI run (role output schema), `.ics` and image import (`parseCalendar` output and the ics parser), and `renderPages` (file type). Inside, types are trusted.

What the design deliberately does not do: no server database for student data, no accounts, no server-side retrieval index, no per-feature API routes, no Web Speech API, no streaming of guide sections (one JSON call per section with placeholders), no in-memory state store beside Dexie.

Interface depth: the public surface is seven concepts (`db`, `SourceRef`/`describeRef`, `retrieve`, `ai.run`/`ai.stream`, `useChat`, `planStudy`, `TranscriptionEngine`/`LectureRecorder`) plus per-feature command functions. Behind `ai.run` sit provider choice, thinking switches, schema restatement, reservation per attempt, retries, output parsing, mocks and error mapping; the caller sees a typed promise. Behind `useChat` sit retrieval wiring, streaming, citation extraction, persistence and the budget state. Behind `retrieve` sit two rankers, fusion, embedding fallback and the body-size cap. What stays exposed on purpose: Dexie tables for reads (a repository layer would be pass-through), and `ChatScope` because each panel really does scope differently.

Red-flag screen: no per-role routes (pass-through); no repository layer (pass-through); `lib/db` is `client-only` and `lib/ai/run` is `server-only` so wrong imports fail the build (importable internals); `NAV_ITEMS`, `testids.json`, `DB_SCHEMA_V1`, `ROLES` are each the one list their consumers derive from (hand-synced list); one composer, one transcript line, one chat hook, one clock (two ways to do one task); block placement and block status are in different tables with different writers (split ownership).

## Synthesis decision

Filled in by arena after the candidates are compared.

## Tradeoffs accepted

- We accept that every AI request carries its retrieved context (up to 24k chars) in exchange for a stateless server and a fresh-browser demo. A server index would cut bytes per call but needs identity and upload we do not have.
- We accept lexical-first retrieval with embeddings as an optional second ranker in exchange for a deterministic walkthrough and a working app when the cap is hit; recall on paraphrased questions is lower than vector-only until `embedCourse` has run.
- We accept a large foundation unit (toolchain, shell, db, all 15 role files, sample data, Practice port, e2e runner) in exchange for feature workstreams that never touch a shared file. The internal order above makes its progress visible.
- We accept hand-authored sample blocks that the scheduler did not produce in exchange for pixel-faithful Today and Calendar screens; the scheduler is proved on the `.ics` fixture instead.
- We accept Upstash Redis as a second infrastructure dependency on Vercel in exchange for an atomic reserve in one Lua call; the file store remains for local dev, so nothing changes for the demo laptop.
- We accept one JSON call per guide section (8–20 s with placeholders) instead of streaming Markdown in exchange for structured blocks, charts as data and footnotes that are refs, which the spec needs and Markdown cannot carry.
- We accept SDK retries off and our own two-retry loop in exchange for a reservation per upstream attempt; a transient 5xx costs one extra round trip of latency.
- We accept storing `Resource.label` beside `ref` (two fields for one fact) in exchange for rendering that needs no lookup and citations that survive the deletion of their source.
- We accept that `StudyBlock` has no status column, so "done" needs a join with `sessions`, in exchange for one writer per table and no status that can go stale.

## Alternatives considered

- **Server database (Neon/Postgres) for all entities, browser as a cache.** Hides sync from screens and lets the server retrieve. Exposes to callers a device id or account to key rows, an upload step before anything works, and a second copy of every entity to keep consistent. Lost on the no-accounts constraint and the fresh-browser demo; the only server state that needs sharing is the ledger.
- **Per-feature API routes with per-feature prompts in `app/api/<feature>/`.** Hides nothing the single route does not; exposes error mapping, validation, streaming and spend to seven copies that drift. The current three routes are already identical shells. Lost on pass-through.
- **Streamed Markdown for guide sections, rendered with a Markdown component.** Simpler server and visible progress sooner. Exposes to the guide screen the job of recovering formula, figure, callout and footnote structure from text, and loses charts as data. Lost on the spec's block model.
- **A `status` column on StudyBlock written by the scheduler and by sessions.** Simpler reads. Exposes two writers to one row, which is exactly the split-ownership flag; a re-plan could overwrite "done". Lost.
- **Server-side transcription (sherpa-onnx Parakeet TDT in a Node route), as `transcription.md` recommended first.** Better accuracy and punctuation for free, but a 661 MB model does not fit a Vercel function, and the task fixes browser Parakeet; it stays available as a third `TranscriptionEngine` for a VM deploy because the interface is engine-agnostic.
- **A global in-memory store (Zustand) mirroring the DB for speed.** Exposes a second source of truth and the sync between them. `useLiveQuery` makes it unnecessary; Dexie reads of a few hundred rows are sub-millisecond.

## Open questions and risks

1. Vercel ledger store: Upstash Redis (one Lua call, marketplace install) or Neon Postgres (needs the WebSocket driver for an interactive transaction with an advisory lock)? The port is the same; which integration does the operator prefer to provision?
2. The Study session mode switch is drawn `Quick · Nano` / `Deep · Ultra`, but decisions row 10 puts both modes on Ultra. Label them `Quick` and `Deep · thinking` with the model in a tooltip, or keep the model name visible for the judges?
3. Pomodoro structure: are breaks planner-inserted `break` steps after about 25 minutes of work (this sketch), or a fixed 25/5 cycle independent of the plan?
4. Parakeet in the browser needs a 454 MB model download before the first recording. Should the note taker prefetch it when a lecture is within an hour, and is the q4f16 variant on WebGPU acceptable on the demo laptop? The spike is still unapproved.
5. Study guide is drawn without a sidebar but treated as a browse screen here, which shrinks the chapter column to about 840 and makes the chart fluid. Confirm, or make it a focus screen with an exit?
6. Month view hides lectures as drawn. Keep that for imported calendars too?
7. Risk: Dexie 4 with React 19 and `dexie-react-hooks` is believed compatible but was not probed; a one-hour probe in the foundation's first step retires it.
8. Risk: `next build` with stale route types after moving the pages (`rm -rf .next` is in the runner for this reason).
9. Risk: the demo engine replays the sample lecture, so the live gate never exercises the microphone path headlessly; the fake-mic Parakeet run is `live-only`. Is that acceptable for the hackathon gate?

## Next implementation step

Write `lib/domain/*.ts` and `lib/db/schema.ts` from `types.ts` §1–11, then `lib/ai/registry.ts` with the fifteen role files carrying only schemas, fixtures and mocks, and get `pnpm typecheck` green against the stubs before any screen is touched.
