# Current app: cue-practice

A map of the code as of commit `828cf76`, the last of 8 commits on `main` ("Call Nemotron on Token Factory with a hard $30 spending cap"). It is written for the engineers who will grow this into the full Cue app described in `docs/plan.md`.

The app does one job. A student drops in a past exam (PDF or images). A vision model turns it into multiple-choice questions. The student answers them one at a time, gets a worked solution, and can ask follow-up questions.

Stack: Next.js 16.4.3 (App Router, Turbopack), React 19.3, TypeScript 7, zod 4, `openai` SDK 7 (used as a generic OpenAI-compatible client), `pdfjs-dist` 6. No Tailwind, no component library, no lint, no unit tests. Scripts: `dev`, `build`, `start`, `typecheck`.

## 1. Module map

| File | What it does |
| --- | --- |
| `app/layout.tsx` | Root layout: loads the local Timeless Sans font as `--font-sans`, sets title "Cue Practice" and a light-only viewport. |
| `app/page.tsx` | Client page that loads `components/App` with `ssr: false`, because the app reads localStorage on first render and renders PDFs on canvas. |
| `app/globals.css` | All styling: 8 color tokens plus type, radius and easing tokens, then hand-written class rules for every component and one 720px breakpoint. |
| `app/fonts/TimelessSans-{Regular,Medium}.ttf` | The two font files; Regular covers weights 400 to 499 so Paper's 420 body weight resolves to it. |
| `app/api/parse/route.ts` | POST, validates one chunk of up to 3 rendered pages with zod and returns the parsed questions and answer-key entries. |
| `app/api/solve/route.ts` | POST, validates one question and returns a worked `Solution` as JSON. |
| `app/api/ask/route.ts` | POST, validates a question plus chat history and streams the tutor's reply as `text/plain`. |
| `components/App.tsx` | Top-level state machine (`idle`, `reading`, `parsing`, `ready`, `error`) that runs the intake pipeline and switches between Intake and Practice. |
| `components/Intake.tsx` | Upload screen: drop zone, file picker, progress bar, and per-error-kind recovery copy with Retry. |
| `components/Practice.tsx` | Practice screen: owns the session reducer, keyboard shortcuts, solution prefetch, option rows, the worked-solution panel and the bottom bar. |
| `components/AskChat.tsx` | The "Ask why" panel: suggestion rows, chat log and input; streams replies from `/api/ask` into the session. |
| `components/Navigator.tsx` | Bottom-bar question tiles grouped by topic, with scroll-edge fade masks and current/correct/missed states. |
| `components/Prose.tsx` | Tiny Markdown renderer for paragraphs, fenced code, inline code and bold, which is all the parser emits. |
| `components/Credit.tsx` | Static line crediting the three Nemotron models, shown on the intake screen. |
| `components/icons.tsx` | Two inline SVG chevrons. |
| `lib/types.ts` | Domain types, UI state unions, error kinds and the wire request/response shapes. |
| `lib/schema.ts` | zod schemas for every route body and for model output, plus `extractJson`, label normalization and the bare-code fencing heuristic. |
| `lib/llm.ts` | The provider layer: picks Token Factory or OpenRouter, holds the three system prompts, makes the calls, wraps paid calls in the spend cap, and maps errors to HTTP. |
| `lib/spend.ts` | Hard USD spending cap: a reserve-then-settle ledger in `.data/spend-ledger.json`, priced per model. |
| `lib/mock.ts` | Deterministic fake parse, solve and ask results, matched to `.verify/sample-quiz.pdf`, used when no API key is set outside production. |
| `lib/client.ts` | Browser-side fetch helpers: chunking pages under the body limit, parsing chunks 3 at a time, a 3-slot solve queue, and the ask stream reader. |
| `lib/pages.ts` | Browser-side rendering of PDF pages and images to JPEG data URLs plus text layer, and cropping of figure boxes. |
| `lib/session.ts` | The `Session` model, the pure reducer for practice actions, exam assembly from parse results, and localStorage load/save. |
| `next.config.ts` | Only turns off the dev indicator. |
| `.env.example` | Documents `NEBIUS_API_KEY`, `SPEND_CAP_USD=30`, `LLM_API_KEY` and `LLM_BASE_URL`. |
| `.data/spend-ledger.json` | The live spend ledger (gitignored). Today: $0.030 over 17 calls, no open holds. |
| `.verify/harness/*.mjs` | Playwright scripts for the end-to-end check, Paper fidelity screenshots, layout measurement, the sample PDF and live checks (gitignored, see section 7). |

