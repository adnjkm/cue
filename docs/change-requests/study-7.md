1. **Need**: a longer timeout on `lib/plan/schedule.test.ts` "never breaks a placement rule".
2. **Why**: the case checks 200 random calendars in about 7.7 s while six builders share 8 CPUs, so it trips vitest's 5000 ms default and fails `pnpm test` at random; run alone it passes in 3.5 s.
3. **Proposed diff**: pass a per-test timeout, `it("never breaks a placement rule", () => { … }, 60_000)`, and keep the 200 seeds.
4. **Workaround in use**: none in study's paths; a red run is retried, and the case passes alone with `--testTimeout=60000`.
5. **Unblocks**: a `pnpm test` gate that does not depend on how busy the machine is.
