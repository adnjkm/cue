# Cue build plan

Cue is an AI study app for university students, built for the Nebius × NVIDIA hackathon (Best Apps and Agents track). It runs on NVIDIA Nemotron models served by Nebius Token Factory.

## Product scope (from the operator, 2026-10-27)

- **Today.** A summary of everything to do today, with ways into every feature.
- **Calendar.** Upload a course schedule or any calendar. Cue schedules study sessions around it. A lecture on the calendar offers the meeting note taker.
- **Lecture notes (note taker).** Records a lecture, transcribes it live, flags exam hints, links related coursework, saves notes.
- **Study sessions.** A Pomodoro timer, a session plan, and the right slides, transcripts and textbook pages already open.
- **Practice.** Upload multiple-choice tests and practice papers and get a clean practice interface. Ask the AI to write new questions.
- **Study guide.** All course material aggregated into one generated textbook.

The source of truth for the UI is the Paper file "Cue" (`01M5QGY708RKAFZ9Z5ZGY3D6AQ`), page "Core screens":

| Screen | Artboard |
| --- | --- |
| Today | `1-0` |
| Week calendar | `9F-0`, viewport `1CG-0` |
| Day calendar | `10F-1`, viewport `1N1-1` |
| Month calendar | `T4-1` |
| Study session | `55-0` |
| Practice | `IT-0` |
| Lecture notes | `22E-0` |
| Study guide | `27L-0` |

UI rules from the operator: shadcn components in the Base UI flavour, and every color in OKLCH.

## Definition of done

Each item is a check a script or a reviewer can rerun.

1. `pnpm typecheck`, `pnpm lint` and `pnpm build` pass.
2. `scripts/e2e/walkthrough.mjs` passes against the production build. It loads the sample semester, then walks every screen through its main path (listed per feature in `docs/architecture.md`).
3. `scripts/check-nemotron.mjs` calls every model role on Token Factory and checks each response shape. Without `NEBIUS_API_KEY` it runs on OpenRouter and reports Token Factory as INCONCLUSIVE.
4. `scripts/check-tokens.mjs` passes: no hex, rgb or hsl colors in app styles, and no component imports that bypass `components/ui`.
5. A judge compares each screen at 1440×900 with its Paper artboard and records the remaining differences.
6. The better-interface and emil-design-engineering passes leave no HIGH findings.

## Rigor

High. The operator is away and asked for an extremely high quality bar. Gates are a design bakeoff for the data model, a build and screenshot gate on every unit, and an adversarial review before hand-back. Deploying and publishing the repo wait for the operator.

## Phases

1. **Ground.** Parallel readers extract a measured spec from each Paper artboard, research shadcn with Base UI on Next 16 and Tailwind 4, and research the Token Factory model catalog (Nemotron chat, vision, speech, embeddings).
2. **Architect.** Two or more independent designs of the data model, module map, AI roles and routes. Judge, then synthesize into `docs/architecture.md`.
3. **Foundation** (one owner, blocking). Tailwind 4 and shadcn Base UI, OKLCH tokens, fonts, app shell and sidebar, IndexedDB store with every table, provider layer for Token Factory or OpenRouter, sample semester data, Practice moved into the shell, the e2e harness skeleton, and the check scripts.
4. **Features** (parallel, one worktree each, disjoint files). Today, Calendar with the scheduler and import, Lecture notes, Study session, Study guide, Practice question generation.
5. **Integrate.** Merge in order, rebuild, run the full walkthrough.
6. **Live model check** on Token Factory once the key is present.
7. **Review.** better-interface and emil-design-engineering per screen, adversarial verify of each finding, fix, re-verify.
8. **Hand back.** Decision trail audit, cross-model review of the trail, final report.

The decision trail is `docs/decisions.tsv`.