`docs/design/*.md` and `scripts/fixtures/` (lecture audio and transcript) are untracked inputs for later phases. No app code reads them.

## 2. Data flow: parse -> practice -> solve -> ask

```
Browser                                              Server (Node route)            Model
-------                                              -------------------            -----
files --renderPages--> PageInput[] (JPEG + text)
      --chunkPages--> PageInput[][] (<=3 pages, <=3.6M chars)
      --parseChunks (3 in flight)--> POST /api/parse --> parseChunk --budgeted--> Super VL (JSON)
      <-- ParseResult per chunk  <---------------------- parseChunkOutput (zod)
buildExam + cropFigure --> Session --> localStorage
Practice: view question q --> fetchSolution(q), fetchSolution(next)
                             (3-slot queue) --> POST /api/solve --> solve --budgeted--> Ultra (JSON)
      <-- Solution  <----------------------------------- parseSolutionOutput (zod)
AskChat: send --> POST /api/ask --> askStream --reserve--> Lightning (stream)
      <-- text/plain chunks, accumulated into session.chats[q.id]
```

### Parse

1. `Intake` hands `File[]` to `App.start`, which creates a `Job` (files, source name, empty results).
2. `renderPages` (`lib/pages.ts`) opens every file. PDFs go through pdf.js in a module worker. Images go through `createImageBitmap`. Each page becomes a JPEG at 1400px on the long edge (quality 0.8, or 0.6 if over 1.4M chars) plus its text layer. Pages beyond 30 are dropped silently.
3. `chunkPages` groups pages into chunks of at most 3 pages and 3.6M characters, to stay under Vercel's 4.5 MB body limit.
4. `parseChunks` sends chunks with 3 workers. Results are written into `job.results` by index, so Retry resends only missing chunks. The first failure stops all workers and surfaces as the error phase.
5. `/api/parse` validates with `parseRequestSchema` (1 to 3 pages, `totalPages` at most 30, data-URL images, text at most 20,000 chars per page). `parseChunk` sends each page as a text part ("Page N" plus text layer) and an image part to the parse model with `response_format: json_schema` (loose), thinking off, temperature 0.1, `max_tokens` 12,000.
6. `parseChunkOutput` keeps the envelope and drops malformed questions one by one instead of failing the chunk. It normalizes labels, rejects duplicate labels, clamps figure boxes to 0..1, and runs `fenceBareCode` on prompts.
7. Back in `App.run`, `buildExam` concatenates questions in chunk order, merges answer keys by question number (first wins), renumbers 1..n only if numbers collide, and sets `answerSource` to `document` or `none`. Then `cropFigure` cuts each figure out of its page image. `newSession` builds the `Session`, which is saved and shown.

### Practice

`Practice` runs `useReducer(reduce, initial)` from `lib/session.ts` and saves the whole session on every state change. Actions: `choose`, `solution`, `goto`, `topic`, `chat`.

- Choosing an option on a question with a key sets `answered` with `correct` at once. Without a key it sets `checking` until a solution arrives.
- Keyboard: digits 1 to 9 or option letters choose, arrows move, Enter goes onward after answering. The listener is on `window`.
- The topic filter narrows `visibleQuestions` and keeps `current` inside the visible set.
- The solution panel shows once the question is answered, or when "Ask why" is pressed before answering (hint mode).

### Solve

