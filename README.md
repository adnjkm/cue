# Cue

Cue is a study app for university students. It plans study sessions around your timetable, takes notes in your lectures, opens the right slides and transcript when you sit down to study, turns old exams into practice, and writes a study guide from your own course material.

Cue runs on NVIDIA Nemotron models served by Nebius Token Factory. It was built for the Nebius × NVIDIA Global AI Hackathon, Best Apps and Agents track.

## What Cue does

- **Today.** A short brief of the day, the next session with its material already attached, and every study block, lecture and deadline in order. A missed block offers **Reschedule**.
- **Calendar.** Week, day and month views. Add your schedule as an `.ics` file or a photo or PDF of your timetable, and Cue plans review, mid-week and test-prep blocks around it. A lecture on the calendar offers **Take notes**.
- **Lecture notes.** Records a lecture, transcribes it live in the browser, flags exam hints ("this will be on Term Test 2"), links related coursework, and saves a summary, key points and your questions.
- **Study sessions.** A Pomodoro timer, a session plan, and the slides, transcript and textbook pages for the block, already open. Ask questions in Quick or Deep mode and get answers cited to your own material.
- **Practice.** Upload a multiple-choice test or practice paper, PDF or photo, and practice it in a clean interface with worked solutions. Ask Cue to write new questions on a topic.
- **Study guide.** One generated textbook per course, written from your lectures, slides, textbook and saved answers, with charts, formulas, exam warnings and footnotes back to the source.

All your data stays in your browser (IndexedDB). Only the text a task needs goes to the model.

## How Cue uses Nemotron on Token Factory

Every model call goes through one server route, `app/api/ai/[task]`, which talks to Token Factory's OpenAI-compatible API at `https://api.tokenfactory.nebius.com/v1`. Each task names a profile, and the profile picks the model and whether Nemotron thinks first. Model ids and prices live only in `lib/ai/models.ts`.

| Profile | Model on Token Factory | Thinking |
| --- | --- | --- |
| `vision` | `nvidia/Nemotron-3.5-Super-VL` | off |
| `reason` | `nvidia/Nemotron-3-Ultra-550b-a55b` | on |
| `chat` | `nvidia/Nemotron-3-Ultra-550b-a55b` | off |
| `fast` | `nvidia/Nemotron-3_5-Lightning` | off |
| `embed` | `Qwen/Qwen3-Embedding-8B` | n/a |

| Task | Profile | What it does |
| --- | --- | --- |
| `ask` | `chat` (Quick) or `reason` (Deep) | Answers a question in a study session, a lecture or a practice question, citing passages from your material |
| `embed` | `embed` | Embeds material chunks and questions for retrieval (BM25 and embeddings, fused) |
| `material.read` | `vision` | Reads slides and scanned pages whose text layer is missing |
| `calendar.read` | `vision` | Reads a photo or PDF of a timetable into courses and meeting times |
| `lecture.clean` | `fast` | Cleans transcript lines as they arrive |
| `lecture.hints` | `fast` | Flags exam hints and links them to tests and assignments |
| `lecture.notes` | `chat` | Writes the saved notes: summary and key points |
| `study.plan` | `reason` | Plans the steps of a study session within its focus minutes |
| `practice.parse` | `vision` | Turns exam pages into questions, options, answer keys and figures |
| `practice.solve` | `reason` | Writes a worked solution and why each wrong option is wrong |
| `practice.generate` | `reason` | Writes new questions grounded in course passages |
| `practice.check` | `chat` | Judges every option of a written question on its own; a question is kept only when its key, and nothing else, is correct |
| `guide.outline` | `reason` | Plans a course's study guide from its materials and lectures |
| `guide.section` | `chat` | Writes one guide section block by block, with footnotes to the sources |
| `today.brief` | `chat` | Writes the day's brief (a rule-based brief shows first and never waits for it) |

Live lecture transcription runs on NVIDIA Parakeet (`onnx-community/parakeet-ctc-0.6b-ONNX`) in a Web Worker in your browser, with WebGPU and a WASM fallback. The audio never leaves your device.

Two Token Factory findings shaped the server, both recorded with measurements in `docs/research/token-factory.md`:

- JSON tasks use `response_format` with a JSON schema derived from the task's zod schema, and with thinking on, the prompt also describes the JSON.
- The JSON grammar drops line breaks inside strings, so tasks whose output carries code or page text set `multiline` and get the schema in the prompt only.

## Spending cap

Every paid call reserves its worst-case cost against a hard cap before it starts and settles to the real usage after. The cap is `SPEND_CAP_USD` (default 30). A value that is not a plain positive number turns paid calls off. Locally the ledger is `.data/spend-ledger.json`; on Vercel it is Upstash Redis, and paid calls fail closed without it. The sidebar shows the spend.

## Run Cue locally

You need Node 20.9 or later and pnpm.

1. Install the dependencies:

	```bash
	pnpm install
	```

2. Copy `.env.example` to `.env.local` and set `NEBIUS_API_KEY` to a Token Factory key. Without a key, Cue uses OpenRouter's free Nemotron models when `LLM_API_KEY` is set.

3. Start the app:

	```bash
	pnpm dev
	```

4. Open `http://localhost:3000` and choose **Try the sample semester**, or upload your own calendar.

To run without any key, set `CUE_AI=mock`. Every task then returns a fixed, schema-valid answer.

## Check that it works

| Command | What it checks |
| --- | --- |
| `pnpm typecheck` | Types across the app |
| `pnpm lint` | ESLint, including the rules that keep each feature in its own files |
| `pnpm test` | Unit tests, including every task's example and mock against its own schema |
| `pnpm build` | The production build |
| `pnpm e2e --integrated` | Walks every screen's main path in Chromium against the production build, in mock mode |
| `pnpm check:tokens` | Every color is an OKLCH token, and Base UI is used only through `components/ui` |
| `pnpm check:nemotron` | Calls every task's example on Token Factory and checks each answer against its schema (spends a few cents) |

## How the code is organized

- `app/` holds the routes. `(browse)` screens keep the sidebar. `(focus)` screens (study session, lecture, practice) take the whole window.
- `features/<name>/` holds each screen's components, tasks and tests.
- `lib/` holds the shared core: `lib/db` (Dexie), `lib/plan` (the scheduler), `lib/ai` (tasks, the gateway and the ledger), `lib/retrieval`, `lib/chat` and `lib/sample` (the sample semester).
- `components/ui` holds the shadcn components (Base UI flavor), restyled to Cue.

`docs/architecture.md` is the design. `docs/decisions.tsv` is the decision log for the build.

## License

The code is under the MIT License (`LICENSE`). The Timeless Sans font files in `app/fonts` are under the Timeless Free Font License (`app/fonts/LICENSE.txt`).
