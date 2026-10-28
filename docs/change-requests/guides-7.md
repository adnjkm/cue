1. **Need**: a longer timeout on `lib/plan/schedule.test.ts` "never breaks a placement rule" (200 random calendars), which runs against vitest's 5000 ms default.
2. **Why**: on the shared machine (load average about 6) it took 4.96 s run alone and timed out at 5039 ms inside a full `pnpm test`, so the guides gate failed once on a test that no guides change touches; the rerun passed.
3. **Proposed diff**: `it("never breaks a placement rule", { timeout: 20_000 }, () => {` in place of `it("never breaks a placement rule", () => {`, keeping all 200 seeds.
4. **Workaround in use**: none; the guides gate reruns `pnpm test` when only this test timed out.
5. **Unblocks**: a `pnpm test` result in every worktree gate that does not depend on how busy the machine is.