On every change of current question, `Practice` requests solutions for the current and the next question if none exists yet. `fetchSolution` holds a module-level queue of 3 in flight. `/api/solve` calls the solve model with `reasoning_effort: "medium"` and `max_tokens` 8,000, passing the official answer when there is one. `parseSolutionOutput` rejects an answer that is not one of the option labels and keeps `whyNot` only for wrong labels.

When a solution lands for a question with no key, the reducer writes the model's answer into the question (`answerSource: "model"`) and resolves any `checking` attempt. Errors show "Try again", which only appears once the question is answered.

### Ask

`AskChat` is keyed by question id. `send` appends the user message and an empty assistant message, then streams. Before an answer, it sends no answer key and no solution, and the system prompt tells the tutor not to reveal the answer. After an answer, it sends the choice, the key and the worked solution. History is trimmed to the last 12 messages. The route streams `text/plain`; the client accumulates text and dispatches `chat` on every chunk. Any failure replaces the reply with a fixed apology line.

## 3. Domain types (`lib/types.ts`)

Domain:

- `Exam`: `id`, `title`, `course?`, `sourceName`, `pages`, `questions`.
- `Question`: `id` (`<examId>-<index>`), `number` (as printed), `topic`, `prompt` (Markdown subset), `options: Option[]`, `answer?`, `answerSource: "document" | "model" | "none"`, `figure?: { page, box }`.
- `Option`: `{ label, text }`. Labels are normalized to upper-case alphanumerics.
- `Box`: `[x0, y0, x1, y1]` as fractions of the page, origin top-left.
- `Solution`: `answer`, `explanation`, `steps[]`, `whyNot: Record<label, string>`.
- `ChatMessage`: `{ role: "user" | "assistant", content }`.

UI state (discriminated unions):

- `AttemptState`: `unanswered`, `checking { choice }`, `answered { choice, correct }`.
- `SolutionState`: `loading`, `ready { solution }`, `error { message }`.
- `Phase` (in `components/App.tsx`): `idle`, `reading`, `parsing`, `ready { session }`, `error { error }`.
- `Session` (in `lib/session.ts`): `exam`, `figures` (question id to JPEG data URL), `attempts`, `solutions`, `chats` (all keyed by question id), `current`, `topic` (`null` means all).

Errors: `ErrorKind` is `missing_key | rate_limited | unreadable | no_questions | too_large | budget | upstream`. `ApiError` is `{ kind, message }`. Every route returns `{ error: ApiError }` on failure.

Wire types: `PageInput`, `ParseRequest`, `ParsedQuestion`, `ParseResult` (with `answerKey` entries that may belong to other chunks), `SolveRequest`, `AskRequest`. The zod schemas in `lib/schema.ts` are the real gate. The types are hand-written next to them, not inferred, so the two can drift.

There is no course, no user, and no notion of more than one exam. The exam id is `Math.random` base 36.

## 4. Provider and spend layer

### `lib/llm.ts`

Provider choice happens once at module load:

| | Token Factory (when `NEBIUS_API_KEY` is set) | OpenRouter (fallback) |
| --- | --- | --- |
| Base URL | `https://api.tokenfactory.nebius.com/v1` | `LLM_BASE_URL` or `https://openrouter.ai/api/v1` |
| Key | `NEBIUS_API_KEY` | `LLM_API_KEY` |
| parse | `nvidia/Nemotron-3.5-Super-VL` | `MODEL_PARSE` or `nvidia/nemotron-3.5-super-vl:free` |
| solve | `nvidia/Nemotron-3-Ultra-550b-a55b` | `MODEL_SOLVE` or `nvidia/nemotron-3-ultra-550b-a55b:free` |
| fast (ask) | `nvidia/Nemotron-3_5-Lightning` | `MODEL_FAST` or `nvidia/nemotron-3.5-lightning:free` |
| Thinking off | `chat_template_kwargs: { enable_thinking: false }` | `reasoning: { enabled: false }` |

