1. **Need**: an owner for `scripts/e2e/parakeet.mjs`: add it to the `lectures` globs in `workstreams.ts`.
2. **Why**: architecture 11.1 makes "scripts/e2e/parakeet.mjs exists (live-only)" part of the lectures done-check, but no workstream owns that path, so `check-ownership lectures` and `check-ownership --all` both fail on it.
3. **Proposed diff**: in `WORKSTREAMS`, lectures `owns` gains `"scripts/e2e/parakeet.mjs"`; then `git mv scripts/fixtures/lectures/parakeet.mjs scripts/e2e/parakeet.mjs` (its fixture path constant is relative to the repo root, so the move needs no edit).
4. **Workaround in use**: the live-only check lives at `scripts/fixtures/lectures/parakeet.mjs`, inside lectures' paths and outside the gate.
5. **Unblocks**: the lectures done-check item "scripts/e2e/parakeet.mjs exists".
