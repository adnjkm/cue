1. **Need**: `lib/ai/mocks.test.ts` "covers the shared tasks and Practice's" to accept feature tasks instead of asserting the exact list of seven names.
2. **Why**: section 8.2 has every feature register its tasks; `guide.outline` and `guide.section` make the exact-list assertion fail, so `pnpm test` cannot pass in the guides gate (and will not in any feature worktree that defines a task).
3. **Proposed diff**: `expect(Object.keys(registry)).toEqual(expect.arrayContaining(["ask", "embed", "material.read", "practice.check", "practice.generate", "practice.parse", "practice.solve", "guide.outline", "guide.section"]))`, or derive the expected prefixes from `WORKSTREAMS[].tasks` and assert every name starts with one of them.
4. **Workaround in use**: none is possible inside the guides paths; in this worktree that one assertion fails and every other test, including the per-task `mock(example)` checks for both guide tasks, passes.
5. **Unblocks**: `pnpm test` in the guides gate.