- Thinking is off for parse and ask, on for solve. The reason is measured and logged in `docs/decisions.tsv`.
- Mock mode: when the active provider has no key and `NODE_ENV` is not `production`, every call goes to `lib/mock.ts`. In production a missing key throws `missing_key`.
- One lazily created `OpenAI` client with `maxRetries: 4` and a 280s timeout. Routes set `maxDuration = 300`.
- `toApiError` maps errors to HTTP: `missing_key` 500, `budget` 402, 429 to `rate_limited`, 401/403 to `missing_key`, 413 to `too_large`, everything else 502 `upstream`.
- The three system prompts (`PARSE_SYSTEM`, `SOLVE_SYSTEM`, `askSystem`) live inline in this file.

### `lib/spend.ts`

Nebius budgets only send alerts, so the cap is enforced in-process.

- Cap: `Number(process.env.SPEND_CAP_USD || 30)`. `.env.local` does not set it today, so the cap in force is the $30 default.
- `reserve(model, inputTokens, maxOutputTokens)` prices the worst case, then, inside a promise queue that serializes ledger access within one Node process, checks `spent + live holds + worst > cap`. If over, it throws `BudgetExceeded`. Otherwise it writes a hold with a UUID and returns `settle`.
- `settle(usage)` removes the hold and adds the real cost from `usage`, or the worst case when usage is missing. It runs once.
- Holds older than 10 minutes stop counting (`HOLD_TTL_MS`), so a crash mid-call cannot lock the budget.
- Writes go to a temp file then `rename`, so a crash cannot leave half a ledger.
- Input tokens are estimated as characters / 3 plus 3,000 per image.
- Prices are USD per million tokens. Unknown model ids fall back to Ultra prices ($1 in, $3 out), so a renamed model errs toward over-counting.
- `spendStatus()` exists but nothing calls it. There is no route or UI that shows spend.

How the calls use it: `parseChunk` and `solve` go through `budgeted()`, which only reserves when the provider is Token Factory. `askStream` reserves by hand and settles in the stream's `finally` with the usage from the last chunk (`stream_options.include_usage`).

Worst-case reservation per call, from the code's own prices and limits:

| Role | Model | Max out | Worst case per call |
| --- | --- | --- | --- |
| parse (3 scanned pages) | Super VL ($0.30 / $0.90) | 12,000 | about $0.014, up to $0.02 with full text layers |
| solve | Ultra ($1 / $3) | 8,000 | about $0.025 |
| ask | Lightning ($0.06 / $0.24) | 1,500 | under $0.002 |

Real spend is far lower: 17 live calls cost $0.03 in total. The cap would still allow over 1,000 worst-case solves.

## 5. Persistence

Client: one key, `cue-practice:v1`, in `localStorage`, holding one `Session` as JSON.

- `saveSession` runs from a `useEffect` on every session change. That includes each streamed chunk of an Ask reply, and each save re-serializes the figure data URLs.
- Before saving and after loading, `settle` drops `loading` and `error` solutions, `checking` attempts and empty chat messages.
- On a quota error it retries without `figures`. If that fails too, it gives up silently.
- `loadSession` does `JSON.parse` and a cast, with no schema check and no migration. It only checks that `exam.questions` is non-empty.
- "New document" calls `clearSession`, which removes the key. Only one exam can exist at a time.

Server: `.data/spend-ledger.json` under `process.cwd()`. See section 4.

Nothing else persists. The original files, rendered pages and parse results live only in the `Job` ref during intake.

## 6. Styling

All styles are in `app/globals.css` (941 lines). Plain global CSS with flat class names (`.option`, `.tile`, `.solution-block`) and state carried in `data-state`, `data-role`, `data-dragging` and `data-figure` attributes. Components use `className` strings only; there is no CSS module and no inline style except the progress bar transform.

Tokens on `:root` (comment says they mirror the Paper file "Cue"):

| Token | Hex now | OKLCH equivalent |
| --- | --- | --- |
| `--color-page` | `#ffffff` | `oklch(100% 0 0)` |
| `--color-ink` | `#141414` | `oklch(19.1% 0 0)` |
| `--color-graphite` | `#6a6a66` | `oklch(52.3% 0.0062 106.6)` |
| `--color-rule` | `#e8e8e3` | `oklch(93.0% 0.0067 106.5)` |
| `--color-wash` | `#f6f6f3` | `oklch(97.2% 0.0040 106.5)` |
| `--color-fill` | `#efefeb` | `oklch(95.1% 0.0053 106.5)` |
| `--color-border` | `#d6d6d0` | `oklch(87.4% 0.0081 106.6)` |
| `--color-control` | `#e6e6e3` | `oklch(92.4% 0.0040 106.5)` |
| (inline, `.button.primary:hover`) | `#2c2c2a` | `oklch(29.2% 0.0036 106.6)` |

Other tokens: `--text-sm` 13px, `--text-lg` 20px, `--weight-regular` 420, `--weight-medium` 500, `--tracking-caps` 0.08em, `--tracking-display` -0.02em, `--radius-sm` 6px, `--radius-full` 999px, `--font-mono` (system mono stack), `--ease` `cubic-bezier(0.2, 0, 0, 1)`, `--gutter-x` 40px (16px under 720px). `--font-sans` comes from `next/font/local` in the layout.

Patterns worth carrying over: body text 13/20 at weight 420; titles 20/24 with -0.02em tracking; uppercase caps labels at 0.08em; 120ms color transitions on `--ease`; `rise` and `breathe` keyframes; a global `prefers-reduced-motion` kill switch; light mode only.

Hard-coded colors outside the tokens, which the plan's `check-tokens` gate will flag: `#2c2c2a` (primary hover), `%23141414` inside the select chevron SVG data URL, `#000` in three navigator `mask-image` gradients, `themeColor: "#FFFFFF"` in `app/layout.tsx`. `lib/pages.ts` also paints canvas backgrounds `#fff` and `#ffffff`, which is functional rather than styling.

Layout assumptions: `.practice` and `.shell` own the whole viewport (`height: 100dvh`, their own 28/40px padding). `.practice-body` uses negative inline margins to bleed its scrollbar to the window edge.

## 7. Test harness

Everything lives in `.verify/`, which is gitignored. None of it is in the repo. It has its own `package.json` (Playwright 1.64) and `node_modules`.

| Script | What it does |
| --- | --- |
| `browser.mjs` | Launches Chromium from a hard-coded path: `~/Library/Caches/ms-playwright/chromium_headless_shell-1243/...-mac-arm64/...`. |
| `verify.mjs` | The end-to-end check. At 1440x900 and 375x812: empty state, forced 429 on parse then Retry, parsing progress, parsed title and tiles, answer right by key "2", Ask reply streams, answer wrong by key "a" with whyNot hints, keyless Q4 graded by the model, Q5 figure crop, hint mode focuses the input, arrow navigation, reload keeps state, topic filter, no horizontal overflow, New document clears localStorage, no console errors. Prints PASS or FAIL. |
| `fidelity.mjs` | Captures practice states for comparison with Paper artboard "04 Practice". |
| `measure.mjs` | Prints boxes and computed type metrics for about 25 selectors on the practice screen. |
| `make-pdf.mjs` | Generates `sample-quiz.pdf` (5 questions, a tree figure, an answer key page missing Q4) and prints the figure box that `lib/mock.ts` hard-codes. |
| `prod-check.mjs` | Against a keyless production build, checks that the missing-key error shows. |
| `real-check.mjs` | Runs a real parse against a live key and logs every `/api/` response. |

How it runs: start a dev server with no API keys so mock mode is on, then `node verify.mjs <base-url> ../sample-quiz.pdf <out-dir>`. Screenshots from past runs sit in `.verify/` and `.verify/mock-run/`.

Coupling to watch: `verify.mjs` selects by class names (`.tile`, `.nav-topic`, `.question`, `.steps li`, `.option-hint`, `.figure img`, `.message[data-role=...]`), by `#topic-filter` with `selectOption` (works only on a native `<select>`), by an exact `h1` text, by `document.activeElement.className === "ask-input"`, and by `localStorage.length === 0`. The mock answers are tied to question numbers in the sample PDF.

There are no unit tests. `pnpm typecheck` is the only scripted gate in `package.json`. There is no `lint` script, which the plan's definition of done requires.

## 8. Keep / replace for Tailwind v4 + shadcn (Base UI) + IndexedDB + app shell

| Area | Verdict | Notes |
| --- | --- | --- |
| `lib/llm.ts` provider switch, error mapping, `budgeted` wrapper | Keep, extend | Becomes the provider layer for all roles. Move prompts into per-feature modules. Add roles (embeddings, speech) through the same config object. |
| `lib/spend.ts` reserve/settle logic and price table | Keep logic, replace the store | Swap the JSON file for a durable store before any deploy. Validate `SPEND_CAP_USD` at startup. Count SDK retries. See fragile items 1 to 5. |
| `lib/schema.ts` | Keep | zod at every boundary, tolerant model-output parsing and `extractJson` are reusable as is. Consider deriving `lib/types.ts` wire types with `z.infer`. |
| `lib/pages.ts` | Keep | Browser rendering and cropping are independent of UI. Calendar and lecture imports can reuse `renderPages`. |
| `lib/client.ts` | Keep | Chunking, resumable parse and the solve queue carry over. Add `AbortSignal` to solve and ask. |
| `lib/mock.ts` | Keep, grow | Keyless dev and the harness depend on it. New roles need mocks too. |
| `lib/session.ts` reducer and `buildExam` | Keep logic, replace storage | The reducer is pure and tested by the harness. `loadSession`/`saveSession`/`clearSession` go. |
| localStorage session | Replace | IndexedDB tables for exams, questions, attempts, solutions, chats and figures (as Blobs, not data URLs). Write per record, not the whole session per keystroke. Version the schema from day one. |
| `app/api/*` routes | Keep | Thin and correct. Add `req.signal` passthrough so a cancelled request stops the upstream call. |
| `app/globals.css` tokens | Replace | Move into Tailwind v4 `@theme` as OKLCH (table in section 6). Map to shadcn variables: `--background` page, `--foreground` ink, `--muted-foreground` graphite, `--border` border, `--secondary` control, `--muted` fill or wash, `--primary` ink. |
| `app/globals.css` component rules | Replace | Rebuild as utilities inside components. Keep the measured numbers (paddings, 56px option rows, 36px tiles, 2-column grids) because they match Paper. |
| `.button`, `.icon-button`, `.text-button` | Replace | shadcn `Button` variants: default (ink), secondary (control), ghost icon (round), link-like. |
| `.select` (native) | Replace | shadcn `Select` on Base UI. The harness `selectOption` call must change with it. |
| `.progress`, `.skeleton`, `.visually-hidden` | Replace | shadcn `Progress`, `Skeleton`, Tailwind `sr-only`. |
| `.option`, `.tile`, Navigator | Keep as custom components | No shadcn equivalent fits the Paper states. Port the `data-state` styling to Tailwind `data-[state=...]` variants. |
| `AskChat` | Keep behavior, restyle | Input becomes shadcn `Input` or `InputGroup`. Will likely become a shared chat component for study guide and lecture notes. |
| `Prose` | Keep for now | Enough for parser output. Replace only if new features need lists, headings or links. |
| `icons.tsx` | Replace | shadcn ships with `lucide-react`; use its chevrons. |
| `App.tsx` phase machine and `page.tsx` `ssr: false` | Replace | Intake and Practice become routes inside the shell. Keep only the practice island client-only, not the whole app. |
| `.practice` / `.shell` viewport layout | Replace | Size to the shell's content pane (`h-full`), not `100dvh`. Let the shell own gutters. |
| Global `keydown` in Practice | Replace | Scope shortcuts to the practice region or check focus within it. See fragile item 13. |
| Fonts and `layout.tsx` font setup | Keep | The 400 to 499 weight-range trick is load-bearing for the 420 body weight. |
| `Credit`, metadata title "Cue Practice" | Replace | App name becomes Cue. Credit moves to settings or the practice footer. |
| `.verify/harness` | Keep scenarios, move and rewrite | Move into `scripts/e2e/` under git. Use roles, labels or `data-testid` instead of class names. Use Playwright's default browser lookup. Replace the localStorage assertion with an IndexedDB check. |

## 9. Fragile points

Spend cap (most relevant to the $30 budget):

1. **The ledger only works on one long-lived local process.** It is a JSON file under `process.cwd()/.data`. On Vercel the deploy directory is read-only, so `write()` throws a plain error, `reserve` rejects, and every Token Factory call returns 502. Writing to `/tmp` would not help: each instance gets its own ledger and the cap stops holding. The promise queue also only serializes inside one process. `docs/decisions.tsv` already lists this as open.
2. **A non-numeric `SPEND_CAP_USD` turns the cap off.** `Number("$30")` and `Number("30usd")` are `NaN`, and `x > NaN` is always false, so `reserve` never throws. Validate it as a positive finite number at startup and fail closed.
3. **A missing or corrupt ledger reads as zero spend.** `read()` catches every error, including JSON parse errors and permission errors, and returns an empty ledger. Deleting `.data/` resets the budget.
4. **SDK retries are not counted.** `maxRetries: 4` means up to 5 upstream attempts run inside one reservation and settle as one call. A timed-out attempt can still bill. Also, 5 attempts at 280s each can outlast the 10-minute hold TTL, after which the hold stops counting while the call is still running.
5. **The cap only covers Token Factory.** The OpenRouter path skips `reserve` on the assumption that `:free` models cost nothing. Setting `MODEL_*` or `LLM_BASE_URL` to a paid model would spend with no cap.
6. **Budget errors are invisible in Practice.** Only Intake has budget copy. A 402 from solve shows "Couldn't get a worked solution." and a 402 from ask shows "Couldn't reach Nemotron Lightning." The Intake title also hard-codes "$30" instead of reading the configured cap.
7. **Solve prefetch is the main spender.** Each question visited triggers an Ultra call for it and for the next one, answered or not. Clicking through 30 tiles queues up to 30 solves.
8. **Cancelled requests still bill.** Routes do not pass `req.signal` to the SDK, so cancelling a parse in the UI leaves the upstream call running.

Client:

9. **Dense pages fail the whole run.** Text over 20,000 chars on one page fails zod with a 400, which shows as "Couldn't read that file" with no Retry.
10. **Saving on every change is heavy.** Each streamed Ask chunk re-serializes the whole session, figure data URLs included, into localStorage.
11. **localStorage is a single unversioned blob.** No validation on load, no migration, about 5 MB quota, and figures are dropped silently on overflow.
12. **Reload loses in-flight work.** A `checking` attempt (answered before the solution arrived) is dropped on reload, so the student's choice is lost.
13. **Global shortcuts will collide with the shell.** Letters and digits pick answers from anywhere outside inputs. In an app shell, sidebar navigation and Base UI popups (Select typeahead, menus) would also choose answers.
14. **Multi-file answer keys can cross-match.** Answer keys merge by printed number with first-wins before renumbering. With two files that both have a question 3, a key from one file can grade the other.
15. **Two concurrent asks on one question can clobber each other.** `AskChat` is keyed by question, so leaving and returning mid-stream resets `busy`. A second send then races the first, and each writes its own history snapshot.
16. **Types and schemas are maintained twice.** `lib/types.ts` wire types and `lib/schema.ts` zod schemas are written separately.
17. **The mock comment is stale.** `lib/mock.ts` says mocks run when `LLM_API_KEY` is empty. They actually run when the active provider has no key and `NODE_ENV` is not production.

Harness:

18. **The harness is not in git.** It and `sample-quiz.pdf` exist only on this machine. `browser.mjs` points at one Chromium build in one user's cache.
19. **Every restyle breaks `verify.mjs`.** It is bound to class names, a native select and localStorage (section 7).
